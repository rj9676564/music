package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// 播客封面来自第三方域名，部分有防盗链 / 非 HTTPS / 格式微信不支持，小程序又只能加载合法域名的图片，
// 所以统一由服务端抓取并落盘缓存，再以自己的域名返回。

const (
	imageCacheDir  = "./media_cache/img"
	imageMaxBytes  = 5 << 20
	imageCacheCtrl = "public, max-age=604800"
)

// registerImageProxy 注册 GET /api/image?guid=<episode guid> 或 ?channel=<channel id>
// 只接受标识，由服务端从数据库取地址，调用方不能指定任意 URL。
func registerImageProxy(app *pocketbase.PocketBase, e *core.ServeEvent) {
	e.Router.GET("/api/image", func(e *core.RequestEvent) error {
		q := e.Request.URL.Query()
		upstream := ""

		if guid := q.Get("guid"); guid != "" {
			ep, err := app.FindFirstRecordByData("episodes", "guid", guid)
			if err != nil {
				return e.NotFoundError("episode not found", err)
			}
			upstream = ep.GetString("image_url")
			// 单集没有封面时退回频道封面
			if upstream == "" {
				if ch, err := app.FindRecordById("channels", ep.GetString("channel_id")); err == nil {
					upstream = ch.GetString("image_url")
				}
			}
		} else if id := q.Get("channel"); id != "" {
			ch, err := app.FindRecordById("channels", id)
			if err != nil {
				return e.NotFoundError("channel not found", err)
			}
			upstream = ch.GetString("image_url")
		} else {
			return e.BadRequestError("guid or channel is required", nil)
		}
		if upstream == "" {
			return e.NotFoundError("no image", nil)
		}

		sum := sha256.Sum256([]byte(upstream))
		path := filepath.Join(imageCacheDir, hex.EncodeToString(sum[:]))

		if _, err := os.Stat(path); err != nil {
			if err := fetchImageToCache(e.Request, upstream, path); err != nil {
				log.Printf("image proxy: %s: %v", upstream, err)
				return e.JSON(http.StatusBadGateway, map[string]string{"error": "image unavailable"})
			}
		}

		// 缓存文件不带扩展名，ServeFile 会按内容嗅探 Content-Type
		e.Response.Header().Set("Cache-Control", imageCacheCtrl)
		http.ServeFile(e.Response, e.Request, path)
		return nil
	})
}

func fetchImageToCache(orig *http.Request, upstream, dest string) error {
	req, err := http.NewRequestWithContext(orig.Context(), http.MethodGet, upstream, nil)
	if err != nil || (req.URL.Scheme != "http" && req.URL.Scheme != "https") {
		return fmt.Errorf("invalid image url")
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; MoltenMusic/1.0)")

	resp, err := audioClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("upstream status %d", resp.StatusCode)
	}

	dir := filepath.Dir(dest)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, "tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())

	// 多读 1 字节用来判断是否超限
	n, err := io.Copy(tmp, io.LimitReader(resp.Body, imageMaxBytes+1))
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return err
	}
	if n > imageMaxBytes {
		return fmt.Errorf("image larger than %d bytes", imageMaxBytes)
	}

	// 只缓存真正的图片，避免把 HTML 错误页当封面
	head := make([]byte, 512)
	f, err := os.Open(tmp.Name())
	if err != nil {
		return err
	}
	m, _ := f.Read(head)
	f.Close()
	if ct := http.DetectContentType(head[:m]); !strings.HasPrefix(ct, "image/") {
		return fmt.Errorf("not an image (%s)", ct)
	}
	return os.Rename(tmp.Name(), dest)
}
