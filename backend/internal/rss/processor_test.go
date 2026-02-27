package rss

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchEpisodes(t *testing.T) {
	// Mock RSS feed content
	mockRSS := `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Mock Podcast</title>
    <item>
      <title>Episode 1</title>
      <guid>episode-1</guid>
      <pubDate>Wed, 26 Feb 2026 10:00:00 +0000</pubDate>
      <enclosure url="http://example.com/audio1.mp3" length="123456" type="audio/mpeg"/>
      <category>Tech</category>
    </item>
  </channel>
</rss>`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml")
		w.Write([]byte(mockRSS))
	}))
	defer server.Close()

	episodes, err := FetchEpisodes(server.URL, 10)
	if err != nil {
		t.Fatalf("Failed to fetch episodes: %v", err)
	}

	if len(episodes) != 1 {
		t.Errorf("Expected 1 episode, got %d", len(episodes))
	}

	ep := episodes[0]
	if ep.GUID != "episode-1" {
		t.Errorf("Expected GUID episode-1, got %s", ep.GUID)
	}
	if ep.AudioURL != "http://example.com/audio1.mp3" {
		t.Errorf("Expected AudioURL http://example.com/audio1.mp3, got %s", ep.AudioURL)
	}
	if ep.Tags != "Tech" {
		t.Errorf("Expected Tags Tech, got %s", ep.Tags)
	}
}
