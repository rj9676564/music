package main

import (
	"log"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// ensureSubtitlesCollection 确保 subtitles (字幕/歌词原文表) 存在
func ensureSubtitlesCollection(app *pocketbase.PocketBase) {
	collection, err := app.FindCollectionByNameOrId("subtitles")
	if err != nil {
		log.Println("👷 Creating 'subtitles' collection...")
		c := &core.Collection{}
		c.Name = "subtitles"
		c.Type = core.CollectionTypeBase
		c.ListRule = ptr("")
		c.ViewRule = ptr("")
		c.Fields.Add(&core.TextField{Name: "episode_guid", Required: true})
		c.Fields.Add(&core.TextField{Name: "type", Required: true}) // srt | lrc
		c.Fields.Add(&core.EditorField{Name: "content"})
		c.Fields.Add(&core.TextField{Name: "status"})

		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save subtitles collection: %v", err)
			return
		}
		log.Println("✅ subtitles collection created successfully!")
		collection = c
	} else {
		changed := false
		changed = addTextFieldIfMissing(collection, "episode_guid", true) || changed
		changed = addTextFieldIfMissing(collection, "type", true) || changed
		changed = addEditorFieldIfMissing(collection, "content") || changed
		changed = addTextFieldIfMissing(collection, "status", false) || changed
		if changed {
			if err := app.Save(collection); err != nil {
				log.Printf("❌ Failed to update subtitles collection: %v", err)
			}
		}
	}
}

// ensureTranslationsCollection 确保 translations (多语言/多来源翻译表) 存在
func ensureTranslationsCollection(app *pocketbase.PocketBase) {
	collection, err := app.FindCollectionByNameOrId("translations")
	if err != nil {
		log.Println("👷 Creating 'translations' collection...")
		c := &core.Collection{}
		c.Name = "translations"
		c.Type = core.CollectionTypeBase
		c.ListRule = ptr("")
		c.ViewRule = ptr("")
		c.Fields.Add(&core.TextField{Name: "episode_guid", Required: true})
		c.Fields.Add(&core.TextField{Name: "source_type", Required: true}) // srt | lrc
		c.Fields.Add(&core.TextField{Name: "target_lang", Required: true}) // 中文 | en 等
		c.Fields.Add(&core.EditorField{Name: "content"})
		c.Fields.Add(&core.TextField{Name: "model"})
		c.Fields.Add(&core.TextField{Name: "status"})

		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save translations collection: %v", err)
			return
		}
		log.Println("✅ translations collection created successfully!")
		collection = c
	} else {
		changed := false
		changed = addTextFieldIfMissing(collection, "episode_guid", true) || changed
		changed = addTextFieldIfMissing(collection, "source_type", true) || changed
		changed = addTextFieldIfMissing(collection, "target_lang", true) || changed
		changed = addEditorFieldIfMissing(collection, "content") || changed
		changed = addTextFieldIfMissing(collection, "model", false) || changed
		changed = addTextFieldIfMissing(collection, "status", false) || changed
		if changed {
			if err := app.Save(collection); err != nil {
				log.Printf("❌ Failed to update translations collection: %v", err)
			}
		}
	}
}

// ensureSummariesCollection 确保 summaries (AI 摘要表) 存在
func ensureSummariesCollection(app *pocketbase.PocketBase) {
	collection, err := app.FindCollectionByNameOrId("summaries")
	if err != nil {
		log.Println("👷 Creating 'summaries' collection...")
		c := &core.Collection{}
		c.Name = "summaries"
		c.Type = core.CollectionTypeBase
		c.ListRule = ptr("")
		c.ViewRule = ptr("")
		c.Fields.Add(&core.TextField{Name: "episode_guid", Required: true})
		c.Fields.Add(&core.EditorField{Name: "content"})
		c.Fields.Add(&core.TextField{Name: "model"})

		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save summaries collection: %v", err)
			return
		}
		log.Println("✅ summaries collection created successfully!")
		collection = c
	} else {
		changed := false
		changed = addTextFieldIfMissing(collection, "episode_guid", true) || changed
		changed = addEditorFieldIfMissing(collection, "content") || changed
		changed = addTextFieldIfMissing(collection, "model", false) || changed
		if changed {
			if err := app.Save(collection); err != nil {
				log.Printf("❌ Failed to update summaries collection: %v", err)
			}
		}
	}
}

