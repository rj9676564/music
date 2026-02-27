package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"molten-backend/internal/rss"
)

func main() {
	app := pocketbase.New()

	// 1. 初始化 (自动检查并创建 Collection)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		ensureCollections(app)
		return e.Next()
	})

	// 2. 注册自定义路由
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// --- 静态文件 ---
		e.Router.GET("/doc", func(e *core.RequestEvent) error {
			http.ServeFile(e.Response, e.Request, "doc.html")
			return nil
		})
		
		e.Router.GET("/media/{path...}", apis.Static(os.DirFS("./media_cache"), true))

		// --- API 兼容层 ---

		// 获取频道列表
		e.Router.GET("/api/channels", func(e *core.RequestEvent) error {
			records, err := app.FindRecordsByFilter("channels", "1=1", "name", 100, 0)
			if err != nil {
				return err
			}
			return e.JSON(http.StatusOK, records)
		})

		// 获取频道节目
		e.Router.GET("/api/channels/{id}/episodes", func(e *core.RequestEvent) error {
			channelID := e.Request.PathValue("id")
			channel, err := app.FindRecordById("channels", channelID)
			if err != nil {
				return apis.NewNotFoundError("Channel not found", err)
			}

			refresh := e.Request.URL.Query().Get("refresh") == "true"
			lastUpdate := channel.GetDateTime("updated_at").Time()
			if refresh || time.Since(lastUpdate) > 1*time.Hour {
				syncChannel(app, channel)
			}

			episodes, err := app.FindRecordsByFilter(
				"episodes",
				"channel_id = {:channelID}",
				"-pub_date",
				50, 0,
				dbx.Params{"channelID": channelID},
			)
			if err != nil {
				return err
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success":  true,
				"episodes": episodes,
			})
		})

		// 待转录列表
		e.Router.GET("/api/episodes/missing-srt", func(e *core.RequestEvent) error {
			twoDaysAgo := time.Now().AddDate(0, 0, -2).Format("2006-01-02 15:04:05")
			episodes, err := app.FindRecordsByFilter(
				"episodes",
				"srt_content = '' && (pub_date > {:twoDaysAgo} || transcription_status = 'pending')",
				"-pub_date",
				1, 0,
				dbx.Params{"twoDaysAgo": twoDaysAgo},
			)
			if err != nil {
				return err
			}
			return e.JSON(http.StatusOK, map[string]interface{}{
				"success":  true,
				"count":    len(episodes),
				"episodes": episodes,
			})
		})

		// 保存 SRT
		e.Router.POST("/api/save-srt", func(e *core.RequestEvent) error {
			var data struct {
				GUID       string `json:"guid"`
				SrtContent string `json:"srtContent"`
			}
			if err := e.BindBody(&data); err != nil {
				return err
			}

			record, err := app.FindFirstRecordByData("episodes", "guid", data.GUID)
			if err != nil {
				return apis.NewNotFoundError("Episode not found", nil)
			}

			record.Set("srt_content", data.SrtContent)
			record.Set("transcription_status", "completed")
			if err := app.Save(record); err != nil {
				return err
			}

			return e.JSON(http.StatusOK, map[string]bool{"success": true})
		})

		// 加入转录队列
		e.Router.POST("/api/queue-transcription", func(e *core.RequestEvent) error {
			var data struct {
				GUID     string `json:"guid"`
				AudioURL string `json:"audioUrl"`
				Title    string `json:"title"`
			}
			if err := e.BindBody(&data); err != nil {
				return err
			}

			record, err := app.FindFirstRecordByData("episodes", "guid", data.GUID)
			if err != nil {
				return apis.NewNotFoundError("Episode not found", nil)
			}

			// Do not override if completed
			if record.GetString("transcription_status") == "completed" {
				return e.JSON(http.StatusOK, map[string]interface{}{"success": true, "status": "already_completed"})
			}

			record.Set("transcription_status", "pending")
			if err := app.Save(record); err != nil {
				return err
			}

			return e.JSON(http.StatusOK, map[string]bool{"success": true})
		})

		// 摘要生成
		e.Router.POST("/api/summary", func(e *core.RequestEvent) error {
			var data struct {
				GUID       string `json:"guid"`
				SrtContent string `json:"srtContent"`
				APIKey     string `json:"apiKey"`
				APIBase    string `json:"apiBase"`
				Model      string `json:"model"`
			}
			if err := e.BindBody(&data); err != nil {
				return err
			}

			record, _ := app.FindFirstRecordByData("episodes", "guid", data.GUID)
			if record != nil && record.GetString("summary") != "" {
				return e.JSON(http.StatusOK, map[string]interface{}{
					"success": true,
					"summary": record.GetString("summary"),
					"cached":  true,
				})
			}

			summary, err := callLLMForSummary(data.SrtContent, data.APIKey, data.APIBase, data.Model)
			if err != nil {
				return apis.NewBadRequestError("Summary failed", err)
			}

			if record != nil {
				record.Set("summary", summary)
				app.Save(record)
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success": true,
				"summary": summary,
			})
		})

		return e.Next()
	})

	// 3. 定时任务
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		go startDailyRefresh(app)
		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func startDailyRefresh(app *pocketbase.PocketBase) {
	for {
		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day(), 7, 0, 0, 0, now.Location())
		if now.After(next) { next = next.Add(24 * time.Hour) }
		log.Printf("⏰ Daily RSS refresh scheduled for: %v", next)
		time.Sleep(time.Until(next))

		channels, err := app.FindRecordsByFilter("channels", "1=1", "name", 100, 0)
		if err == nil {
			for _, ch := range channels {
				syncChannel(app, ch)
			}
		}
	}
}

