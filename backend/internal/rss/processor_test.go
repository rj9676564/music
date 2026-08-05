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
    <image>
      <url>http://example.com/channel-cover.jpg</url>
      <title>Mock Podcast Cover</title>
      <link>http://example.com/podcast</link>
    </image>
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
	// http 会被升级为 https：BBC 等 feed 给的是 http，混合内容会被拦截
	if ep.ImageURL != "https://example.com/channel-cover.jpg" {
		t.Errorf("Expected ImageURL https://example.com/channel-cover.jpg, got %s", ep.ImageURL)
	}
	if ep.Tags != "Tech" {
		t.Errorf("Expected Tags Tech, got %s", ep.Tags)
	}
}

func TestFetchFeedReturnsChannelMetadata(t *testing.T) {
	mockRSS := `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Mock Podcast</title>
    <description>A show about mocking</description>
    <itunes:author>Mock Author</itunes:author>
    <image><url>http://example.com/low-res.jpg</url></image>
    <itunes:image href="http://example.com/hi-res.jpg"/>
    <item>
      <title>Episode 1</title>
      <guid>episode-1</guid>
      <enclosure url="http://example.com/audio1.mp3" length="1" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml")
		w.Write([]byte(mockRSS))
	}))
	defer server.Close()

	info, episodes, err := FetchFeed(server.URL, 10)
	if err != nil {
		t.Fatalf("FetchFeed failed: %v", err)
	}

	if info.Title != "Mock Podcast" {
		t.Errorf("Title: got %q", info.Title)
	}
	if info.Author != "Mock Author" {
		t.Errorf("Author: got %q", info.Author)
	}
	if info.Description != "A show about mocking" {
		t.Errorf("Description: got %q", info.Description)
	}
	// itunes:image 分辨率更高，应优先于 <image>
	if info.ImageURL != "https://example.com/hi-res.jpg" {
		t.Errorf("ImageURL: expected the itunes:image upgraded to https, got %q", info.ImageURL)
	}
	// 单集没有自己的图时，回落到频道封面
	if len(episodes) != 1 || episodes[0].ImageURL != "https://example.com/hi-res.jpg" {
		t.Errorf("episode should fall back to channel art, got %q", episodes[0].ImageURL)
	}
}
