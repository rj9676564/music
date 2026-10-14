package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// 音频地址来自 RSS，回环/内网地址必须被拒绝，否则代理会变成 SSRF 入口
func TestAudioClientBlocksLoopback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("secret"))
	}))
	defer srv.Close()

	resp, err := audioClient.Get(srv.URL)
	if err == nil {
		resp.Body.Close()
		t.Fatal("expected loopback request to be blocked")
	}
	if !strings.Contains(err.Error(), "blocked address") {
		t.Fatalf("unexpected error: %v", err)
	}
}
