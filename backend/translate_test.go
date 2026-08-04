package main

import (
	"strings"
	"testing"
)

const sampleSRT = "1\n00:00:01,000 --> 00:00:03,500\nHello world\n\n" +
	"2\n00:00:04,000 --> 00:00:06,000\nThis is a\nsplit line\n\n"

func TestParseSRT(t *testing.T) {
	cues := parseSRT(sampleSRT)
	if len(cues) != 2 {
		t.Fatalf("expected 2 cues, got %d", len(cues))
	}
	if cues[0].Text != "Hello world" {
		t.Errorf("unexpected first text: %q", cues[0].Text)
	}
	if cues[1].Text != "This is a split line" {
		t.Errorf("expected split lines merged, got %q", cues[1].Text)
	}
	if cues[1].TimeLine != "00:00:04,000 --> 00:00:06,000" {
		t.Errorf("unexpected time line: %q", cues[1].TimeLine)
	}
}

func TestBuildSRTKeepsTimeline(t *testing.T) {
	cues := parseSRT(sampleSRT)
	cues[0].Text = "你好世界"
	out := buildSRT(cues)

	if !strings.Contains(out, "1\n00:00:01,000 --> 00:00:03,500\n你好世界") {
		t.Errorf("translated cue not rebuilt correctly:\n%s", out)
	}
	if len(parseSRT(out)) != 2 {
		t.Errorf("rebuilt SRT is not re-parsable:\n%s", out)
	}
}

func TestParseTranslatedBatch(t *testing.T) {
	output := "1. 你好世界\n2、这是一句话\n3: 第三句\nsome noise\n4) 第四句"
	got := parseTranslatedBatch(output)

	want := map[int]string{1: "你好世界", 2: "这是一句话", 3: "第三句", 4: "第四句"}
	if len(got) != len(want) {
		t.Fatalf("expected %d entries, got %d (%v)", len(want), len(got), got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("entry %d: got %q, want %q", k, got[k], v)
		}
	}
}

func TestSplitCueBatches(t *testing.T) {
	cues := make([]srtCue, 0, 100)
	for i := 0; i < 100; i++ {
		cues = append(cues, srtCue{Index: i + 1, Text: strings.Repeat("a", 50)})
	}

	batches := splitCueBatches(cues)
	total := 0
	for _, b := range batches {
		if len(b) > translateBatchCues {
			t.Errorf("batch too large: %d cues", len(b))
		}
		total += len(b)
	}
	if total != len(cues) {
		t.Errorf("lost cues: got %d, want %d", total, len(cues))
	}
}
