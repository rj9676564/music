package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

// llmConfig 保存一次 OpenAI 兼容调用所需的凭据
type llmConfig struct {
	APIKey  string
	APIBase string
	Model   string
}

var thinkBlockRe = regexp.MustCompile(`(?s)<think>.*?</think>`)

// disableThinkingEnabled 控制是否关闭模型的思考模式，默认关闭（翻译/摘要不需要推理，开着又慢又费 token）。
// LLM_DISABLE_THINKING=false 可恢复。官方 api.openai.com 不认这些扩展参数，会 400，所以对它不发送。
func disableThinkingEnabled(apiBase string) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("LLM_DISABLE_THINKING")))
	if v == "false" || v == "0" || v == "off" {
		return false
	}
	if u, err := url.Parse(apiBase); err == nil && u.Hostname() == "api.openai.com" {
		return false
	}
	return true
}

// resolveLLMConfig 优先使用请求里传入的配置，缺失时回落到环境变量与默认值
func resolveLLMConfig(customKey, customBase, customModel string) (llmConfig, error) {
	cfg := llmConfig{
		APIKey:  strings.TrimSpace(customKey),
		APIBase: strings.TrimSpace(customBase),
		Model:   strings.TrimSpace(customModel),
	}

	if cfg.APIKey == "" {
		cfg.APIKey = os.Getenv("OPENAI_API_KEY")
	}
	if cfg.APIBase == "" {
		cfg.APIBase = os.Getenv("OPENAI_API_BASE")
	}
	if cfg.APIBase == "" {
		cfg.APIBase = "https://api.openai.com/v1"
	}
	if cfg.Model == "" {
		cfg.Model = os.Getenv("OPENAI_MODEL")
	}
	if cfg.Model == "" {
		cfg.Model = "gpt-3.5-turbo"
	}

	if cfg.APIKey == "" {
		return cfg, fmt.Errorf("API Key missing")
	}
	return cfg, nil
}

// callLLMChat 调用 OpenAI 兼容的 /chat/completions，systemPrompt 为空时只发送用户消息
func callLLMChat(cfg llmConfig, systemPrompt, userPrompt string, timeout time.Duration) (string, error) {
	messages := []map[string]string{}
	if systemPrompt != "" {
		messages = append(messages, map[string]string{"role": "system", "content": systemPrompt})
	}
	messages = append(messages, map[string]string{"role": "user", "content": userPrompt})

	payload := map[string]interface{}{
		"model":    cfg.Model,
		"messages": messages,
	}
	if disableThinkingEnabled(cfg.APIBase) {
		// 各家 OpenAI 兼容服务关闭思考的字段不同，多发无害（不认识的字段会被忽略）：
		// Qwen/vLLM/SGLang 用 enable_thinking，DeepSeek/GLM/Kimi 用 thinking.type
		payload["enable_thinking"] = false
		payload["thinking"] = map[string]string{"type": "disabled"}
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	endpoint := strings.TrimSuffix(cfg.APIBase, "/") + "/chat/completions"
	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("LLM %s: reading response: %w", endpoint, err)
	}

	// 非 JSON 响应（网关 HTML 错误页、404 页面等）在这里就要报清楚，
	// 否则只会得到一句 "invalid character '<'"，看不出是哪个地址、什么状态码
	if !bytes.HasPrefix(bytes.TrimSpace(body), []byte("{")) {
		return "", fmt.Errorf(
			"LLM %s returned non-JSON (status %d): %s — 检查 OPENAI_API_BASE 是否为 OpenAI 兼容地址（通常以 /v1 结尾）",
			endpoint, resp.StatusCode, snippet(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("LLM %s: decoding response (status %d): %w: %s",
			endpoint, resp.StatusCode, err, snippet(body))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if result.Error.Message != "" {
			return "", fmt.Errorf("LLM %s: status %d: %s", endpoint, resp.StatusCode, result.Error.Message)
		}
		return "", fmt.Errorf("LLM %s: status %d: %s", endpoint, resp.StatusCode, snippet(body))
	}
	if len(result.Choices) > 0 && strings.TrimSpace(result.Choices[0].Message.Content) != "" {
		// 部分模型即使关闭思考，仍会把 <think>…</think> 混进正文，会污染编号解析
		content := strings.TrimSpace(thinkBlockRe.ReplaceAllString(result.Choices[0].Message.Content, ""))
		if content != "" {
			return content, nil
		}
	}
	if result.Error.Message != "" {
		return "", fmt.Errorf("LLM error: %s", result.Error.Message)
	}
	return "", fmt.Errorf("LLM %s: empty response (status %d): %s", endpoint, resp.StatusCode, snippet(body))
}

// snippet 截断响应体用于报错，避免把整页 HTML 打进日志
func snippet(b []byte) string {
	s := strings.Join(strings.Fields(string(b)), " ")
	if len(s) > 200 {
		s = s[:200] + "…"
	}
	if s == "" {
		return "(empty body)"
	}
	return s
}
