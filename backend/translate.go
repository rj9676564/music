package main

import (
	"fmt"
	"log"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	// 每批送给模型的字幕条数与字符预算，避免单次请求过长导致截断
	translateBatchCues  = 30
	translateBatchChars = 2000
	translateTimeout    = 120 * time.Second
)

var (
	srtTimeLineRe    = regexp.MustCompile(`\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}`)
	srtBlockSplitRe  = regexp.MustCompile(`\n\s*\n`)
	translatedLineRe = regexp.MustCompile(`^\s*(\d+)\s*[.、:：)\]]\s*(.*)$`)
)

type srtCue struct {
	Index    int
	TimeLine string
	Text     string
}

// defaultTranslateLang 返回服务端默认目标语言，可用 TRANSLATE_TARGET_LANG 覆盖
func defaultTranslateLang() string {
	if lang := strings.TrimSpace(os.Getenv("TRANSLATE_TARGET_LANG")); lang != "" {
		return lang
	}
	return "中文"
}

// autoTranslateEnabled 控制转录完成后是否自动翻译，默认开启
func autoTranslateEnabled() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("AUTO_TRANSLATE")))
	return v != "false" && v != "0" && v != "off"
}

// parseSRT 解析 SRT 文本，保留原始时间轴以便翻译后原样拼回
func parseSRT(content string) []srtCue {
	cues := []srtCue{}

	content = strings.TrimSpace(content)
	if content == "" {
		return cues
	}
	content = strings.TrimPrefix(content, "\uFEFF")
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")

	for _, block := range srtBlockSplitRe.Split(content, -1) {
		lines := []string{}
		for _, line := range strings.Split(block, "\n") {
			if trimmed := strings.TrimSpace(line); trimmed != "" {
				lines = append(lines, trimmed)
			}
		}
		if len(lines) < 2 {
			continue
		}

		timeLineIndex := -1
		for i, line := range lines {
			if srtTimeLineRe.MatchString(line) {
				timeLineIndex = i
				break
			}
		}
		if timeLineIndex == -1 {
			continue
		}

		text := strings.TrimSpace(strings.Join(lines[timeLineIndex+1:], " "))
		if text == "" {
			continue
		}

		cues = append(cues, srtCue{
			Index:    len(cues) + 1,
			TimeLine: lines[timeLineIndex],
			Text:     text,
		})
	}

	return cues
}

// buildSRT 用翻译后的文本重新拼装 SRT，时间轴与原文一一对应
func buildSRT(cues []srtCue) string {
	var b strings.Builder
	for i, cue := range cues {
		b.WriteString(strconv.Itoa(i + 1))
		b.WriteString("\n")
		b.WriteString(cue.TimeLine)
		b.WriteString("\n")
		b.WriteString(cue.Text)
		b.WriteString("\n\n")
	}
	return b.String()
}

// splitCueBatches 按条数与字符预算切分，保证每次请求不会超长
func splitCueBatches(cues []srtCue) [][]srtCue {
	batches := [][]srtCue{}
	current := []srtCue{}
	chars := 0

	for _, cue := range cues {
		if len(current) > 0 && (len(current) >= translateBatchCues || chars+len(cue.Text) > translateBatchChars) {
			batches = append(batches, current)
			current = []srtCue{}
			chars = 0
		}
		current = append(current, cue)
		chars += len(cue.Text)
	}
	if len(current) > 0 {
		batches = append(batches, current)
	}
	return batches
}

// parseTranslatedBatch 解析模型返回的编号列表，返回 序号 -> 译文
func parseTranslatedBatch(output string) map[int]string {
	result := map[int]string{}
	for _, line := range strings.Split(output, "\n") {
		match := translatedLineRe.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		n, err := strconv.Atoi(match[1])
		if err != nil {
			continue
		}
		if text := strings.TrimSpace(match[2]); text != "" {
			result[n] = text
		}
	}
	return result
}

func translateBatch(cfg llmConfig, targetLang string, batch []srtCue) (map[int]string, error) {
	var prompt strings.Builder
	for i, cue := range batch {
		prompt.WriteString(strconv.Itoa(i + 1))
		prompt.WriteString(". ")
		prompt.WriteString(cue.Text)
		prompt.WriteString("\n")
	}

	systemPrompt := fmt.Sprintf(
		"You are a professional subtitle translator. Translate every numbered line into %s. "+
			"Rules: keep the exact same numbering and line count, one translation per line, "+
			"never merge or split lines, never add explanations or extra text. "+
			"If a line is already in %s, output it unchanged. "+
			"Output format: `<number>. <translation>`",
		targetLang, targetLang,
	)

	output, err := callLLMChat(cfg, systemPrompt, prompt.String(), translateTimeout)
	if err != nil {
		return nil, err
	}
	return parseTranslatedBatch(output), nil
}

// translateSRT 逐批翻译字幕文本，缺失的条目回落为原文，保证时间轴始终完整
func translateSRT(srtContent, targetLang string, cfg llmConfig) (string, error) {
	cues := parseSRT(srtContent)
	if len(cues) == 0 {
		return "", fmt.Errorf("no subtitle cues found")
	}
	if strings.TrimSpace(targetLang) == "" {
		targetLang = defaultTranslateLang()
	}

	batches := splitCueBatches(cues)
	translated := make([]srtCue, 0, len(cues))
	failedBatches := 0

	for _, batch := range batches {
		texts, err := translateBatch(cfg, targetLang, batch)
		if err != nil {
			log.Printf("⚠️ Translate batch failed: %v", err)
			failedBatches++
			texts = map[int]string{}
		}
		for i, cue := range batch {
			if text, ok := texts[i+1]; ok {
				cue.Text = text
			}
			translated = append(translated, cue)
		}
	}

	if failedBatches > 0 && failedBatches == len(batches) {
		return "", fmt.Errorf("all %d translate batches failed", failedBatches)
	}

	return buildSRT(translated), nil
}
