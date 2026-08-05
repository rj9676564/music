package rss

import (
	"log"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
)

// FeedInfo 是 RSS 的频道级元数据，用于补全 channels 记录
type FeedInfo struct {
	Title       string
	Author      string
	Description string
	ImageURL    string
}

type EpisodeData struct {
	GUID        string
	Title       string
	Description string
	Link        string
	PubDate     time.Time
	AudioURL    string
	ImageURL    string
	Tags        string
}

// FetchEpisodes parses the RSS feed and returns a list of EpisodeData
func FetchEpisodes(rssURL string, limit int) ([]EpisodeData, error) {
	_, episodes, err := FetchFeed(rssURL, limit)
	return episodes, err
}

// FetchFeed 同时返回频道级元数据与单集列表
func FetchFeed(rssURL string, limit int) (FeedInfo, []EpisodeData, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseURL(rssURL)
	if err != nil {
		return FeedInfo{}, nil, err
	}

	info := FeedInfo{Title: feed.Title, Description: feed.Description}
	if feed.Image != nil {
		info.ImageURL = feed.Image.URL
	}
	if feed.ITunesExt != nil {
		// itunes:image 通常比 <image> 分辨率更高，优先采用
		if feed.ITunesExt.Image != "" {
			info.ImageURL = feed.ITunesExt.Image
		}
		info.Author = feed.ITunesExt.Author
	}
	if info.Author == "" && feed.Author != nil {
		info.Author = feed.Author.Name
	}
	// BBC 等站点在 feed 里给的是 http，混合内容会被浏览器拦掉
	info.ImageURL = strings.Replace(info.ImageURL, "http://", "https://", 1)

	itemsToProcess := feed.Items
	if len(itemsToProcess) > limit {
		itemsToProcess = itemsToProcess[:limit]
	}

	var episodes []EpisodeData
	for _, item := range itemsToProcess {
		pubDate := time.Now()
		if item.Published != "" && item.PublishedParsed != nil {
			pubDate = *item.PublishedParsed
		}

		audioURL := ""
		if len(item.Enclosures) > 0 {
			audioURL = item.Enclosures[0].URL
		}

		imageURL := ""
		if item.Image != nil {
			imageURL = item.Image.URL
		} else if item.ITunesExt != nil && item.ITunesExt.Image != "" {
			imageURL = item.ITunesExt.Image
		} else {
			imageURL = info.ImageURL
		}
		imageURL = strings.Replace(imageURL, "http://", "https://", 1)

		episodes = append(episodes, EpisodeData{
			GUID:        item.GUID,
			Title:       item.Title,
			Description: item.Description,
			Link:        item.Link,
			PubDate:     pubDate,
			AudioURL:    audioURL,
			ImageURL:    imageURL,
			Tags:        strings.Join(item.Categories, ","),
		})
	}

	log.Printf("✅ Parsed %d episodes from %s", len(episodes), rssURL)
	return info, episodes, nil
}
