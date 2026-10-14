package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// 测试服务跑在回环地址上，需要临时换掉带 SSRF 防护的客户端
func useDefaultClient(t *testing.T) {
	old := audioClient
	audioClient = http.DefaultClient
	t.Cleanup(func() { audioClient = old })
}

func TestFetchImageToCache(t *testing.T) {
	useDefaultClient(t)
	dir := t.TempDir()
	png := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok.png":
			w.Write(png)
		case "/page":
			w.Write([]byte("<html><body>blocked by hotlink protection</body></html>"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	ok := filepath.Join(dir, "ok")
	if err := fetchImageToCache(req, srv.URL+"/ok.png", ok); err != nil {
		t.Fatalf("expected image to be cached: %v", err)
	}
	if b, _ := os.ReadFile(ok); string(b) != string(png) {
		t.Fatal("cached content differs from upstream")
	}

	for _, p := range []string{"/page", "/missing"} {
		dest := filepath.Join(dir, "bad"+p[1:])
		if err := fetchImageToCache(req, srv.URL+p, dest); err == nil {
			t.Fatalf("%s: expected error", p)
		}
		if _, err := os.Stat(dest); err == nil {
			t.Fatalf("%s: non-image must not be cached", p)
		}
	}
}
