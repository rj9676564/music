# Molten Music - 播客管理系统

一个功能完整的播客管理和播放系统，支持自动转录、AI 摘要和多种部署方式。

## 📁 项目结构

项目已进行目录重构，职责划分更清晰：

```
molten-music/
├── backend/            # Go + PocketBase 后端
│   ├── main.go         # 核心逻辑
│   └── pb_data/        # 数据库存储
├── frontend/           # React + Electron 前端
│   ├── src/            # 前端源码
│   ├── electron/       # 打包脚本与主进程
│   └── package.json    # 前端依赖配置
└── tools/              # 辅助工具
    └── transcription/  # 本地语音转录脚本 (Python)
```

## 🚀 快速开始

### 1. 启动后端 (Docker)

```bash
cd backend
docker-compose up -d
```

访问 `http://localhost:58081/_/` 进入管理后台。

### 2. 启动前端 (本地开发)

```bash
cd frontend
yarn install
yarn dev
```

### 3. 本地打包 (macOS)

```bash
cd frontend
yarn build:mac-local
```

安装包将生成在 `frontend/dist/` 下。

### 4. 语音转录 (本地 Mac 运行)

```bash
export VPS_URL="http://你的VPS地址:58081"
python tools/transcription/sync_subtitles.py
```

## 📖 详细文档

- [后端 README](backend/README.md) - 获取关于 PocketBase 配置和 API 的更多信息。
- [转录工具说明](tools/transcription/sync_subtitles.py) - 了解本地 GPU 加速转录的原理。

## 📄 许可证

MIT License
