package main

import (
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type LLMConfigItem struct {
	APIKey        string `json:"apiKey"`
	APIBase       string `json:"apiBase"`
	Model         string `json:"model"`
	Prompt        string `json:"prompt,omitempty"`        // 用于 summary
	TargetLang    string `json:"targetLang,omitempty"`    // 用于 translate
	AutoTranslate *bool  `json:"autoTranslate,omitempty"` // 用于 translate
}

type AppConfigs struct {
	LLMSummary   LLMConfigItem `json:"llm_summary"`
	LLMTranslate LLMConfigItem `json:"llm_translate"`
}

// ensureConfigsCollection 确保 configs 表存在并具有基础结构
func ensureConfigsCollection(app *pocketbase.PocketBase) {
	collection, err := app.FindCollectionByNameOrId("configs")
	if err != nil {
		log.Println("👷 Creating 'configs' collection...")
		c := &core.Collection{}
		c.Name = "configs"
		c.Type = core.CollectionTypeBase
		c.ListRule = ptr("")
		c.ViewRule = ptr("")
		c.Fields.Add(&core.TextField{Name: "key", Required: true})
		c.Fields.Add(&core.EditorField{Name: "value"})
		c.Fields.Add(&core.TextField{Name: "description"})

		if err := app.Save(c); err != nil {
			log.Printf("❌ Failed to save configs collection: %v", err)
			return
		}
		log.Println("✅ configs collection created successfully!")
		collection = c
	} else {
		changed := false
		changed = addTextFieldIfMissing(collection, "key", true) || changed
		changed = addEditorFieldIfMissing(collection, "value") || changed
		changed = addTextFieldIfMissing(collection, "description", false) || changed
		if changed {
			if err := app.Save(collection); err != nil {
				log.Printf("❌ Failed to update configs collection: %v", err)
			}
		}
	}

	// 预设默认配置，如果记录尚不存在，则从环境变量迁移初始化
	initDefaultConfigIfMissing(app, "llm_summary", "AI 摘要模型配置", func() LLMConfigItem {
		apiKey := os.Getenv("OPENAI_API_KEY")
		apiBase := os.Getenv("OPENAI_API_BASE")
		if apiBase == "" {
			apiBase = "https://api.openai.com/v1"
		}
		model := os.Getenv("OPENAI_MODEL")
		if model == "" {
			model = "gpt-3.5-turbo"
		}
		return LLMConfigItem{
			APIKey:  apiKey,
			APIBase: apiBase,
			Model:   model,
			Prompt:  "Summarize the following transcript concisely in English: ",
		}
	})

	initDefaultConfigIfMissing(app, "llm_translate", "AI 翻译模型配置", func() LLMConfigItem {
		apiKey := os.Getenv("OPENAI_API_KEY")
		apiBase := os.Getenv("OPENAI_API_BASE")
		if apiBase == "" {
			apiBase = "https://api.openai.com/v1"
		}
		model := os.Getenv("OPENAI_MODEL")
		if model == "" {
			model = "gpt-3.5-turbo"
		}
		targetLang := defaultTranslateLang()
		autoTranslate := autoTranslateEnabled()
		return LLMConfigItem{
			APIKey:        apiKey,
			APIBase:       apiBase,
			Model:         model,
			TargetLang:    targetLang,
			AutoTranslate: &autoTranslate,
		}
	})
}

func initDefaultConfigIfMissing(app *pocketbase.PocketBase, key, description string, defaultFn func() LLMConfigItem) {
	record, err := app.FindFirstRecordByData("configs", "key", key)
	if err == nil && record != nil {
		return
	}
	collection, err := app.FindCollectionByNameOrId("configs")
	if err != nil {
		return
	}
	item := defaultFn()
	b, err := json.Marshal(item)
	if err != nil {
		return
	}
	rec := core.NewRecord(collection)
	rec.Set("key", key)
	rec.Set("value", string(b))
	rec.Set("description", description)
	if err := app.Save(rec); err != nil {
		log.Printf("⚠️ Failed to init config %s: %v", key, err)
	} else {
		log.Printf("✅ Initialized default config for %s", key)
	}
}

func getConfigItem(app *pocketbase.PocketBase, key string) (LLMConfigItem, bool) {
	var item LLMConfigItem
	record, err := app.FindFirstRecordByData("configs", "key", key)
	if err != nil || record == nil {
		return item, false
	}
	val := record.GetString("value")
	if strings.TrimSpace(val) == "" {
		return item, false
	}
	if err := json.Unmarshal([]byte(val), &item); err != nil {
		return item, false
	}
	return item, true
}

func saveConfigItem(app *pocketbase.PocketBase, key string, item LLMConfigItem, description string) error {
	collection, err := app.FindCollectionByNameOrId("configs")
	if err != nil {
		return err
	}
	record, err := app.FindFirstRecordByData("configs", "key", key)
	if err != nil || record == nil {
		record = core.NewRecord(collection)
		record.Set("key", key)
	}
	b, err := json.Marshal(item)
	if err != nil {
		return err
	}
	record.Set("value", string(b))
	if description != "" {
		record.Set("description", description)
	}
	return app.Save(record)
}

func getAppConfigs(app *pocketbase.PocketBase) AppConfigs {
	summary, _ := getConfigItem(app, "llm_summary")
	translate, _ := getConfigItem(app, "llm_translate")

	if summary.APIBase == "" {
		summary.APIBase = "https://api.openai.com/v1"
	}
	if summary.Model == "" {
		summary.Model = "gpt-3.5-turbo"
	}
	if summary.Prompt == "" {
		summary.Prompt = "Summary: "
	}

	if translate.APIBase == "" {
		translate.APIBase = "https://api.openai.com/v1"
	}
	if translate.Model == "" {
		translate.Model = "gpt-3.5-turbo"
	}
	if translate.TargetLang == "" {
		translate.TargetLang = defaultTranslateLang()
	}
	if translate.AutoTranslate == nil {
		b := autoTranslateEnabled()
		translate.AutoTranslate = &b
	}

	return AppConfigs{
		LLMSummary:   summary,
		LLMTranslate: translate,
	}
}

func updateAppConfigs(app *pocketbase.PocketBase, summary *LLMConfigItem, translate *LLMConfigItem) error {
	if summary != nil {
		item := LLMConfigItem{
			APIKey:  strings.TrimSpace(summary.APIKey),
			APIBase: strings.TrimSpace(summary.APIBase),
			Model:   strings.TrimSpace(summary.Model),
			Prompt:  strings.TrimSpace(summary.Prompt),
		}
		if item.Prompt == "" {
			item.Prompt = "Summary: "
		}
		if err := saveConfigItem(app, "llm_summary", item, "AI 摘要模型配置"); err != nil {
			return err
		}
	}

	if translate != nil {
		item := LLMConfigItem{
			APIKey:        strings.TrimSpace(translate.APIKey),
			APIBase:       strings.TrimSpace(translate.APIBase),
			Model:         strings.TrimSpace(translate.Model),
			Prompt:        strings.TrimSpace(translate.Prompt),
			TargetLang:    strings.TrimSpace(translate.TargetLang),
			AutoTranslate: translate.AutoTranslate,
		}
		if item.TargetLang == "" {
			item.TargetLang = defaultTranslateLang()
		}
		if err := saveConfigItem(app, "llm_translate", item, "AI 翻译模型配置"); err != nil {
			return err
		}
	}
	return nil
}

// resolveSummaryLLMConfig 解析摘要模型凭据，优先级：前端显式参数 > 数据库 configs 表 > 环境变量 > 默认值
func resolveSummaryLLMConfig(app *pocketbase.PocketBase, customKey, customBase, customModel string) (llmConfig, string, error) {
	dbItem, hasDB := getConfigItem(app, "llm_summary")

	key := strings.TrimSpace(customKey)
	base := strings.TrimSpace(customBase)
	model := strings.TrimSpace(customModel)
	prompt := "Summarize the following transcript concisely in English: "

	if hasDB {
		if key == "" {
			key = dbItem.APIKey
		}
		if base == "" {
			base = dbItem.APIBase
		}
		if model == "" {
			model = dbItem.Model
		}
		if strings.TrimSpace(dbItem.Prompt) != "" && dbItem.Prompt != "Summary: " {
			prompt = dbItem.Prompt
		}
	}

	cfg, err := resolveLLMConfig(key, base, model)
	return cfg, prompt, err
}

// resolveTranslateLLMConfig 解析翻译模型凭据，优先级：数据库 configs 表 > 环境变量 > 默认值
func resolveTranslateLLMConfig(app *pocketbase.PocketBase) (llmConfig, string, string, bool, error) {
	dbItem, hasDB := getConfigItem(app, "llm_translate")

	var key, base, model, targetLang, customPrompt string
	autoTranslate := true

	if hasDB {
		key = dbItem.APIKey
		base = dbItem.APIBase
		model = dbItem.Model
		targetLang = dbItem.TargetLang
		customPrompt = dbItem.Prompt
		if dbItem.AutoTranslate != nil {
			autoTranslate = *dbItem.AutoTranslate
		} else {
			autoTranslate = autoTranslateEnabled()
		}
	} else {
		autoTranslate = autoTranslateEnabled()
	}

	if targetLang == "" {
		targetLang = defaultTranslateLang()
	}

	cfg, err := resolveLLMConfig(key, base, model)
	return cfg, targetLang, customPrompt, autoTranslate, err
}
