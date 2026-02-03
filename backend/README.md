# Molten Music Backend

播客管理系统后端服务，支持 SQLite 和 MySQL 数据库。

## ✨ 功能特性

- 🎵 播客频道管理
- 📥 音频下载和缓存
- 🎙️ Whisper AI 自动转录
- 🤖 LLM 智能摘要
- 💾 SQLite/MySQL 双数据库支持
- 🐳 Docker 一键部署

## 🚀 快速开始

### 本地开发

```bash
# 安装依赖（首次运行）
go mod download

# 启动服务（默认使用 SQLite）
go run main.go

# 使用 MySQL
export DB_TYPE=mysql
export DB_DSN="user:password@tcp(localhost:3306)/molten_music?charset=utf8mb4&parseTime=True&loc=Local"
go run main.go
```

### Docker 部署

```bash
# SQLite 模式（开发环境）
docker-compose up -d

# MySQL 模式（生产环境）
cp .env.mysql .env
docker-compose --profile mysql up -d
```

详细说明请查看 [DOCKER.md](DOCKER.md)

## 📋 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DB_TYPE` | 数据库类型 (`sqlite`/`mysql`) | `sqlite` |
| `DB_PATH` | SQLite 文件路径 | `data/molten.db` |
| `DB_DSN` | MySQL 连接字符串 | - |
| `WHISPER_SERVER_URL` | Whisper 服务地址 | - |

## 📁 项目结构

```
backend/
├── main.go              # 主程序
├── Dockerfile           # Docker 镜像
├── docker-compose.yml   # Docker 编排
├── .env.example         # 环境变量示例
├── .env.sqlite          # SQLite 配置模板
├── .env.mysql           # MySQL 配置模板
├── DATABASE.md          # 数据库文档
├── DOCKER.md            # Docker 文档
├── data/                # SQLite 数据目录
├── media_cache/         # 音频缓存目录
└── mysql-init/          # MySQL 初始化脚本
```

## 🔌 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/channels` | GET | 获取频道列表 |
| `/api/channels/:id/episodes` | GET | 获取节目列表 |
| `/api/download` | POST | 下载音频 |
| `/api/transcribe` | POST | 转录音频 |
| `/api/summary` | POST | 生成摘要 |
| `/api/save-srt` | POST | 保存字幕 |
| `/media/*` | GET | 流式播放音频 |

## 🗄️ 数据库

### SQLite（默认）

```bash
# 无需配置，直接运行
go run main.go
```

数据存储在 `data/molten.db`

### MySQL

```bash
# 1. 创建数据库
mysql -u root -p
CREATE DATABASE molten_music CHARACTER SET utf8mb4;

# 2. 配置环境变量
export DB_TYPE=mysql
export DB_DSN="root:password@tcp(localhost:3306)/molten_music?charset=utf8mb4&parseTime=True&loc=Local"

# 3. 运行
go run main.go
```

详细配置请查看 [DATABASE.md](DATABASE.md)

## 🔧 开发

```bash
# 安装依赖
go mod download

# 运行
go run main.go

# 构建
go build -o molten-server

# 测试
go test ./...

# 格式化代码
go fmt ./...
```

## 📦 依赖

- Go 1.21+
- GORM (ORM 框架)
- SQLite/MySQL 驱动
- gofeed (RSS 解析)

## 🐳 Docker

```bash
# 构建镜像
docker build -t molten-backend .

# 运行容器
docker run -d \
  -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  -e DB_TYPE=sqlite \
  molten-backend
```

## 📚 文档

- [Docker 部署指南](DOCKER.md)
- [数据库配置](DATABASE.md)
- [环境变量示例](.env.example)

## 🔐 安全建议

1. 不要提交 `.env` 文件到 Git
2. 生产环境使用强密码
3. 限制 API 访问（添加认证）
4. 定期备份数据库
5. 使用 HTTPS

## 📄 许可证

MIT License
