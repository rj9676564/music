package main

import (
	"encoding/json"
	"molten-backend/internal/models"
	"testing"
	"time"
)

func TestRefactoredModelsJSON(t *testing.T) {
	sub := models.Subtitle{
		ID:          "sub1",
		EpisodeGUID: "guid-123",
		Type:        "srt",
		Content:     "1\n00:00:01,000 --> 00:00:02,000\nHello",
		Status:      "completed",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	data, err := json.Marshal(sub)
	if err != nil {
		t.Fatalf("Subtitle JSON marshal failed: %v", err)
	}

	var parsedSub models.Subtitle
	if err := json.Unmarshal(data, &parsedSub); err != nil {
		t.Fatalf("Subtitle JSON unmarshal failed: %v", err)
	}
	if parsedSub.Type != "srt" || parsedSub.EpisodeGUID != "guid-123" {
		t.Errorf("Unexpected Subtitle unmarshal result: %+v", parsedSub)
	}

	trans := models.Translation{
		ID:          "trans1",
		EpisodeGUID: "guid-123",
		SourceType:  "srt",
		TargetLang:  "中文",
		Content:     "1\n00:00:01,000 --> 00:00:02,000\n你好",
		Model:       "gpt-4o-mini",
		Status:      "completed",
	}
	data, err = json.Marshal(trans)
	if err != nil {
		t.Fatalf("Translation JSON marshal failed: %v", err)
	}

	var parsedTrans models.Translation
	if err := json.Unmarshal(data, &parsedTrans); err != nil {
		t.Fatalf("Translation JSON unmarshal failed: %v", err)
	}
	if parsedTrans.TargetLang != "中文" || parsedTrans.Model != "gpt-4o-mini" {
		t.Errorf("Unexpected Translation unmarshal result: %+v", parsedTrans)
	}

	summary := models.Summary{
		ID:          "sum1",
		EpisodeGUID: "guid-123",
		Content:     "这是本集音频的核心摘要内容",
		Model:       "moonshot-v1-8k",
	}
	data, err = json.Marshal(summary)
	if err != nil {
		t.Fatalf("Summary JSON marshal failed: %v", err)
	}

	var parsedSum models.Summary
	if err := json.Unmarshal(data, &parsedSum); err != nil {
		t.Fatalf("Summary JSON unmarshal failed: %v", err)
	}
	if parsedSum.Model != "moonshot-v1-8k" || parsedSum.EpisodeGUID != "guid-123" {
		t.Errorf("Unexpected Summary unmarshal result: %+v", parsedSum)
	}
}