// saveSubtitleRecord 保存或更新字幕/歌词记录到 subtitles 表
func saveSubtitleRecord(app *pocketbase.PocketBase, guid, subType, content, status string) error {
	if strings.TrimSpace(guid) == "" {
		return nil
	}
	collection, err := app.FindCollectionByNameOrId("subtitles")
	if err != nil {
		return err
	}

	records, _ := app.FindRecordsByFilter(
		"subtitles",
		"episode_guid = {:guid} && type = {:type}",
		"",
		1,
		0,
		dbx.Params{"guid": guid, "type": subType},
	)

	var record *core.Record
	if len(records) > 0 {
		record = records[0]
	} else {
		record = core.NewRecord(collection)
		record.Set("episode_guid", guid)
		record.Set("type", subType)
	}

	record.Set("content", content)
	if status != "" {
		record.Set("status", status)
	}
	return app.Save(record)
}

// saveTranslationRecord 保存或更新翻译记录到 translations 表
func saveTranslationRecord(app *pocketbase.PocketBase, guid, sourceType, targetLang, content, model, status string) error {
	if strings.TrimSpace(guid) == "" {
		return nil
	}
	collection, err := app.FindCollectionByNameOrId("translations")
	if err != nil {
		return err
	}

	records, _ := app.FindRecordsByFilter(
		"translations",
		"episode_guid = {:guid} && source_type = {:st} && target_lang = {:tl}",
		"",
		1,
		0,
		dbx.Params{"guid": guid, "st": sourceType, "tl": targetLang},
	)

	var record *core.Record
	if len(records) > 0 {
		record = records[0]
	} else {
		record = core.NewRecord(collection)
		record.Set("episode_guid", guid)
		record.Set("source_type", sourceType)
		record.Set("target_lang", targetLang)
	}

	record.Set("content", content)
	if model != "" {
		record.Set("model", model)
	}
	if status != "" {
		record.Set("status", status)
	}
	return app.Save(record)
}

// saveSummaryRecord 保存或更新摘要记录到 summaries 表
func saveSummaryRecord(app *pocketbase.PocketBase, guid, content, model string) error {
	if strings.TrimSpace(guid) == "" {
		return nil
	}
	collection, err := app.FindCollectionByNameOrId("summaries")
	if err != nil {
		return err
	}

	records, _ := app.FindRecordsByFilter(
		"summaries",
		"episode_guid = {:guid}",
		"",
		1,
		0,
		dbx.Params{"guid": guid},
	)

	var record *core.Record
	if len(records) > 0 {
		record = records[0]
	} else {
		record = core.NewRecord(collection)
		record.Set("episode_guid", guid)
	}

	record.Set("content", content)
	if model != "" {
		record.Set("model", model)
	}
	return app.Save(record)
}

// migrateEpisodeArtifactsToSubTables 将存量 episodes 表中的大文本回填到子表（安全幂等）
func migrateEpisodeArtifactsToSubTables(app *pocketbase.PocketBase) {
	episodes, err := app.FindRecordsByFilter("episodes", "1=1", "", 500, 0)
	if err != nil || len(episodes) == 0 {
		return
	}

	migratedCount := 0
	for _, ep := range episodes {
		guid := ep.GetString("guid")
		if guid == "" {
			continue
		}

		// 1. SRT 字幕
		if srt := ep.GetString("srt_content"); srt != "" {
			_ = saveSubtitleRecord(app, guid, "srt", srt, ep.GetString("transcription_status"))
			migratedCount++
		}

		// 2. LRC 歌词
		if lrc := ep.GetString("lrc_content"); lrc != "" {
			_ = saveSubtitleRecord(app, guid, "lrc", lrc, "completed")
			migratedCount++
		}

		// 3. SRT 翻译
		if trans := ep.GetString("translation"); trans != "" {
			lang := ep.GetString("translation_lang")
			if lang == "" {
				lang = "中文"
			}
			_ = saveTranslationRecord(app, guid, "srt", lang, trans, "", ep.GetString("translation_status"))
			migratedCount++
		}

		// 4. LRC 翻译
		if lrcTrans := ep.GetString("lrc_translation"); lrcTrans != "" {
			lang := ep.GetString("lrc_translation_lang")
			if lang == "" {
				lang = "中文"
			}
			_ = saveTranslationRecord(app, guid, "lrc", lang, lrcTrans, "", ep.GetString("lrc_translation_status"))
			migratedCount++
		}

		// 5. 摘要
		if summary := ep.GetString("summary"); summary != "" {
			_ = saveSummaryRecord(app, guid, summary, "")
			migratedCount++
		}
	}

	if migratedCount > 0 {
		log.Printf("📦 Episodes artifacts migration verified (processed %d items across %d episodes)", migratedCount, len(episodes))
	}
}

