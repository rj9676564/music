package main

import (
	"log"
	"os"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 复用主程序的模型定义
type Channel struct {
	ID          string    `json:"id" gorm:"primaryKey"`
	Name        string    `json:"name"`
	Author      string    `json:"author"`
	RSS         string    `json:"rss"`
	Description string    `json:"description"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Episode struct {
	GUID          string    `json:"guid" gorm:"primaryKey"`
	ChannelID     string    `json:"channel_id" gorm:"index"`
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	Link          string    `json:"link"`
	PubDate       time.Time `json:"pub_date"`
	AudioURL      string    `json:"audioUrl"`
	Duration      string    `json:"duration"`
	LocalAudioPath string   `json:"local_audio_path"`
	SrtContent    string    `json:"srt_content" gorm:"type:text"`
	Summary       string    `json:"summary" gorm:"type:text"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func main() {
	// 1. 配置
	sqlitePath := "../../data/molten.db"
	mysqlDSN := os.Getenv("DB_DSN")
	
	if mysqlDSN == "" {
		log.Fatal("❌ 请设置 DB_DSN 环境变量指向目标 MySQL 数据库")
	}

	// 2. 连接 SQLite
	log.Printf("📂 打开 SQLite 数据库: %s", sqlitePath)
	sqliteDB, err := gorm.Open(sqlite.Open(sqlitePath), &gorm.Config{})
	if err != nil {
		log.Fatal("❌ 无法连接 SQLite:", err)
	}

	// 3. 连接 MySQL
	log.Printf("🔌 连接 MySQL 数据库...")
	mysqlDB, err := gorm.Open(mysql.Open(mysqlDSN), &gorm.Config{})
	if err != nil {
		log.Fatal("❌ 无法连接 MySQL:", err)
	}

	// 4. 自动迁移 MySQL schema
	log.Println("🔄 正在迁移数据库结构...")
	err = mysqlDB.AutoMigrate(&Channel{}, &Episode{})
	if err != nil {
		log.Fatal("❌ Schema 迁移失败:", err)
	}

	// 5. 迁移 Channels
	var channels []Channel
	sqliteDB.Find(&channels)
	log.Printf("📦 发现 %d 个频道，正在迁移...", len(channels))
	
	if len(channels) > 0 {
		err = mysqlDB.Clauses(clause.OnConflict{UpdateAll: true}).Create(&channels).Error
		if err != nil {
			log.Printf("⚠️ 频道迁移部分失败: %v", err)
		}
	}
	log.Println("✅ 频道迁移完成")

	// 6. 迁移 Episodes
	// 由于节目可能很多，分批迁移
	var count int64
	sqliteDB.Model(&Episode{}).Count(&count)
	log.Printf("📦 发现 %d 个节目，开始分批迁移...", count)

	batchSize := 100
	var episodes []Episode
	
	for offset := 0; offset < int(count); offset += batchSize {
		result := sqliteDB.Limit(batchSize).Offset(offset).Find(&episodes)
		if result.Error != nil {
			log.Printf("❌ 读取批次失败 (offset %d): %v", offset, result.Error)
			continue
		}

		if len(episodes) == 0 {
			break
		}

		// 写入 MySQL
		err = mysqlDB.Clauses(clause.OnConflict{UpdateAll: true}).Create(&episodes).Error
		if err != nil {
			log.Printf("❌ 写入批次失败 (offset %d): %v", offset, err)
		} else {
			log.Printf("✅ 已迁移 %d/%d 个节目...", offset+len(episodes), count)
		}
	}

	log.Println("🎉 所有数据迁移完成！")
}
