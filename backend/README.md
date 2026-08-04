# Molten Music Backend

基于 [PocketBase](https://pocketbase.io/) 的播客管理系统后端服务。内置管理后台、自动同步和 AI 转录功能。

## ✨ 功能特性

- 🎵 **播客频道管理**：支持 RSS 订阅和自动同步
- 📥 **音频下载和缓存**：本地化存储，加快访问速度
- 🎙️ **Whisper AI 转录**：自动生成播客字幕 (SRT)
- 🤖 **LLM 智能摘要**：快速了解播客核心内容
- 🎨 **内置 Admin UI**：可视化管理所有频道和节目数据
- 🐳 **Docker 支持**：一键流水线部署

## 🚀 快速开始

### 本地开发

```bash
# 安装依赖
go mod tidy

# 启动服务
go run main.go serve
```

访问 `http://127.0.0.1:8090/_/` 进入管理后台。

### Docker 部署

```bash
docker-compose up -d
```

## 📋 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENAI_API_KEY` | 用于摘要生成的 API Key | - |
| `OPENAI_API_BASE` | API 代理地址 | `https://api.openai.com/v1` |

## 📁 项目结构

```
backend/
├── main.go              # PocketBase 启动程序及核心逻辑
├── internal/
│   └── rss/             # RSS 抓取与解析逻辑（含单元测试）
├── Dockerfile           # Docker 镜像构建
├── docker-compose.yml   # Docker 编排文件
├── pb_data/             # 数据库文件目录（自动创建）
├── media_cache/         # 音频缓存目录
└── doc.html             # API 文档
```

## 🔌 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/_/` | GET | PocketBase 管理后台 |
| `/api/channels` | GET | 获取频道列表 |
| `/api/channels/:id/episodes` | GET | 获取节目列表（自动按需刷新） |
| `/api/dynamic/interfaces` | GET | 获取 Flutter 动态页所有可用接口列表（仅返回 `method` 和 `url`） |
| `/api/dynamic/interfaces/basic-info` | GET | 获取所有可用动态页基础信息列表（不包含页面详情数据） |
| `/api/dynamic/interfaces/:pageKey` | GET | 按 pageKey 获取动态页 schema、JS 与版本状态 |
| `/api/episodes/missing-srt` | GET | 获取待转录任务列表 |
| `/api/save-srt` | POST | 保存生成好的字幕（保存后自动触发歌词翻译） |
| `/api/summary` | POST | 调用 AI 生成内容摘要 |
| `/api/translate` | POST | 调用 AI 翻译歌词/字幕，结果缓存到 `episodes.translation` |
| `/media/*` | GET | 访问本地缓存的音频文件 |
| `/doc` | GET | 查看详细 API 文档 |

## 🌐 歌词翻译 (服务端)

翻译在服务端完成：按 SRT 条目分批送给 LLM（OpenAI 兼容接口），**只翻译文本、原样保留时间轴**，
结果以 SRT 格式写回 `episodes.translation`，同时记录 `translation_lang` 与 `translation_status`
（`pending` / `completed` / `failed`）。

- **自动翻译**：`/api/save-srt` 保存字幕成功后，后台异步翻译（不阻塞转录客户端）。
- **手动翻译**：

  ```bash
  curl -X POST http://localhost:58081/api/translate \
    -H 'Content-Type: application/json' \
    -d '{"guid":"<episode-guid>"}'
  ```

  可选字段：`srtContent`（不传则读取库中已有字幕）、`force`（忽略缓存重新翻译）。
  已有译文时直接返回缓存，响应带 `"cached": true`。

> **密钥与语言都在服务端**：请求不接受 `apiKey` / `apiBase` / `model`，客户端无需也无法配置 LLM 密钥；
> 目标语言统一由 `TRANSLATE_TARGET_LANG` 决定，传入不一致的 `targetLang` 会返回 400。
> 译文存放在共享的 `episodes` 表，全站只翻译一次，所有用户读同一份。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPENAI_API_KEY` | 无 | LLM 密钥；未配置时自动翻译会跳过 |
| `OPENAI_API_BASE` | `https://api.openai.com/v1` | OpenAI 兼容接口地址 |
| `OPENAI_MODEL` | `gpt-3.5-turbo` | 使用的模型 |
| `TRANSLATE_TARGET_LANG` | `中文` | 默认翻译目标语言 |
| `AUTO_TRANSLATE` | `true` | 设为 `false` 关闭转录完成后的自动翻译 |

## 语音转录同步 (Client Sync)

本项目采用“被动拉取”架构，由本地客户端（如具有 GPU 加速的 Mac）负责转录任务。

### 客户端配置 (本地 Mac/PC)

1. **安装依赖**:
   ```bash
   pip install openai-whisper yt-dlp torch requests
   # 如果是 Mac，建议安装 ffmpeg
   brew install ffmpeg
   ```

2. **配置并运行**:
   脚本位于 `tools/transcription/sync_subtitles.py`。
   ```bash
   export VPS_URL="https://your-podcast-api.com"
   python tools/transcription/sync_subtitles.py
   ```

3. **设置定时任务 (Crontab)**:
   建议每 15-30 分钟同步一次：
   ```bash
   */15 * * * * cd /path/to/project && export VPS_URL="..." && /usr/bin/python3 tools/transcription/sync_subtitles.py >> sync.log 2>&1
   ```

## 🔧 开发与测试

```bash
# 运行单元测试 (主要针对 RSS 解析)
go test ./internal/rss/...

# 构建二进制文件
go build -o molten-server .
```

##  Docker 生产部署

推荐使用 `docker-compose.yml` 管理。确保挂载了 `pb_data` 以持久化数据库：

```bash
# 启动
docker-compose up -d
```

## 🔐 安全建议

1. 部署后请第一时间登录管理后台设置超级管理员账号。
2. 内部 API 默认允许匿名访问，建议通过 PocketBase 的 API Rules 设置权限。
3. 使用 HTTPS 保护管理界面。

## 📄 许可证

MIT License
