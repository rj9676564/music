package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// llmConfig 保存一次 OpenAI 兼容调用所需的凭据
type llmConfig struct {
	APIKey  string
	APIBase string
	Model   string
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
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", strings.TrimSuffix(cfg.APIBase, "/")+"/chat/completions", bytes.NewBuffer(jsonData))
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
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) > 0 && strings.TrimSpace(result.Choices[0].Message.Content) != "" {
		return result.Choices[0].Message.Content, nil
	}
	if result.Error.Message != "" {
		return "", fmt.Errorf("LLM error: %s", result.Error.Message)
	}
	return "", fmt.Errorf("LLM error: empty response (status %d)", resp.StatusCode)
}
