.PHONY: help sqlite mysql stop logs clean backup restart build status

# 默认目标
help:
	@echo "Molten Music - Docker 管理命令"
	@echo ""
	@echo "使用方法:"
	@echo "  make sqlite       - 启动 SQLite 版本（开发环境）"
	@echo "  make mysql        - 启动 MySQL 版本（生产环境）"
	@echo "  make stop         - 停止所有服务"
	@echo "  make logs         - 查看日志"
	@echo "  make restart      - 重启服务"
	@echo "  make clean        - 清理所有数据和容器"
	@echo "  make backup       - 备份数据库"
	@echo "  make build        - 构建镜像"
	@echo "  make status       - 查看服务状态"
	@echo ""
	@echo "配置文件:"
	@echo "  .env.sqlite       - SQLite 配置模板"
	@echo "  .env.mysql        - MySQL 配置模板"
	@echo ""

# 启动 SQLite 版本
sqlite:
	@echo "🚀 启动 SQLite 版本..."
	@if [ ! -f .env ]; then \
		echo "📝 创建 .env 文件..."; \
		cp .env.sqlite .env; \
	fi
	@echo "DB_TYPE=sqlite" > .env.tmp
	@grep -v "^DB_TYPE=" .env >> .env.tmp || true
	@mv .env.tmp .env
	docker-compose up -d backend
	@echo "✅ SQLite 版本已启动"
	@echo "📊 访问: http://localhost:8080/api/channels"
	@echo "📝 查看日志: make logs"

# 启动 MySQL 版本
mysql:
	@echo "🚀 启动 MySQL 版本..."
	@if [ ! -f .env ]; then \
		echo "📝 创建 .env 文件..."; \
		cp .env.mysql .env; \
	fi
	@echo "DB_TYPE=mysql" > .env.tmp
	@grep -v "^DB_TYPE=" .env >> .env.tmp || true
	@mv .env.tmp .env
	docker-compose --profile mysql up -d
	@echo "⏳ 等待 MySQL 就绪..."
	@sleep 10
	@echo "✅ MySQL 版本已启动"
	@echo "📊 访问: http://localhost:8080/api/channels"
	@echo "📝 查看日志: make logs"

# 停止服务
stop:
	@echo "⏹️  停止所有服务..."
	docker-compose down
	docker-compose --profile mysql down
	@echo "✅ 所有服务已停止"

# 查看日志
logs:
	@docker-compose logs -f

# 重启服务
restart:
	@echo "🔄 重启服务..."
	@if grep -q "DB_TYPE=mysql" .env 2>/dev/null; then \
		docker-compose --profile mysql restart; \
	else \
		docker-compose restart backend; \
	fi
	@echo "✅ 重启完成"

# 备份数据
backup:
	@echo "💾 备份数据..."
	@mkdir -p backups
	@if grep -q "DB_TYPE=mysql" .env 2>/dev/null && docker ps | grep -q molten-mysql; then \
		echo "备份 MySQL 数据库..."; \
		docker exec molten-mysql mysqldump -u molten -pmoltenpass molten_music > backups/molten-$$(date +%Y%m%d-%H%M%S).sql; \
		echo "✅ MySQL 备份完成"; \
	elif [ -f backend/data/molten.db ]; then \
		echo "备份 SQLite 数据库..."; \
		cp backend/data/molten.db backups/molten-$$(date +%Y%m%d-%H%M%S).db; \
		echo "✅ SQLite 备份完成"; \
	else \
		echo "❌ 没有找到数据库文件"; \
	fi

# 清理所有数据
clean:
	@echo "⚠️  警告: 这将删除所有数据和容器!"
	@read -p "确认继续? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "🧹 清理中..."; \
		docker-compose down -v; \
		docker-compose --profile mysql down -v; \
		rm -rf backend/data/molten.db; \
		echo "✅ 清理完成"; \
	else \
		echo "❌ 已取消"; \
	fi

# 构建镜像
build:
	@echo "🔨 构建 Docker 镜像..."
	docker-compose build --no-cache
	@echo "✅ 构建完成"

# 查看状态
status:
	@echo "📊 服务状态:"
	@docker-compose ps
