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
	"sync"
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

		// 更新频道配置（如修改 auto_convert、name 等）
		e.Router.PATCH("/api/channels/{id}", func(e *core.RequestEvent) error {
			channelID := e.Request.PathValue("id")
			channel, err := app.FindRecordById("channels", channelID)
			if err != nil {
				return apis.NewNotFoundError("Channel not found", err)
			}

			var data struct {
				AutoConvert *bool   `json:"auto_convert"`
				Name        *string `json:"name"`
				Description *string `json:"description"`
				Author      *string `json:"author"`
				ImageURL    *string `json:"image_url"`
			}
			if err := e.BindBody(&data); err != nil {
				return apis.NewBadRequestError("Invalid request body", err)
			}

			if data.AutoConvert != nil {
				channel.Set("auto_convert", *data.AutoConvert)
			}
			if data.Name != nil {
				channel.Set("name", *data.Name)
			}
			if data.Description != nil {
				channel.Set("description", *data.Description)
			}
			if data.Author != nil {
				channel.Set("author", *data.Author)
			}
			if data.ImageURL != nil {
				channel.Set("image_url", *data.ImageURL)
			}

			if err := app.Save(channel); err != nil {
				return apis.NewBadRequestError("Failed to update channel", err)
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success": true,
				"channel": channel,
			})
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

		// 待转录列表（兼容老 worker，内部使用原子 claim 机制）
		e.Router.GET("/api/episodes/missing-srt", func(e *core.RequestEvent) error {
			job, err := claimTranscriptionJob(app, "legacy-missing-srt-client", 15*time.Minute)
			if err != nil {
				return err
			}
			if job == nil {
				return e.JSON(http.StatusOK, map[string]interface{}{
					"success":  true,
					"count":    0,
					"episodes": []interface{}{},
				})
			}

			episodeMap := map[string]interface{}{
				"id":                   job.Id,
				"guid":                 job.GetString("episode_guid"),
				"channel_id":           job.GetString("channel_id"),
				"title":                job.GetString("title"),
				"audio_url":            job.GetString("audio_url"),
				"transcription_status": job.GetString("status"),
				"srt_content":          job.GetString("srt_content"),
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success":  true,
				"count":    1,
				"episodes": []interface{}{episodeMap},
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

		// 保存 SRT (兼容旧接口)
		e.Router.POST("/api/save-srt", func(e *core.RequestEvent) error {
			var data struct {
				GUID       string `json:"guid"`
				SrtContent string `json:"srtContent"`
			}
			if err := e.BindBody(&data); err != nil {
				return err
			}

			if err := completeTranscriptionJob(app, data.GUID, data.SrtContent); err != nil {
				return apis.NewNotFoundError("Episode not found", err)
			}

			return e.JSON(http.StatusOK, map[string]bool{"success": true})
		})

		// 加入转录队列 (兼容旧接口)
		e.Router.POST("/api/queue-transcription", func(e *core.RequestEvent) error {
			var data struct {
				GUID     string `json:"guid"`
				AudioURL string `json:"audioUrl"`
				Title    string `json:"title"`
			}
			if err := e.BindBody(&data); err != nil {
				return err
			}

			job, created, err := enqueueTranscriptionJob(app, data.GUID, data.AudioURL, data.Title, "", 10)
			if err != nil {
				return apis.NewBadRequestError("Failed to queue transcription", err)
			}
			if job == nil && !created {
				return e.JSON(http.StatusOK, map[string]interface{}{"success": true, "status": "already_completed"})
			}

			return e.JSON(http.StatusOK, map[string]bool{"success": true})
		})

		// --- 转录任务队列 API ---
		// 1. 新增/入队任务
		e.Router.POST("/api/transcription-jobs", func(e *core.RequestEvent) error {
			var data struct {
				GUID     string `json:"guid"`
				AudioURL string `json:"audioUrl"`
				Title    string `json:"title"`
				Priority int    `json:"priority"`
			}
			if err := e.BindBody(&data); err != nil {
				return apis.NewBadRequestError("Invalid request body", err)
			}

			priority := data.Priority
			if priority <= 0 {
				priority = 10
			}

			job, created, err := enqueueTranscriptionJob(app, data.GUID, data.AudioURL, data.Title, "", priority)
			if err != nil {
				return apis.NewBadRequestError("Failed to enqueue job", err)
			}
			if job == nil && !created {
				return e.JSON(http.StatusOK, map[string]interface{}{
					"success": true,
					"status":  "already_completed",
				})
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success": true,
				"status":  job.GetString("status"),
				"job":     job,
			})
		})

		// 2. worker 原子领任务 (Lease 机制)
		e.Router.POST("/api/transcription-jobs/claim", func(e *core.RequestEvent) error {
			var data struct {
				WorkerID     string `json:"workerId"`
				LeaseSeconds int    `json:"leaseSeconds"`
			}
			_ = e.BindBody(&data)

			lease := 10 * time.Minute
			if data.LeaseSeconds > 0 {
				lease = time.Duration(data.LeaseSeconds) * time.Second
			}

			job, err := claimTranscriptionJob(app, data.WorkerID, lease)
			if err != nil {
				return apis.NewBadRequestError("Failed to claim job", err)
			}

			if job == nil {
				return e.JSON(http.StatusOK, map[string]interface{}{
					"success": true,
					"job":     nil,
				})
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success": true,
				"job":     job,
			})
		})

		// 3. 转录完成提交
		completeJobHandler := func(e *core.RequestEvent) error {
			var data struct {
				JobID      string `json:"jobId"`
				GUID       string `json:"guid"`
				SrtContent string `json:"srtContent"`
			}
			if err := e.BindBody(&data); err != nil {
				return apis.NewBadRequestError("Invalid request body", err)
			}

			guid := strings.TrimSpace(data.GUID)
			if guid == "" && data.JobID != "" {
				if job, _ := app.FindRecordById("transcription_jobs", data.JobID); job != nil {
					guid = job.GetString("episode_guid")
				}
			}
			if guid == "" {
				idParam := e.Request.PathValue("id")
				if idParam != "" {
					if job, _ := app.FindRecordById("transcription_jobs", idParam); job != nil {
						guid = job.GetString("episode_guid")
					}
				}
			}

			if guid == "" {
				return apis.NewBadRequestError("guid or jobId is required", nil)
			}

			if err := completeTranscriptionJob(app, guid, data.SrtContent); err != nil {
				return apis.NewBadRequestError("Failed to complete job", err)
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success": true,
			})
		}
		e.Router.POST("/api/transcription-jobs/complete", completeJobHandler)
		e.Router.POST("/api/transcription-jobs/{id}/complete", completeJobHandler)

		// 4. 转录失败上报 (重试或标记失败)
		failJobHandler := func(e *core.RequestEvent) error {
			var data struct {
				JobID string `json:"jobId"`
				GUID  string `json:"guid"`
				Error string `json:"error"`
			}
			if err := e.BindBody(&data); err != nil {
				return apis.NewBadRequestError("Invalid request body", err)
			}

			guid := strings.TrimSpace(data.GUID)
			if guid == "" && data.JobID != "" {
				if job, _ := app.FindRecordById("transcription_jobs", data.JobID); job != nil {
					guid = job.GetString("episode_guid")
				}
			}
			if guid == "" {
				idParam := e.Request.PathValue("id")
				if idParam != "" {
					if job, _ := app.FindRecordById("transcription_jobs", idParam); job != nil {
						guid = job.GetString("episode_guid")
					}
				}
			}

			if guid == "" {
				return apis.NewBadRequestError("guid or jobId is required", nil)
			}

			if err := failTranscriptionJob(app, guid, data.Error); err != nil {
				return apis.NewBadRequestError("Failed to mark job failure", err)
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success": true,
			})
		}
		e.Router.POST("/api/transcription-jobs/fail", failJobHandler)
		e.Router.POST("/api/transcription-jobs/{id}/fail", failJobHandler)

		// 5. 任务列表查询
		e.Router.GET("/api/transcription-jobs", func(e *core.RequestEvent) error {
			status := strings.TrimSpace(e.Request.URL.Query().Get("status"))
			filter := "1=1"
			params := dbx.Params{}
			if status != "" {
				filter = "status = {:status}"
				params["status"] = status
			}

			jobs, err := app.FindRecordsByFilter("transcription_jobs", filter, "-created", 100, 0, params)
			if err != nil {
				return err
			}

			return e.JSON(http.StatusOK, map[string]interface{}{
				"success": true,
				"count":   len(jobs),
				"jobs":    jobs,
			})
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

			// 翻译一集要几十次 LLM 调用、耗时数分钟，同步返回必然被反向代理
			// 判超时（nginx 默认 60s）。这里只登记任务并立刻返回 202，
			// 客户端轮询 translation_status 获取结果。
			if err := startTranslation(app, data.GUID, srtContent, targetLang); err != nil {
				return apis.NewBadRequestError("Translate failed", err)
			}

			return e.JSON(http.StatusAccepted, map[string]interface{}{
				"success":    true,
				"status":     "pending",
				"targetLang": targetLang,
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
	info, items, err := rss.FetchFeed(channel.GetString("rss"), 50)
	if err != nil {
		log.Printf("❌ RSS Sync failed: %v", err)
		return
	}

	// 频道封面/简介来自 RSS，仅在本地为空时回填，
	// 不覆盖用户在后台手动改过的内容
	if channel.GetString("image_url") == "" && info.ImageURL != "" {
		channel.Set("image_url", info.ImageURL)
	}
	if channel.GetString("description") == "" && info.Description != "" {
		channel.Set("description", info.Description)
	}
	if channel.GetString("author") == "" && info.Author != "" {
		channel.Set("author", info.Author)
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
		if item.Duration > 0 {
			record.Set("duration", item.Duration)
		}

		app.Save(record)

		// 若频道开启了自动转换，自动加入待转录任务表
		if channel.GetBool("auto_convert") {
			twoDaysAgo := time.Now().UTC().AddDate(0, 0, -2)
			if item.PubDate.After(twoDaysAgo) && record.GetString("srt_content") == "" && record.GetString("transcription_status") != "completed" {
				_, _, _ = enqueueTranscriptionJob(app, item.GUID, item.AudioURL, item.Title, channel.Id, 0)
			}
		}
	}
	channel.Set("updated_at", time.Now())
	app.Save(channel)
}

// enqueueTranscriptionJob 加入持久化转录任务表
func enqueueTranscriptionJob(app *pocketbase.PocketBase, guid, audioURL, title, channelID string, priority int) (*core.Record, bool, error) {
	guid = strings.TrimSpace(guid)
	if guid == "" {
		return nil, false, fmt.Errorf("guid is required")
	}

	ep, _ := app.FindFirstRecordByData("episodes", "guid", guid)
	if ep != nil {
		if ep.GetString("srt_content") != "" || ep.GetString("transcription_status") == "completed" {
			return nil, false, nil // 已完成
		}
		if audioURL == "" {
			audioURL = ep.GetString("audio_url")
		}
		if title == "" {
			title = ep.GetString("title")
		}
		if channelID == "" {
			channelID = ep.GetString("channel_id")
		}
	}

	jobCollection, err := app.FindCollectionByNameOrId("transcription_jobs")
	if err != nil {
		return nil, false, err
	}

	existingJob, _ := app.FindFirstRecordByData("transcription_jobs", "episode_guid", guid)
	var job *core.Record
	if existingJob != nil {
		if existingJob.GetString("status") == "completed" {
			return existingJob, false, nil
		}
		job = existingJob
		curPriority := job.GetInt("priority")
		if priority > curPriority {
			job.Set("priority", priority)
		}
	} else {
		job = core.NewRecord(jobCollection)
		job.Set("episode_guid", guid)
		job.Set("max_attempts", 3)
		job.Set("priority", priority)
	}

	if channelID != "" {
		job.Set("channel_id", channelID)
	}
	if title != "" {
		job.Set("title", title)
	}
	if audioURL != "" {
		job.Set("audio_url", audioURL)
	}
	job.Set("status", "pending")
	job.Set("attempts", 0)
	job.Set("last_error", "")
	job.Set("locked_by", "")
	job.Set("locked_at", nil)

	if err := app.Save(job); err != nil {
		return nil, false, err
	}

	if ep != nil {
		ep.Set("transcription_status", "pending")
		_ = app.Save(ep)
	}

	return job, true, nil
}

// claimTranscriptionJob 原子认领一条待转录任务（并回收超时 processing 任务）
func claimTranscriptionJob(app *pocketbase.PocketBase, workerID string, leaseDuration time.Duration) (*core.Record, error) {
	if workerID == "" {
		workerID = "default-worker"
	}
	if leaseDuration <= 0 {
		leaseDuration = 10 * time.Minute
	}

	// 1. 回收超时 processing 任务
	expiredCutoff := time.Now().UTC().Add(-leaseDuration).Format("2006-01-02 15:04:05.000Z")
	staleJobs, err := app.FindRecordsByFilter(
		"transcription_jobs",
		"status = 'processing' && locked_at != '' && locked_at != null && locked_at < {:cutoff}",
		"-locked_at",
		50, 0,
		dbx.Params{"cutoff": expiredCutoff},
	)
	if err == nil {
		for _, staleJob := range staleJobs {
			attempts := staleJob.GetInt("attempts")
			maxAttempts := staleJob.GetInt("max_attempts")
			if maxAttempts <= 0 {
				maxAttempts = 3
			}

			if attempts >= maxAttempts {
				staleJob.Set("status", "failed")
				staleJob.Set("last_error", "Lease expired and max attempts reached")
				_ = app.Save(staleJob)
				if ep, _ := app.FindFirstRecordByData("episodes", "guid", staleJob.GetString("episode_guid")); ep != nil {
					ep.Set("transcription_status", "failed")
					_ = app.Save(ep)
				}
			} else {
				staleJob.Set("status", "pending")
				staleJob.Set("locked_by", "")
				staleJob.Set("last_error", "Lease expired, rescheduled for retry")
				_ = app.Save(staleJob)
				if ep, _ := app.FindFirstRecordByData("episodes", "guid", staleJob.GetString("episode_guid")); ep != nil {
					ep.Set("transcription_status", "pending")
					_ = app.Save(ep)
				}
			}
		}
	}

	// 2. 从 transcription_jobs 表中查找待转录任务
	pendingJobs, _ := app.FindRecordsByFilter(
		"transcription_jobs",
		"status = 'pending' && attempts < 3",
		"-priority,created",
		1, 0,
	)

	var claimed *core.Record
	if len(pendingJobs) > 0 {
		claimed = pendingJobs[0]
	} else {
		// 3. Fallback: 检查是否有 episodes 表中的遗留/自动转录单集
		twoDaysAgo := time.Now().UTC().AddDate(0, 0, -2).Format("2006-01-02 15:04:05.000Z")
		legacyEpisodes, _ := app.FindRecordsByFilter(
			"episodes",
			"(srt_content = '' || srt_content = null) && transcription_status != 'completed' && transcription_status != 'failed' && (transcription_status = 'pending' || (channel_id.auto_convert = true && pub_date > {:twoDaysAgo}))",
			"-transcription_status,-pub_date",
			1, 0,
			dbx.Params{"twoDaysAgo": twoDaysAgo},
		)
		if len(legacyEpisodes) > 0 {
			ep := legacyEpisodes[0]
			priority := 0
			if ep.GetString("transcription_status") == "pending" {
				priority = 10
			}
			job, _, _ := enqueueTranscriptionJob(app, ep.GetString("guid"), ep.GetString("audio_url"), ep.GetString("title"), ep.GetString("channel_id"), priority)
			claimed = job
		}
	}

	if claimed == nil {
		return nil, nil
	}

	// 原子标记为 processing 并增加 attempts
	claimed.Set("status", "processing")
	claimed.Set("locked_at", time.Now().UTC().Format("2006-01-02 15:04:05.000Z"))
	claimed.Set("locked_by", workerID)
	claimed.Set("attempts", claimed.GetInt("attempts")+1)
	if err := app.Save(claimed); err != nil {
		return nil, err
	}

	if ep, _ := app.FindFirstRecordByData("episodes", "guid", claimed.GetString("episode_guid")); ep != nil {
		ep.Set("transcription_status", "processing")
		_ = app.Save(ep)
	}

	return claimed, nil
}

// completeTranscriptionJob 完成转录并落盘字幕
func completeTranscriptionJob(app *pocketbase.PocketBase, guid, srtContent string) error {
	guid = strings.TrimSpace(guid)
	if guid == "" {
		return fmt.Errorf("guid is required")
	}

	// 1. 更新 episodes
	ep, err := app.FindFirstRecordByData("episodes", "guid", guid)
	if err == nil && ep != nil {
		ep.Set("srt_content", srtContent)
		ep.Set("transcription_status", "completed")
		_ = app.Save(ep)
	}

	// 2. 更新 transcription_jobs
	job, err := app.FindFirstRecordByData("transcription_jobs", "episode_guid", guid)
	if err == nil && job != nil {
		job.Set("status", "completed")
		job.Set("completed_at", time.Now().UTC().Format("2006-01-02 15:04:05.000Z"))
		job.Set("last_error", "")
		job.Set("srt_content", srtContent)
		_ = app.Save(job)
	}

	// 3. 转录完成后自动翻译，异步执行避免阻塞转录端
	go autoTranslateEpisode(app, guid, srtContent)

	return nil
}

// failTranscriptionJob 记录转录失败
func failTranscriptionJob(app *pocketbase.PocketBase, guid, errorMessage string) error {
	guid = strings.TrimSpace(guid)
	if guid == "" {
		return fmt.Errorf("guid is required")
	}

	job, err := app.FindFirstRecordByData("transcription_jobs", "episode_guid", guid)
	if err == nil && job != nil {
		attempts := job.GetInt("attempts")
		maxAttempts := job.GetInt("max_attempts")
		if maxAttempts <= 0 {
			maxAttempts = 3
		}

		job.Set("last_error", errorMessage)
		if attempts >= maxAttempts {
			job.Set("status", "failed")
			if ep, _ := app.FindFirstRecordByData("episodes", "guid", guid); ep != nil {
				ep.Set("transcription_status", "failed")
				_ = app.Save(ep)
			}
		} else {
			job.Set("status", "pending")
			job.Set("locked_by", "")
			if ep, _ := app.FindFirstRecordByData("episodes", "guid", guid); ep != nil {
				ep.Set("transcription_status", "pending")
				_ = app.Save(ep)
			}
		}
		return app.Save(job)
	}

	if ep, _ := app.FindFirstRecordByData("episodes", "guid", guid); ep != nil {
		ep.Set("transcription_status", "failed")
		return app.Save(ep)
	}

	return nil
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

// translateInflight 保证同一集同时只有一个翻译任务，
// 避免用户反复点播放（或自动翻译与手动触发撞车）时重复烧 token
var translateInflight sync.Map

// startTranslation 登记一集的后台翻译任务并立即返回。
// 已在翻译中、或已有同语言译文时直接跳过，不视为错误。
func startTranslation(app *pocketbase.PocketBase, guid, srtContent, targetLang string) error {
	cfg, err := resolveLLMConfig("", "", "")
	if err != nil {
		return err
	}
	if strings.TrimSpace(guid) == "" {
		return fmt.Errorf("guid is required")
	}

	if _, running := translateInflight.LoadOrStore(guid, struct{}{}); running {
		log.Printf("⏭️ Translate already running for %s", guid)
		return nil
	}

	record, err := app.FindFirstRecordByData("episodes", "guid", guid)
	if err != nil {
		translateInflight.Delete(guid)
		return fmt.Errorf("episode %s not found", guid)
	}

	record.Set("translation_status", "pending")
	record.Set("translation_lang", targetLang)
	if err := app.Save(record); err != nil {
		translateInflight.Delete(guid)
		return err
	}

	go func() {
		defer translateInflight.Delete(guid)

		log.Printf("🌐 Translating episode %s -> %s", guid, targetLang)
		translation, translateErr := translateSRT(srtContent, targetLang, cfg)

		// 重新拉取记录，避免覆盖翻译期间的其他写入
		rec, findErr := app.FindFirstRecordByData("episodes", "guid", guid)
		if findErr != nil {
			log.Printf("❌ Translate: episode %s disappeared", guid)
			return
		}

		if translateErr != nil {
			log.Printf("❌ Translate failed (%s): %v", guid, translateErr)
			rec.Set("translation_status", "failed")
			app.Save(rec)
			return
		}

		rec.Set("translation", translation)
		rec.Set("translation_status", "completed")
		if err := app.Save(rec); err != nil {
			log.Printf("❌ Translate failed to save (%s): %v", guid, err)
			return
		}
		log.Printf("✅ Translate completed for %s", guid)
	}()

	return nil
}

// autoTranslateEpisode 在转录完成后自动翻译，失败只记录日志不影响转录流程
func autoTranslateEpisode(app *pocketbase.PocketBase, guid, srtContent string) {
	if !autoTranslateEnabled() {
		return
	}
	if err := startTranslation(app, guid, srtContent, defaultTranslateLang()); err != nil {
		log.Printf("⏭️ Auto translate skipped (%s): %v", guid, err)
	}
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

func addNumberFieldIfMissing(collection *core.Collection, name string) bool {
	if collection.Fields.GetByName(name) != nil {
		return false
	}
	collection.Fields.Add(&core.NumberField{Name: name})
	return true
}

func addDateFieldIfMissing(collection *core.Collection, name string) bool {
	if collection.Fields.GetByName(name) != nil {
		return false
	}
	collection.Fields.Add(&core.DateField{Name: name})
	return true
}

func addURLFieldIfMissing(collection *core.Collection, name string) bool {
	if collection.Fields.GetByName(name) != nil {
		return false
	}
	collection.Fields.Add(&core.URLField{Name: name})
	return true
}

func ensureTranscriptionJobsCollection(app *pocketbase.PocketBase) {
	collection, err := app.FindCollectionByNameOrId("transcription_jobs")
	if err != nil {
		log.Println("👷 Creating 'transcription_jobs' collection...")
		c := &core.Collection{}
		c.Name = "transcription_jobs"
		c.Type = core.CollectionTypeBase
		c.ListRule = ptr("")
		c.ViewRule = ptr("")
		c.Fields.Add(&core.TextField{Name: "episode_guid", Required: true})
		c.Fields.Add(&core.TextField{Name: "channel_id"})
		c.Fields.Add(&core.TextField{Name: "title"})
		c.Fields.Add(&core.URLField{Name: "audio_url"})
		c.Fields.Add(&core.TextField{Name: "status"}) // pending | processing | completed | failed
		c.Fields.Add(&core.NumberField{Name: "priority"})
		c.Fields.Add(&core.NumberField{Name: "attempts"})
		c.Fields.Add(&core.NumberField{Name: "max_attempts"})
		c.Fields.Add(&core.DateField{Name: "locked_at"})
		c.Fields.Add(&core.TextField{Name: "locked_by"})
		c.Fields.Add(&core.EditorField{Name: "last_error"})
		c.Fields.Add(&core.DateField{Name: "completed_at"})
		c.Fields.Add(&core.EditorField{Name: "srt_content"})

		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save transcription_jobs collection: %v", err)
		} else {
			log.Println("✅ transcription_jobs collection created successfully!")
		}
		return
	}

	changed := false
	changed = addTextFieldIfMissing(collection, "episode_guid", true) || changed
	changed = addTextFieldIfMissing(collection, "channel_id", false) || changed
	changed = addTextFieldIfMissing(collection, "title", false) || changed
	changed = addURLFieldIfMissing(collection, "audio_url") || changed
	changed = addTextFieldIfMissing(collection, "status", false) || changed
	changed = addNumberFieldIfMissing(collection, "priority") || changed
	changed = addNumberFieldIfMissing(collection, "attempts") || changed
	changed = addNumberFieldIfMissing(collection, "max_attempts") || changed
	changed = addDateFieldIfMissing(collection, "locked_at") || changed
	changed = addTextFieldIfMissing(collection, "locked_by", false) || changed
	changed = addEditorFieldIfMissing(collection, "last_error") || changed
	changed = addDateFieldIfMissing(collection, "completed_at") || changed
	changed = addEditorFieldIfMissing(collection, "srt_content") || changed

	if changed {
		if err := app.Save(collection); err != nil {
			log.Printf("❌ Failed to update transcription_jobs collection: %v", err)
		}
	}
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
		c.Fields.Add(&core.URLField{Name: "image_url"})
		c.Fields.Add(&core.TextField{Name: "author"})
		c.Fields.Add(&core.EditorField{Name: "description"})
		c.Fields.Add(&core.BoolField{Name: "auto_convert"})
		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save channels collection: %v", err)
		}
		channels = c
	}

	// 1b. 补齐 channels 的新字段（老库迁移）
	if channels != nil {
		changed := false
		for name, field := range map[string]core.Field{
			"image_url":    &core.URLField{Name: "image_url"},
			"author":       &core.TextField{Name: "author"},
			"description":  &core.EditorField{Name: "description"},
			"auto_convert": &core.BoolField{Name: "auto_convert"},
		} {
			if channels.Fields.GetByName(name) == nil {
				channels.Fields.Add(field)
				changed = true
			}
		}
		if changed {
			if err := app.Save(channels); err != nil {
				log.Printf("❌ Failed to update channels collection: %v", err)
			}
		}
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
		c.Fields.Add(&core.NumberField{Name: "duration"})
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
		if episodes.Fields.GetByName("duration") == nil {
			episodes.Fields.Add(&core.NumberField{Name: "duration"})
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

	// 4. 确保 transcription_jobs 表存在
	ensureTranscriptionJobsCollection(app)
}
