package rss

import (
	"log"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
)

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
	fp := gofeed.NewParser()
	feed, err := fp.ParseURL(rssURL)
	if err != nil {
		return nil, err
	}

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
		} else if feed.Image != nil {
			imageURL = feed.Image.URL
		}

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
	return episodes, nil
}
