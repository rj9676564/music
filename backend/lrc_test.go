package main

import "testing"

func TestParseLRC(t *testing.T) {
	lines := parseLRC("[ar:Artist]\r\n[00:01.00]Hello\n[00:02.50][01:00.00] World \n[00:03.00]\n\n")
	if lines[0].Prefix != "" {
		t.Errorf("metadata line should not be a lyric line: %+v", lines[0])
	}
	if lines[1].Prefix != "[00:01.00]" || lines[1].Text != "Hello" {
		t.Errorf("unexpected lyric line: %+v", lines[1])
	}
	if lines[2].Prefix != "[00:02.50][01:00.00]" || lines[2].Text != "World" {
		t.Errorf("multi-tag line not parsed: %+v", lines[2])
	}
	if lines[3].Prefix != "" {
		t.Errorf("empty-text line should be kept raw: %+v", lines[3])
	}
}

func TestDisableThinkingEnabled(t *testing.T) {
	t.Setenv("LLM_DISABLE_THINKING", "")
	if !disableThinkingEnabled("https://dashscope.aliyuncs.com/compatible-mode/v1") {
		t.Error("should be on by default for third-party bases")
	}
	if disableThinkingEnabled("https://api.openai.com/v1") {
		t.Error("must not send extension params to api.openai.com")
	}
	t.Setenv("LLM_DISABLE_THINKING", "false")
	if disableThinkingEnabled("https://example.com/v1") {
		t.Error("env false should turn it off")
	}
}
