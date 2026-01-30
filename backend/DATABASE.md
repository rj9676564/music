# 数据库配置说明

## 功能特性

✅ **动态切换数据库**：支持 SQLite 和 MySQL
✅ **环境变量配置**：灵活的配置方式
✅ **自动迁移**：启动时自动创建表结构
✅ **数据初始化**：自动填充初始频道数据

## 使用方法

### 方式 1: SQLite（默认，推荐开发环境）

直接运行，无需配置：
```bash
go run main.go
```

或指定自定义路径：
```bash
export DB_TYPE=sqlite
export DB_PATH=data/my_podcast.db
go run main.go
```

**优点**：
- 零配置
- 单文件数据库
- 适合开发和小规模部署

### 方式 2: MySQL（推荐生产环境）

#### 1. 准备 MySQL 数据库

```sql
CREATE DATABASE molten_music CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'molten'@'%' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON molten_music.* TO 'molten'@'%';
FLUSH PRIVILEGES;
```

#### 2. 配置环境变量

```bash
export DB_TYPE=mysql
export DB_DSN="molten:your_password@tcp(localhost:3306)/molten_music?charset=utf8mb4&parseTime=True&loc=Local"
go run main.go
```

#### 3. 使用 .env 文件（推荐）

创建 `backend/.env` 文件：
```bash
DB_TYPE=mysql
DB_DSN=molten:your_password@tcp(localhost:3306)/molten_music?charset=utf8mb4&parseTime=True&loc=Local
```

然后使用 `godotenv` 或 `direnv` 加载环境变量。

**优点**：
- 更好的性能
- 支持并发
- 适合生产环境
- 易于备份和迁移

## Docker Compose 配置

### SQLite 版本

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - DB_TYPE=sqlite
      - DB_PATH=data/molten.db
```

### MySQL 版本

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: molten_music
      MYSQL_USER: molten
      MYSQL_PASSWORD: moltenpass
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"

  backend:
    build: ./backend
    depends_on:
      - mysql
    ports:
      - "8080:8080"
    environment:
      - DB_TYPE=mysql
      - DB_DSN=molten:moltenpass@tcp(mysql:3306)/molten_music?charset=utf8mb4&parseTime=True&loc=Local
    volumes:
      - ./media_cache:/app/media_cache

volumes:
  mysql_data:
```

## 数据迁移

### 从 SQLite 迁移到 MySQL

1. **导出 SQLite 数据**：
```bash
sqlite3 data/molten.db .dump > backup.sql
```

2. **转换并导入 MySQL**：
使用工具如 `sqlite3-to-mysql` 或手动调整 SQL 语法

3. **切换配置**：
```bash
export DB_TYPE=mysql
export DB_DSN="..."
```

### 从 MySQL 迁移到 SQLite

1. **导出 MySQL 数据**：
```bash
mysqldump -u molten -p molten_music > backup.sql
```

2. **转换并导入 SQLite**：
调整 SQL 语法并导入

## 环境变量参考

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `DB_TYPE` | 数据库类型 | `sqlite` | `mysql`, `sqlite` |
| `DB_PATH` | SQLite 文件路径 | `data/molten.db` | `data/podcast.db` |
| `DB_DSN` | MySQL 连接字符串 | - | `user:pass@tcp(host:port)/db?...` |

## 故障排查

### MySQL 连接失败

```
❌ Failed to connect to MySQL database: dial tcp: lookup mysql: no such host
```

**解决方案**：
- 检查 MySQL 服务是否运行
- 确认 DSN 中的主机名和端口正确
- 检查网络连接和防火墙设置

### 权限错误

```
❌ Failed to migrate database: Error 1142: CREATE command denied
```

**解决方案**：
```sql
GRANT ALL PRIVILEGES ON molten_music.* TO 'molten'@'%';
FLUSH PRIVILEGES;
```

### 字符集问题

确保 MySQL 使用 UTF8MB4：
```sql
ALTER DATABASE molten_music CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 性能优化建议

### SQLite
- 使用 WAL 模式：`PRAGMA journal_mode=WAL;`
- 定期 VACUUM 清理

### MySQL
- 添加索引到常用查询字段
- 配置连接池
- 启用查询缓存

## 安全建议

1. **不要在代码中硬编码密码**
2. **使用环境变量或密钥管理服务**
3. **限制数据库用户权限**
4. **定期备份数据**
5. **使用 SSL/TLS 连接（生产环境）**
