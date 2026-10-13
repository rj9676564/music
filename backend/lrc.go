package main

import (
	"fmt"
	"log"
	"regexp"
	"strings"
)

// lrcLineRe 匹配行首的一个或多个时间标签，例如 [01:23.45] 或 [01:23.45][02:30.10]
var lrcLineRe = regexp.MustCompile(`^((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+)(.*)$`)

// lrcLine 表示 LRC 的一行：有时间标签的歌词行 Prefix 非空，其余（元信息、空行）原样保留
type lrcLine struct {
	Raw    string
	Prefix string
	Text   string
}

func parseLRC(content string) []lrcLine {
	content = strings.TrimPrefix(content, "\xEF\xBB\xBF")
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")

	lines := []lrcLine{}
	for _, raw := range strings.Split(content, "\n") {
		line := lrcLine{Raw: raw}
		if match := lrcLineRe.FindStringSubmatch(strings.TrimSpace(raw)); match != nil {
			if text := strings.TrimSpace(match[2]); text != "" {
				line.Prefix = match[1]
				line.Text = text
			}
		}
		lines = append(lines, line)
	}
	return lines
}

// translateLRC 只翻译歌词文本，时间标签与元信息行原样保留；
// 某一批失败时对应行回落为原文，全部失败才返回错误
func translateLRC(lrcContent, targetLang string, cfg llmConfig) (string, error) {
	lines := parseLRC(lrcContent)

	cues := []srtCue{}
	lineOf := []int{}
	for i, line := range lines {
		if line.Prefix == "" {
			continue
		}
		cues = append(cues, srtCue{Index: len(cues) + 1, Text: line.Text})
		lineOf = append(lineOf, i)
	}
	if len(cues) == 0 {
		return "", fmt.Errorf("no timed lyric lines found")
	}
	if strings.TrimSpace(targetLang) == "" {
		targetLang = defaultTranslateLang()
	}

	batches := splitCueBatches(cues)
	failedBatches := 0
	offset := 0
	for _, batch := range batches {
		texts, err := translateBatch(cfg, targetLang, batch)
		if err != nil {
			log.Printf("⚠️ Translate LRC batch failed: %v", err)
			failedBatches++
			texts = map[int]string{}
		}
		for i := range batch {
			if text, ok := texts[i+1]; ok {
				lines[lineOf[offset+i]].Text = text
			}
		}
		offset += len(batch)
	}
	if failedBatches == len(batches) {
		return "", fmt.Errorf("all %d translate batches failed", failedBatches)
	}

	var b strings.Builder
	for i, line := range lines {
		if line.Prefix != "" {
			b.WriteString(line.Prefix + line.Text)
		} else {
			b.WriteString(line.Raw)
		}
		if i < len(lines)-1 {
			b.WriteString("\n")
		}
	}
	return b.String(), nil
}
