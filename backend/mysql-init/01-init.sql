-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS molten_music CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE molten_music;

-- 设置时区
SET time_zone = '+00:00';

-- 优化配置
SET GLOBAL max_connections = 200;
SET GLOBAL wait_timeout = 28800;
SET GLOBAL interactive_timeout = 28800;