func syncChannel(app *pocketbase.PocketBase, channel *core.Record) {
	items, err := rss.FetchEpisodes(channel.GetString("rss"), 50)
	if err != nil {
		log.Printf("❌ RSS Sync failed: %v", err)
		return
	}

	collection, _ := app.FindCollectionByNameOrId("episodes")

	for _, item := range items {
		existing, _ := app.FindFirstRecordByData("episodes", "guid", item.GUID)
		var record *core.Record
		if existing != nil {
			record = existing
		} else {
			record = core.NewRecord(collection)
			record.Set("guid", item.GUID)
			record.Set("channel_id", channel.Id)
		}
		record.Set("title", item.Title)
		record.Set("link", item.Link)
		record.Set("pub_date", item.PubDate)
		record.Set("audio_url", item.AudioURL)
		
		app.Save(record)
	}
	channel.Set("updated_at", time.Now())
	app.Save(channel)
}

func callLLMForSummary(content, customKey, customBase, customModel string) (string, error) {
	apiKey, apiBase, model := customKey, customBase, customModel
	if apiKey == "" { apiKey = os.Getenv("OPENAI_API_KEY") }
	if apiBase == "" { apiBase = os.Getenv("OPENAI_API_BASE") }
	if apiBase == "" { apiBase = "https://api.openai.com/v1" }
	if model == "" { model = os.Getenv("OPENAI_MODEL") }
	if model == "" { model = "gpt-3.5-turbo" }

	if apiKey == "" { return "", fmt.Errorf("API Key missing") }
	text := content
	if len(text) > 8000 { text = text[:8000] }

	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{{"role": "user", "content": "Summary: " + text}},
	}
	jsonData, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", strings.TrimSuffix(apiBase, "/")+"/chat/completions", bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil { return "", err }
	defer resp.Body.Close()

	var result struct {
		Choices []struct { Message struct { Content string `json:"content"` } `json:"message"` } `json:"choices"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result.Choices) > 0 { return result.Choices[0].Message.Content, nil }
	return "", fmt.Errorf("LLM error")
}

// ptr 是一个简单的辅助函数，用于将字面量转换为指针 (兼容 PocketBase v0.23 API)
func ptr[T any](v T) *T {
	return &v
}

func ensureCollections(app *pocketbase.PocketBase) {
	// 1. 确保 channels 表存在
	channels, err := app.FindCollectionByNameOrId("channels")
	if err != nil {
		log.Println("👷 Creating 'channels' collection...")
		c := &core.Collection{}
		c.Name = "channels"
		c.Type = core.CollectionTypeBase
		c.ListRule = ptr("") // 允许公开读取
		c.ViewRule = ptr("")
		c.Fields.Add(&core.TextField{Name: "name", Required: true})
		c.Fields.Add(&core.URLField{Name: "rss", Required: true})
		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save channels collection: %v", err)
		}
		channels = c
	}

	// 2. 确保 episodes 表存在
	if _, err := app.FindCollectionByNameOrId("episodes"); err != nil {
		log.Println("👷 Creating 'episodes' collection...")
		c := &core.Collection{}
		c.Name = "episodes"
		c.Type = core.CollectionTypeBase
		c.ListRule = ptr("")
		c.ViewRule = ptr("")
		c.Fields.Add(&core.TextField{Name: "guid", Required: true})
		// 动态获取 channels 的 ID 进行关联
		if channels != nil {
			c.Fields.Add(&core.RelationField{
				Name:         "channel_id",
				CollectionId: channels.Id,
				MaxSelect:    1,
				Required:     true,
			})
		}
		c.Fields.Add(&core.TextField{Name: "title"})
		c.Fields.Add(&core.DateField{Name: "pub_date"})
		c.Fields.Add(&core.URLField{Name: "audio_url"})
		c.Fields.Add(&core.EditorField{Name: "srt_content"})
		c.Fields.Add(&core.EditorField{Name: "summary"})
		c.Fields.Add(&core.TextField{Name: "transcription_status"})
		
		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save episodes collection: %v", err)
		} else {
			log.Println("✅ episodes collection created successfully!")
		}
	}
}

