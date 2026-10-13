package main

import (
	"encoding/json"
	"testing"
)

func TestAppConfigsJSON(t *testing.T) {
	autoTranslate := true
	cfg := AppConfigs{
		LLMSummary: LLMConfigItem{
			APIKey:  "sk-summary-test",
			APIBase: "https://api.openai.com/v1",
			Model:   "gpt-4o-mini",
			Prompt:  "请总结音频：",
		},
		LLMTranslate: LLMConfigItem{
			APIKey:        "sk-translate-test",
			APIBase:       "https://api.deepl.com/v1",
			Model:         "gpt-3.5-turbo",
			TargetLang:    "中文",
			AutoTranslate: &autoTranslate,
		},
	}

	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var parsed AppConfigs
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if parsed.LLMSummary.APIKey != "sk-summary-test" {
		t.Errorf("expected summary api key 'sk-summary-test', got %s", parsed.LLMSummary.APIKey)
	}
	if parsed.LLMTranslate.TargetLang != "中文" {
		t.Errorf("expected translate targetLang '中文', got %s", parsed.LLMTranslate.TargetLang)
	}
	if parsed.LLMTranslate.AutoTranslate == nil || !*parsed.LLMTranslate.AutoTranslate {
		t.Errorf("expected autoTranslate true")
	}
}