// enrichEpisodesWithArtifacts 从 subtitles、translations、summaries 表中聚合两层语言数据并回填到单集响应中
// 保证：
// 1. 内容本身语言（原文字幕/歌词）：srt_content / lrc_content
// 2. 翻译语言（译文）：translation / lrc_translation
// 3. 摘要：summary
func enrichEpisodesWithArtifacts(app *pocketbase.PocketBase, episodes []*core.Record) []map[string]interface{} {
	if len(episodes) == 0 {
		return []map[string]interface{}{}
	}

	result := make([]map[string]interface{}, 0, len(episodes))
	guids := make([]string, 0, len(episodes))
	for _, ep := range episodes {
		if g := ep.GetString("guid"); g != "" {
			guids = append(guids, g)
		}
	}

	// 内存映射表：guid -> 原文字幕(srt/lrc)
	subtitlesMap := make(map[string]map[string]string)   // guid -> type -> content
	subStatusMap := make(map[string]map[string]string)   // guid -> type -> status
	translationsMap := make(map[string]map[string]string) // guid -> sourceType -> content
	transLangMap := make(map[string]map[string]string)    // guid -> sourceType -> targetLang
	transStatusMap := make(map[string]map[string]string)  // guid -> sourceType -> status
	summariesMap := make(map[string]string)               // guid -> content

	if len(guids) > 0 {
		// 批量拉取 subtitles
		if subs, err := app.FindRecordsByFilter("subtitles", "1=1", "-updated", 300, 0); err == nil {
			for _, s := range subs {
				g := s.GetString("episode_guid")
				t := s.GetString("type")
				c := s.GetString("content")
				st := s.GetString("status")
				if g != "" && t != "" {
					if _, ok := subtitlesMap[g]; !ok {
						subtitlesMap[g] = make(map[string]string)
						subStatusMap[g] = make(map[string]string)
					}
					if _, exists := subtitlesMap[g][t]; !exists {
						subtitlesMap[g][t] = c
						subStatusMap[g][t] = st
					}
				}
			}
		}

		// 批量拉取 translations
		if transList, err := app.FindRecordsByFilter("translations", "1=1", "-updated", 300, 0); err == nil {
			for _, tr := range transList {
				g := tr.GetString("episode_guid")
				st := tr.GetString("source_type")
				c := tr.GetString("content")
				lang := tr.GetString("target_lang")
				status := tr.GetString("status")
				if g != "" && st != "" {
					if _, ok := translationsMap[g]; !ok {
						translationsMap[g] = make(map[string]string)
						transLangMap[g] = make(map[string]string)
						transStatusMap[g] = make(map[string]string)
					}
					if _, exists := translationsMap[g][st]; !exists {
						translationsMap[g][st] = c
						transLangMap[g][st] = lang
						transStatusMap[g][st] = status
					}
				}
			}
		}

		// 批量拉取 summaries
		if sums, err := app.FindRecordsByFilter("summaries", "1=1", "-updated", 200, 0); err == nil {
			for _, sm := range sums {
				g := sm.GetString("episode_guid")
				c := sm.GetString("content")
				if g != "" && c != "" {
					if _, exists := summariesMap[g]; !exists {
						summariesMap[g] = c
					}
				}
			}
		}
	}

	for _, ep := range episodes {
		guid := ep.GetString("guid")
		item := make(map[string]interface{})

		// 先复制原始 episodes 表所有字段
		for _, name := range ep.Collection().Fields.FieldNames() {
			item[name] = ep.Get(name)
		}
		item["id"] = ep.Id
		item["created"] = ep.GetDateTime("created").String()
		item["updated"] = ep.GetDateTime("updated").String()

		// 1. 优先从 subtitles 回填内容本身语言 (SRT / LRC)
		if subMap, ok := subtitlesMap[guid]; ok {
			if srtContent, ok := subMap["srt"]; ok && srtContent != "" {
				item["srt_content"] = srtContent
				if st := subStatusMap[guid]["srt"]; st != "" {
					item["transcription_status"] = st
				}
			}
			if lrcContent, ok := subMap["lrc"]; ok && lrcContent != "" {
				item["lrc_content"] = lrcContent
			}
		}

		// 2. 优先从 translations 回填翻译语言 (SRT 翻译 / LRC 翻译)
		if trMap, ok := translationsMap[guid]; ok {
			if srtTrans, ok := trMap["srt"]; ok && srtTrans != "" {
				item["translation"] = srtTrans
				item["translation_lang"] = transLangMap[guid]["srt"]
				item["translation_status"] = transStatusMap[guid]["srt"]
			}
			if lrcTrans, ok := trMap["lrc"]; ok && lrcTrans != "" {
				item["lrc_translation"] = lrcTrans
				item["lrc_translation_lang"] = transLangMap[guid]["lrc"]
				item["lrc_translation_status"] = transStatusMap[guid]["lrc"]
			}
		}

		// 3. 优先从 summaries 回填摘要
		if sumText, ok := summariesMap[guid]; ok && sumText != "" {
			item["summary"] = sumText
		}

		result = append(result, item)
	}

	return result
}
