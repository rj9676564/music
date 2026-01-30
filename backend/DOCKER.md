# Docker 快速使用指南

## 📋 前置准备

确保已安装：
- Docker
- Docker Compose

## 🚀 快速开始

### 方式 1: SQLite（开发环境，推荐）

```bash
cd backend

# 1. 创建 .env 文件（或直接使用默认配置）
cp .env.sqlite .env

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f
```

### 方式 2: MySQL（生产环境）

```bash
cd backend

# 1. 创建 .env 文件
cp .env.mysql .env

# 2. 修改密码（可选）
vim .env  # 修改 MYSQL_PASSWORD 等

# 3. 启动服务（包括 MySQL）
docker-compose --profile mysql up -d

# 4. 查看日志
docker-compose logs -f
```

## 📝 环境变量配置

### SQLite 配置（.env.sqlite）

```bash
DB_TYPE=sqlite
DB_PATH=data/molten.db
BACKEND_PORT=8080
WHISPER_SERVER_URL=http://d.mrlb.top:9999
TZ=Asia/Shanghai
```

### MySQL 配置（.env.mysql）

```bash
DB_TYPE=mysql
DB_DSN=molten:your_password@tcp(mysql:3306)/molten_music?charset=utf8mb4&parseTime=True&loc=Local

MYSQL_ROOT_PASSWORD=your_root_password
MYSQL_DATABASE=molten_music
MYSQL_USER=molten
MYSQL_PASSWORD=your_password
MYSQL_PORT=3306

BACKEND_PORT=8080
WHISPER_SERVER_URL=http://d.mrlb.top:9999
TZ=Asia/Shanghai
```

## 🔧 常用命令

```bash
cd backend

# 启动服务
docker-compose up -d                    # SQLite 模式
docker-compose --profile mysql up -d    # MySQL 模式

# 停止服务
docker-compose down

# 查看日志
docker-compose logs -f
docker-compose logs -f backend          # 只看后端日志
docker-compose logs -f mysql            # 只看 MySQL 日志

# 重启服务
docker-compose restart

# 查看状态
docker-compose ps

# 进入容器
docker exec -it molten-backend sh
docker exec -it molten-mysql mysql -u molten -p

# 重新构建
docker-compose build --no-cache
docker-compose up -d --build
```

## 💾 数据备份

### SQLite

```bash
# 备份
cp backend/data/molten.db backup/molten-$(date +%Y%m%d).db

# 恢复
cp backup/molten-20260130.db backend/data/molten.db
```

### MySQL

```bash
# 备份
docker exec molten-mysql mysqldump -u molten -p molten_music > backup/molten-$(date +%Y%m%d).sql

# 恢复
docker exec -i molten-mysql mysql -u molten -p molten_music < backup/molten-20260130.sql
```

## 🔄 切换数据库

### 从 SQLite 切换到 MySQL

```bash
cd backend

# 1. 停止当前服务
docker-compose down

# 2. 修改 .env
echo "DB_TYPE=mysql" > .env
cat .env.mysql >> .env

# 3. 启动 MySQL 模式
docker-compose --profile mysql up -d
```

### 从 MySQL 切换到 SQLite

```bash
cd backend

# 1. 停止当前服务
docker-compose down

# 2. 修改 .env
cp .env.sqlite .env

# 3. 启动 SQLite 模式
docker-compose up -d
```

## 🧹 清理

```bash
cd backend

# 停止并删除容器
docker-compose down

# 停止并删除容器 + 数据卷
docker-compose down -v

# 删除 SQLite 数据库
rm data/molten.db
```

## 🐛 故障排查

### 端口被占用

修改 `.env` 中的端口：
```bash
BACKEND_PORT=8081
MYSQL_PORT=3307
```

### MySQL 连接失败

```bash
# 检查 MySQL 是否就绪
docker-compose logs mysql

# 等待看到这行日志：
# [Server] /usr/sbin/mysqld: ready for connections

# 手动测试连接
docker exec molten-mysql mysqladmin ping -h localhost -u root -p
```

### 查看详细错误

```bash
# 查看所有日志
docker-compose logs

# 查看最近 100 行
docker-compose logs --tail 100

# 实时跟踪日志
docker-compose logs -f
```

## 📊 验证服务

```bash
# 测试 API
curl http://localhost:8080/api/channels

# 应该返回频道列表 JSON
```

## 🔐 生产环境建议

1. **修改默认密码**
   ```bash
   # 在 .env 中设置强密码
   MYSQL_ROOT_PASSWORD=your_strong_password
   MYSQL_PASSWORD=your_strong_password
   ```

2. **使用 MySQL**
   ```bash
   DB_TYPE=mysql
   ```

3. **配置反向代理**（Nginx/Traefik）

4. **启用 HTTPS**

5. **定期备份数据**

6. **限制资源使用**
   在 `docker-compose.yml` 中添加：
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '2'
         memory: 2G
   ```

## 📚 相关文档

- [数据库配置详解](DATABASE.md)
- [环境变量示例](.env.example)
- [主项目 README](../README.md)
