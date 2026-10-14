package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"syscall"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// 小程序只能访问已备案、HTTPS 的合法域名，播客原始音频（第三方域名、HTTP、重定向、防盗链）
// 不能直接给 BackgroundAudioManager，所以统一经本接口转发。

// 上游响应里需要原样透传给客户端的头；Range 相关头缺失会导致拖动进度条失败
var audioPassHeaders = []string{
	"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified",
}

// audioClient 拒绝连接内网/回环地址：音频地址来自 RSS，不能让它指向服务器内部服务（SSRF）
var audioClient = &http.Client{
	Transport: &http.Transport{
		DialContext: (&net.Dialer{
			Timeout: 10 * time.Second,
			Control: func(_, address string, _ syscall.RawConn) error {
				host, _, err := net.SplitHostPort(address)
				if err != nil {
					return err
				}
				ip := net.ParseIP(host)
				if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
					ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
					return fmt.Errorf("blocked address %s", host)
				}
				return nil
			},
		}).DialContext,
		ResponseHeaderTimeout: 20 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
	},
	// 只限制到响应头为止；音频体可能很长，不能设整体超时
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return fmt.Errorf("too many redirects")
		}
		if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
			return fmt.Errorf("unsupported redirect scheme %q", req.URL.Scheme)
		}
		return nil
	},
}

// registerAudioProxy 注册 GET /api/audio?guid=<episode guid>
// 只接受 guid，由服务端从数据库取地址，调用方不能指定任意 URL。
func registerAudioProxy(app *pocketbase.PocketBase, e *core.ServeEvent) {
	e.Router.GET("/api/audio", func(e *core.RequestEvent) error {
		guid := e.Request.URL.Query().Get("guid")
		if guid == "" {
			return e.BadRequestError("guid is required", nil)
		}
		ep, err := app.FindFirstRecordByData("episodes", "guid", guid)
		if err != nil {
			return e.NotFoundError("episode not found", err)
		}

		// 1. 本地已缓存：交给 http.ServeFile，自带 Range / 条件请求支持
		if name := filepath.Base(ep.GetString("local_audio_path")); name != "." && name != string(filepath.Separator) {
			path := filepath.Join("./media_cache", name)
			if st, err := os.Stat(path); err == nil && !st.IsDir() {
				http.ServeFile(e.Response, e.Request, path)
				return nil
			}
		}

		// 2. 回源转发
		upstream := ep.GetString("audio_url")
		if upstream == "" {
			return e.NotFoundError("episode has no audio", nil)
		}
		req, err := http.NewRequestWithContext(e.Request.Context(), http.MethodGet, upstream, nil)
		if err != nil || (req.URL.Scheme != "http" && req.URL.Scheme != "https") {
			return e.BadRequestError("invalid audio url", err)
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; MoltenMusic/1.0)")
		for _, h := range []string{"Range", "If-Range", "If-None-Match", "If-Modified-Since"} {
			if v := e.Request.Header.Get(h); v != "" {
				req.Header.Set(h, v)
			}
		}

		resp, err := audioClient.Do(req)
		if err != nil {
			log.Printf("audio proxy: upstream error guid=%s: %v", guid, err)
			return e.JSON(http.StatusBadGateway, map[string]string{"error": "upstream unavailable"})
		}
		defer resp.Body.Close()

		for _, h := range audioPassHeaders {
			if v := resp.Header.Get(h); v != "" {
				e.Response.Header().Set(h, v)
			}
		}
		e.Response.WriteHeader(resp.StatusCode)
		if _, err := io.Copy(e.Response, resp.Body); err != nil {
			// 客户端中途断开（切歌、退出）很常见，不当作错误
			log.Printf("audio proxy: copy ended guid=%s: %v", guid, err)
		}
		return nil
	})
}
