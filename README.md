# Molten Music - 播客管理系统

一个功能完整的播客管理和播放系统，支持自动转录、AI 摘要和多种部署方式。

## ✨ 主要功能

- 🎵 **播客管理**：订阅、下载、播放播客
- 🎙️ **自动转录**：集成 Whisper AI 自动生成字幕
- 🤖 **AI 摘要**：使用 LLM 生成播客内容摘要
- 💾 **灵活存储**：支持 SQLite 和 MySQL 数据库
- 🐳 **Docker 部署**：一键启动，支持多种配置
- 🖥️ **桌面应用**：基于 Electron 的跨平台客户端

## 🚀 快速开始

### 方式 1: 使用 Makefile（推荐）

```bash
# 查看所有命令
make help

# 启动 SQLite 版本（开发环境）
make sqlite

# 启动 MySQL 版本（生产环境）
make mysql

# 查看日志
make logs

# 停止服务
make stop
```

### 方式 2: 使用 Docker Compose

```bash
# SQLite 版本
docker-compose --profile sqlite up -d

# MySQL 版本
docker-compose --profile mysql up -d

# 停止
docker-compose --profile sqlite down
# 或
docker-compose --profile mysql down
```

### 方式 3: 本地开发

```bash
# 启动后端
cd backend
go run main.go

# 启动前端（新终端）
cd ..
yarn dev
```

## 📋 系统架构

```
┌─────────────────┐
│  Electron 前端  │
│  (React + TS)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│   Go 后端 API   │─────▶│  SQLite/MySQL│
│   (Port 8080)   │      │   数据库     │
└────────┬────────┘      └──────────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐ ┌──────────────┐
│ Whisper Server  │ │  LLM API     │
│  (转录服务)     │ │  (摘要服务)  │
└─────────────────┘ └──────────────┘
```

## 🗄️ 数据库配置

### SQLite（默认）

```bash
# 无需配置，直接运行
go run main.go
```

### MySQL

```bash
# 设置环境变量
export DB_TYPE=mysql
export DB_DSN="user:password@tcp(host:port)/database?charset=utf8mb4&parseTime=True&loc=Local"

# 运行
go run main.go
```

详细配置请查看 [`backend/DATABASE.md`](backend/DATABASE.md)

## 🐳 Docker 部署

### SQLite 版本（单容器）

```bash
docker-compose --profile sqlite up -d
```

**特点**：
- ✅ 快速启动
- ✅ 数据存储在本地文件
- ✅ 适合开发和小规模部署

### MySQL 版本（双容器）

```bash
docker-compose --profile mysql up -d
```

**特点**：
- ✅ 更好的性能
- ✅ 支持高并发
- ✅ 适合生产环境

详细说明请查看 [`DOCKER.md`](DOCKER.md)

## 🎙️ Whisper 转录服务

### 配置

在 `backend/main.go` 中设置：

```go
const WHISPER_SERVER_URL = "http://your-whisper-server:9999"
```

或使用环境变量：

```bash
export WHISPER_SERVER_URL="http://your-whisper-server:9999"
```

### 部署 Whisper 服务

参考 [`docker-compose.whisper.yml`](docker-compose.whisper.yml)：

```bash
docker-compose -f docker-compose.whisper.yml up -d
```

## 📁 项目结构

```
molten-music/
├── backend/              # Go 后端
│   ├── main.go          # 主程序
│   ├── Dockerfile       # Docker 镜像
│   ├── DATABASE.md      # 数据库文档
│   └── .env.example     # 环境变量示例
├── electron/            # Electron 主进程
├── src/                 # React 前端
├── docker-compose.yml   # Docker 编排
├── docker-compose.whisper.yml  # Whisper 服务
├── Makefile            # 快捷命令
├── DOCKER.md           # Docker 文档
└── README.md           # 本文件
```

## 🔧 环境变量

### 后端配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DB_TYPE` | 数据库类型 | `sqlite` |
| `DB_PATH` | SQLite 路径 | `data/molten.db` |
| `DB_DSN` | MySQL 连接串 | - |
| `WHISPER_SERVER_URL` | Whisper 服务地址 | - |

### 前端配置

在 `src/store/settingsStore.ts` 中配置：

- API 地址
- LLM 配置
- 播放器设置

## 📊 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/channels` | GET | 获取频道列表 |
| `/api/channels/:id/episodes` | GET | 获取节目列表 |
| `/api/download` | POST | 下载音频 |
| `/api/transcribe` | POST | 转录音频 |
| `/api/summary` | POST | 生成摘要 |
| `/media/*` | GET | 流式播放音频 |

## 🛠️ 开发

### 前端开发

```bash
yarn dev
```

### 后端开发

```bash
cd backend
go run main.go
```

### 构建

```bash
# 前端构建
yarn build

# 后端构建
cd backend
go build -o molten-server

# Docker 构建
docker-compose build
```

## 📦 依赖

### 后端

- Go 1.21+
- GORM (ORM)
- SQLite/MySQL 驱动
- gofeed (RSS 解析)

### 前端

- React 18
- TypeScript
- Electron
- Zustand (状态管理)
- Vite (构建工具)

## 🔐 安全建议

1. **不要提交敏感信息**到 Git
2. **使用环境变量**存储密码和密钥
3. **生产环境使用 HTTPS**
4. **定期备份数据库**
5. **限制 API 访问**（添加认证）

## 📝 常用命令

```bash
# 启动开发环境
make sqlite

# 查看日志
make logs

# 备份数据
make backup

# 重启服务
make restart

# 停止服务
make stop

# 清理数据（谨慎使用）
make clean
```

## 🐛 故障排查

### 后端无法启动

```bash
# 检查端口占用
lsof -i :8080

# 查看日志
docker-compose --profile sqlite logs backend-sqlite
```

### 数据库连接失败

```bash
# MySQL 版本 - 检查 MySQL 状态
docker-compose --profile mysql logs mysql

# 确认 MySQL 就绪
docker exec molten-mysql mysqladmin ping -h localhost -u root -prootpassword
```

### Whisper 转录失败

1. 检查 Whisper 服务是否运行
2. 确认 URL 配置正确
3. 查看后端日志中的错误信息

## 📚 文档

- [数据库配置](backend/DATABASE.md)
- [Docker 部署](DOCKER.md)
- [环境变量示例](backend/.env.example)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [Whisper](https://github.com/openai/whisper) - 语音识别
- [faster-whisper-server](https://github.com/fedirz/faster-whisper-server) - Whisper 服务器
- [GORM](https://gorm.io/) - Go ORM
- [Electron](https://www.electronjs.org/) - 桌面应用框架
