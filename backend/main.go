package main

import (
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"regexp"
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
			records, err := app.FindRecordsByFilter("channels", "1=1", "", 100, 0)
			if err != nil {
				return err
			}

			// 手动在内存中倒序排列 (如果集合本身没有加上创建时间字段限制)
			for i, j := 0, len(records)-1; i < j; i, j = i+1, j-1 {
				records[i], records[j] = records[j], records[i]
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

		// Flutter 动态页接口列表：配置独立存放，后续可替换为正式灰度/回滚接口
		e.Router.GET("/api/dynamic/interfaces", func(e *core.RequestEvent) error {
			records, err := app.FindRecordsByFilter("dynamic_interfaces", "1=1", "page_key", 200, 0)
			if err != nil {
				return err
			}

			interfaceItems := make([]map[string]interface{}, 0, len(records))
			for _, record := range records {
				if !isDynamicInterfaceEnabled(record.GetString("status")) {
					continue
				}
				interfaceItems = append(interfaceItems, dynamicInterfaceListItem(record))
			}

			if len(interfaceItems) == 0 {
				interfaceItems = append(interfaceItems, map[string]interface{}{"method": http.MethodGet, "url": ""})
			}

			interfacesJSON, err := json.Marshal(interfaceItems)
			if err != nil {
				return err
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"code":    0,
				"message": "success",
				"data": map[string]interface{}{
					"count":      len(interfaceItems),
					"interfaces": string(interfacesJSON),
				},
			})
		})

		// Flutter 动态页基础信息列表：只返回所有可用配置的基础元数据，不包含页面详情
		e.Router.GET("/api/dynamic/interfaces/basic-info", func(e *core.RequestEvent) error {
			records, err := app.FindRecordsByFilter("dynamic_interfaces", "1=1", "page_key", 200, 0)
			if err != nil {
				return err
			}

			items := make([]map[string]interface{}, 0, len(records))
			for _, record := range records {
				if !isDynamicInterfaceEnabled(record.GetString("status")) {
					continue
				}
				items = append(items, dynamicInterfaceBasicInfo(record))
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"code":    0,
				"message": "success",
				"data": map[string]interface{}{
					"count": len(items),
					"list":  items,
				},
			})
		})

		// Flutter 动态页接口详情：页面进入后按 pageKey 拉取完整 schema/js 配置
		e.Router.GET("/api/dynamic/interfaces/{key}", func(e *core.RequestEvent) error {
			key := strings.TrimSpace(e.Request.PathValue("key"))
			if key == "" {
				return apis.NewBadRequestError("pageKey is required", nil)
			}

			record, err := app.FindFirstRecordByData("dynamic_interfaces", "page_key", key)
			if err != nil || !isDynamicInterfaceEnabled(record.GetString("status")) {
				return apis.NewNotFoundError("Dynamic interface not found", err)
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"code":    0,
				"message": "success",
				"data":    dynamicInterfaceDetail(record),
			})
		})

		// Flutter 动态页接口新增/更新：按 page_key 写入配置
		e.Router.POST("/api/dynamic/interfaces", func(e *core.RequestEvent) error {
			var data struct {
				PageKey     string `json:"pageKey"`
				ClassName   string `json:"className"`
				Version     string `json:"version"`
				Status      string `json:"status"`
				Description string `json:"description"`
				Schema      string `json:"schema"`
				Js          string `json:"jsCode"`
				ApiMap      string `json:"apiMap"`
				Value       string `json:"initialData"`
			}
			if err := e.BindBody(&data); err != nil {
				return err
			}

			pageKey := strings.TrimSpace(data.PageKey)
			if pageKey == "" {
				return apis.NewBadRequestError("pageKey is required", nil)
			}

			collection, err := app.FindCollectionByNameOrId("dynamic_interfaces")
			if err != nil {
				return err
			}

			record, err := app.FindFirstRecordByData("dynamic_interfaces", "page_key", pageKey)
			if err != nil {
				record = core.NewRecord(collection)
				record.Set("page_key", pageKey)
			}

			if strings.TrimSpace(data.ClassName) != "" {
				record.Set("class_name", strings.TrimSpace(data.ClassName))
			}
			if strings.TrimSpace(data.Version) != "" {
				record.Set("version", strings.TrimSpace(data.Version))
			}
			if strings.TrimSpace(data.Status) != "" {
				record.Set("status", strings.TrimSpace(data.Status))
			}
			if strings.TrimSpace(data.Description) != "" {
				record.Set("description", strings.TrimSpace(data.Description))
			}
			if strings.TrimSpace(data.Schema) != "" {
				record.Set("schema", data.Schema)
			}
			if strings.TrimSpace(data.Js) != "" {
				record.Set("js", data.Js)
			}
			if strings.TrimSpace(data.ApiMap) != "" {
				record.Set("apiMap", data.ApiMap)
			}
			if strings.TrimSpace(data.Value) != "" {
				record.Set("value", data.Value)
			}

			if err := app.Save(record); err != nil {
				return err
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"code":    0,
				"message": "success",
				"data":    dynamicInterfaceDetail(record),
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

			// 转录完成后自动翻译，异步执行避免阻塞转录端
			go autoTranslateEpisode(app, data.GUID, data.SrtContent)

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

		// 歌词/字幕翻译：LLM 密钥只保存在服务端环境变量，客户端不传也不需要知道
		e.Router.POST("/api/translate", func(e *core.RequestEvent) error {
			var data struct {
				GUID       string `json:"guid"`
				SrtContent string `json:"srtContent"`
				TargetLang string `json:"targetLang"`
				Force      bool   `json:"force"`
			}
			if err := e.BindBody(&data); err != nil {
				return err
			}

			// 目标语言由服务端统一决定（TRANSLATE_TARGET_LANG），
			// 保证全站只翻一份、所有客户端复用同一译文
			targetLang := defaultTranslateLang()
			if reqLang := strings.TrimSpace(data.TargetLang); reqLang != "" && reqLang != targetLang {
				return apis.NewBadRequestError(
					fmt.Sprintf("targetLang must be %q (configured server-side via TRANSLATE_TARGET_LANG)", targetLang), nil)
			}

			record, _ := app.FindFirstRecordByData("episodes", "guid", data.GUID)

			// 命中缓存：同一目标语言且已有译文时直接返回
			if !data.Force && record != nil && record.GetString("translation") != "" &&
				record.GetString("translation_lang") == targetLang {
				return e.JSON(http.StatusOK, map[string]interface{}{
					"success":     true,
					"translation": record.GetString("translation"),
					"targetLang":  targetLang,
					"cached":      true,
				})
			}

			srtContent := data.SrtContent
			if strings.TrimSpace(srtContent) == "" && record != nil {
				srtContent = record.GetString("srt_content")
			}
			if strings.TrimSpace(srtContent) == "" {
				return apis.NewBadRequestError("srtContent is required", nil)
			}

			cfg, err := resolveLLMConfig("", "", "")
			if err != nil {
				return apis.NewBadRequestError("Translate failed: server LLM key not configured", err)
			}

			translation, err := translateSRT(srtContent, targetLang, cfg)
			if err != nil {
				if record != nil {
					record.Set("translation_status", "failed")
					app.Save(record)
				}
				return apis.NewBadRequestError("Translate failed", err)
			}

			// 译文是全站共享数据，写回后所有客户端复用
			if record != nil {
				record.Set("translation", translation)
				record.Set("translation_lang", targetLang)
				record.Set("translation_status", "completed")
				app.Save(record)
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success":     true,
				"translation": translation,
				"targetLang":  targetLang,
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
		if now.After(next) {
			next = next.Add(24 * time.Hour)
		}
		log.Printf("⏰ Daily RSS refresh scheduled for: %v", next)
		time.Sleep(time.Until(next))

		channels, err := app.FindRecordsByFilter("channels", "1=1", "", 100, 0)
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
		record.Set("image_url", item.ImageURL)

		app.Save(record)
	}
	channel.Set("updated_at", time.Now())
	app.Save(channel)
}

func callLLMForSummary(content, customKey, customBase, customModel string) (string, error) {
	cfg, err := resolveLLMConfig(customKey, customBase, customModel)
	if err != nil {
		return "", err
	}

	text := content
	if len(text) > 8000 {
		text = text[:8000]
	}

	return callLLMChat(cfg, "", "Summary: "+text, 60*time.Second)
}

// autoTranslateEpisode 在后台把刚保存的字幕翻译成目标语言，失败只记录日志不影响转录流程
func autoTranslateEpisode(app *pocketbase.PocketBase, guid, srtContent string) {
	if !autoTranslateEnabled() {
		return
	}

	cfg, err := resolveLLMConfig("", "", "")
	if err != nil {
		log.Printf("⏭️ Auto translate skipped (%s): %v", guid, err)
		return
	}

	record, err := app.FindFirstRecordByData("episodes", "guid", guid)
	if err != nil {
		log.Printf("⏭️ Auto translate skipped: episode %s not found", guid)
		return
	}
	if record.GetString("translation") != "" {
		return
	}

	targetLang := defaultTranslateLang()
	record.Set("translation_status", "pending")
	record.Set("translation_lang", targetLang)
	if err := app.Save(record); err != nil {
		log.Printf("❌ Auto translate failed to mark pending (%s): %v", guid, err)
		return
	}

	log.Printf("🌐 Auto translating episode %s -> %s", guid, targetLang)
	translation, err := translateSRT(srtContent, targetLang, cfg)

	// 重新拉取记录，避免覆盖翻译期间的其他写入
	record, findErr := app.FindFirstRecordByData("episodes", "guid", guid)
	if findErr != nil {
		log.Printf("❌ Auto translate: episode %s disappeared", guid)
		return
	}

	if err != nil {
		log.Printf("❌ Auto translate failed (%s): %v", guid, err)
		record.Set("translation_status", "failed")
		app.Save(record)
		return
	}

	record.Set("translation", translation)
	record.Set("translation_status", "completed")
	if err := app.Save(record); err != nil {
		log.Printf("❌ Auto translate failed to save (%s): %v", guid, err)
		return
	}
	log.Printf("✅ Auto translate completed for %s", guid)
}

func isDynamicInterfaceEnabled(status string) bool {
	status = strings.TrimSpace(strings.ToLower(status))
	return status == "" || status == "enabled" || status == "active"
}

func dynamicInterfaceListItem(record *core.Record) map[string]interface{} {
	pageKey := record.GetString("page_key")
	detailURL := "/api/dynamic/interfaces/" + pageKey

	return map[string]interface{}{
		"method": http.MethodGet,
		"url":    detailURL,
	}
}

func dynamicInterfaceBasicInfo(record *core.Record) map[string]interface{} {
	pageKey := record.GetString("page_key")

	return map[string]interface{}{
		"pageKey":     pageKey,
		"className":   record.GetString("class_name"),
		"version":     record.GetString("version"),
		"status":      normalizedDynamicInterfaceStatus(record.GetString("status")),
		"description": record.GetString("description"),
		"title":       dynamicInterfaceTitle(record),
		"method":      http.MethodGet,
		"url":         "/api/dynamic/interfaces/" + pageKey,
		"created":     record.GetDateTime("created").String(),
		"updated":     record.GetDateTime("updated").String(),
	}
}

func dynamicInterfaceDetail(record *core.Record) map[string]interface{} {
	schema := parseJSONObject(record.GetString("schema"))
	apiMap := parseJSONObject(record.GetString("apiMap"))
	initialData := parseJSONObject(record.GetString("value"))

	if len(apiMap) == 0 {
		apiMap = objectField(schema, "apiMap")
	}
	if len(initialData) == 0 {
		initialData = objectField(schema, "initialData")
	}

	delete(schema, "apiMap")
	delete(schema, "initialData")
	delete(schema, "jsCode")
	delete(schema, "scheme")

	return map[string]interface{}{
		"pageKey":     record.GetString("page_key"),
		"className":   record.GetString("class_name"),
		"status":      normalizedDynamicInterfaceStatus(record.GetString("status")),
		"description": record.GetString("description"),
		"method":      http.MethodGet,
		"updated":     record.GetDateTime("updated").String(),
		"version":     record.GetString("version"),
		"title":       dynamicInterfaceTitle(record),
		"schema":      schema,
		"jsCode":      record.GetString("js"),
		"apiMap":      apiMap,
		"initialData": initialData,
		"env":         "release",
	}
}

func dynamicInterfaceTitle(record *core.Record) string {
	title := strings.TrimSpace(record.GetString("description"))
	if title != "" {
		return title
	}

	title = strings.TrimSpace(record.GetString("class_name"))
	if title != "" {
		return title
	}

	return strings.TrimSpace(record.GetString("page_key"))
}

func normalizedDynamicInterfaceStatus(status string) string {
	status = strings.TrimSpace(status)
	if status == "" {
		return "enabled"
	}
	return status
}

func parseJSONObject(raw string) map[string]interface{} {
	raw = normalizeJSONEditorValue(raw)
	if raw == "" {
		return map[string]interface{}{}
	}

	var data map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &data); err != nil || data == nil {
		return map[string]interface{}{}
	}

	return data
}

var htmlTagPattern = regexp.MustCompile(`<[^>]+>`)

func normalizeJSONEditorValue(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	raw = strings.TrimSpace(html.UnescapeString(raw))
	if strings.HasPrefix(raw, "<") {
		raw = htmlTagPattern.ReplaceAllString(raw, "")
		raw = strings.TrimSpace(html.UnescapeString(raw))
	}

	return raw
}

func objectField(data map[string]interface{}, key string) map[string]interface{} {
	value, ok := data[key].(map[string]interface{})
	if !ok || value == nil {
		return map[string]interface{}{}
	}

	return value
}

func addTextFieldIfMissing(collection *core.Collection, name string, required bool) bool {
	if collection.Fields.GetByName(name) != nil {
		return false
	}
	collection.Fields.Add(&core.TextField{Name: name, Required: required})
	return true
}

func addEditorFieldIfMissing(collection *core.Collection, name string) bool {
	if collection.Fields.GetByName(name) != nil {
		return false
	}
	collection.Fields.Add(&core.EditorField{Name: name})
	return true
}

func ensureDynamicInterfacesCollection(app *pocketbase.PocketBase) {
	collection, err := app.FindCollectionByNameOrId("dynamic_interfaces")
	if err != nil {
		log.Println("👷 Creating 'dynamic_interfaces' collection...")
		c := &core.Collection{}
		c.Name = "dynamic_interfaces"
		c.Type = core.CollectionTypeBase
		c.ListRule = ptr("")
		c.ViewRule = ptr("")
		c.Fields.Add(&core.TextField{Name: "page_key", Required: true})
		c.Fields.Add(&core.TextField{Name: "class_name"})
		c.Fields.Add(&core.TextField{Name: "version"})
		c.Fields.Add(&core.TextField{Name: "status"})
		c.Fields.Add(&core.TextField{Name: "description"})
		c.Fields.Add(&core.EditorField{Name: "schema"})
		c.Fields.Add(&core.EditorField{Name: "js"})
		c.Fields.Add(&core.EditorField{Name: "apiMap"})
		c.Fields.Add(&core.EditorField{Name: "value"})

		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save dynamic_interfaces collection: %v", err)
		} else {
			log.Println("✅ dynamic_interfaces collection created successfully!")
		}
		return
	}

	changed := false
	changed = addTextFieldIfMissing(collection, "page_key", true) || changed
	changed = addTextFieldIfMissing(collection, "class_name", false) || changed
	changed = addTextFieldIfMissing(collection, "version", false) || changed
	changed = addTextFieldIfMissing(collection, "status", false) || changed
	changed = addTextFieldIfMissing(collection, "description", false) || changed
	changed = addEditorFieldIfMissing(collection, "schema") || changed
	changed = addEditorFieldIfMissing(collection, "js") || changed
	changed = addEditorFieldIfMissing(collection, "apiMap") || changed
	changed = addEditorFieldIfMissing(collection, "value") || changed

	if changed {
		if err := app.Save(collection); err != nil {
			log.Printf("❌ Failed to update dynamic_interfaces collection: %v", err)
		}
	}
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
	episodes, err := app.FindCollectionByNameOrId("episodes")
	if err != nil {
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
		c.Fields.Add(&core.URLField{Name: "image_url"})
		c.Fields.Add(&core.EditorField{Name: "srt_content"})
		c.Fields.Add(&core.EditorField{Name: "summary"})
		c.Fields.Add(&core.TextField{Name: "transcription_status"})
		c.Fields.Add(&core.EditorField{Name: "translation"})
		c.Fields.Add(&core.TextField{Name: "translation_lang"})
		c.Fields.Add(&core.TextField{Name: "translation_status"})

		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save episodes collection: %v", err)
		} else {
			log.Println("✅ episodes collection created successfully!")
		}
		episodes = c
	}

	if episodes != nil {
		changed := false
		if episodes.Fields.GetByName("image_url") == nil {
			episodes.Fields.Add(&core.URLField{Name: "image_url"})
			changed = true
		}
		if episodes.Fields.GetByName("translation") == nil {
			episodes.Fields.Add(&core.EditorField{Name: "translation"})
			changed = true
		}
		if episodes.Fields.GetByName("translation_lang") == nil {
			episodes.Fields.Add(&core.TextField{Name: "translation_lang"})
			changed = true
		}
		if episodes.Fields.GetByName("translation_status") == nil {
			episodes.Fields.Add(&core.TextField{Name: "translation_status"})
			changed = true
		}

		if changed {
			if err := app.Save(episodes); err != nil {
				log.Printf("❌ Failed to update episodes collection: %v", err)
			}
		}
	}

	// 3. 确保 dynamic_interfaces 表存在
	ensureDynamicInterfacesCollection(app)
}
