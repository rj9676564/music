package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/mmcdole/gofeed"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"sort"
)

// DB Models
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
	ChannelID     string    `json:"channel_id" gorm:"index:idx_channel_pubdate"`
	Title         string    `json:"title"`
	Description   string    `json:"description" gorm:"type:text"`
	Link          string    `json:"link"`
	PubDate       time.Time `json:"pub_date" gorm:"index:idx_channel_pubdate"`
	AudioURL      string    `json:"audioUrl"` // Standardized to matches frontend expectation
	Duration      string    `json:"duration"`
	LocalAudioPath string   `json:"local_audio_path"`
	SrtContent    string    `json:"srt_content" gorm:"type:text"`
	Summary       string    `json:"summary" gorm:"type:text"`
	TranscriptionStatus string `json:"transcription_status" gorm:"default:''"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// 转录任务
type TranscriptionTask struct {
	GUID      string
	AudioURL  string
	LocalPath string
	Title     string
	AddedAt   time.Time
}

// 转录队列
type TranscriptionQueue struct {
	tasks    []TranscriptionTask
	mu       sync.Mutex
	processing bool
}

var db *gorm.DB
var transcriptionQueue *TranscriptionQueue


func initDB() {
	var err error
	
	// 从环境变量读取数据库类型，默认为 sqlite
	dbType := os.Getenv("DB_TYPE")
	if dbType == "" {
		dbType = "sqlite"
	}
	
	switch dbType {
	case "mysql":
		// MySQL 配置
		// 格式: user:password@tcp(host:port)/dbname?charset=utf8mb4&parseTime=True&loc=Local
		dsn := os.Getenv("DB_DSN")
		if dsn == "" {
			// 默认配置
			dsn = "root:password@tcp(localhost:3306)/molten_music?charset=utf8mb4&parseTime=True&loc=Local"
			log.Printf("⚠️  Using default MySQL DSN. Set DB_DSN environment variable for custom config.")
		}
		
		log.Printf("📊 Connecting to MySQL database...")
		db, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
		if err != nil {
			log.Fatal("❌ Failed to connect to MySQL database:", err)
		}
		log.Printf("✅ Connected to MySQL database")
		
	case "sqlite":
		// SQLite 配置
		if err := os.MkdirAll("data", 0755); err != nil {
			log.Fatal("Failed to create data directory:", err)
		}
		
		dbPath := os.Getenv("DB_PATH")
		if dbPath == "" {
			dbPath = "data/molten.db"
		}
		
		log.Printf("📊 Connecting to SQLite database: %s", dbPath)
		db, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
		if err != nil {
			log.Fatal("❌ Failed to connect to SQLite database:", err)
		}
		log.Printf("✅ Connected to SQLite database")
		
	default:
		log.Fatalf("❌ Unsupported database type: %s (supported: sqlite, mysql)", dbType)
	}

	// Auto Migrate
	log.Printf("🔄 Running database migrations...")
	err = db.AutoMigrate(&Channel{}, &Episode{})
	if err != nil {
		log.Fatal("❌ Failed to migrate database:", err)
	}
	log.Printf("✅ Database migrations completed")

	// Seed initial channels if empty
	var count int64
	db.Model(&Channel{}).Count(&count)
	if count == 0 {
		log.Printf("🌱 Seeding initial channels...")
		initialChannels := []Channel{
			{ID: "the-daily", Name: "The Daily", Author: "The New York Times", RSS: "https://feeds.simplecast.com/54nAGcIl", Description: "This is how the news should sound."},
			{ID: "crime-junkie", Name: "Crime Junkie", Author: "audiochuck", RSS: "https://feeds.simplecast.com/qm_9xx0g", Description: "If you can never get enough true crime... Congratulations, you're a Crime Junkie!"},
			{ID: "pod-save-america", Name: "Pod Save America", Author: "Crooked Media", RSS: "https://feeds.simplecast.com/dxZsm5kX", Description: "A political podcast for people who aren't ready to give up yet."},
			{ID: "mel-robbins", Name: "The Mel Robbins Podcast", Author: "Mel Robbins", RSS: "https://feeds.simplecast.com/UCwaTX1J", Description: "Systems to change your life from the global expert on behavior change."},
			{ID: "allearsenglish", Name: "All Ears English", Author: "All Ears English", RSS: "https://feeds.megaphone.fm/allearsenglish", Description: "Are you looking for a new way to learn English?"},
			{ID: "techmeme-ride-home", Name: "Techmeme Ride Home", Author: "Techmeme", RSS: "https://rsshub.app/spotify/show/6qXldSz1Ulq1Nvj2JK5kSR", Description: "The day's tech news, every day at 5pm ET."},
			{ID: "gcores", Name: "机核 GCORES", Author: "GCORES", RSS: "https://wiki.dio.wtf/gcores", Description: "Share the core culture of games."},
			{ID: "vergecast", Name: "The Vergecast", Author: "The Verge", RSS: "https://feeds.megaphone.fm/vergecast", Description: "The flagship podcast of The Verge."},
		}

		for _, ch := range initialChannels {
			db.Where(Channel{ID: ch.ID}).FirstOrCreate(&ch)
		}
		log.Printf("✅ Seeded %d channels", len(initialChannels))
	}
}

// 初始化转录队列
func initTranscriptionQueue() {
	transcriptionQueue = &TranscriptionQueue{
		tasks:      make([]TranscriptionTask, 0),
		processing: false,
	}
	log.Printf("🎙️ Transcription queue initialized")
	
	// 启动后台处理器
	go transcriptionWorker()
}

// 添加任务到队列
func (q *TranscriptionQueue) AddTask(task TranscriptionTask) {
	q.mu.Lock()
	defer q.mu.Unlock()
	
	// 检查是否已经在队列中
	for _, t := range q.tasks {
		if t.GUID == task.GUID {
			log.Printf("⏭️  Task already in queue: %s", task.Title)
			return
		}
	}
	
	// 检查是否已经有字幕
	var episode Episode
	if err := db.Where("guid = ?", task.GUID).First(&episode).Error; err == nil {
		if episode.SrtContent != "" {
			log.Printf("✅ Episode already has subtitles: %s", task.Title)
			return
		}
	}
	
	db.Model(&Episode{}).Where("guid = ?", task.GUID).Update("transcription_status", "pending")
	q.tasks = append(q.tasks, task)
	log.Printf("➕ Added to transcription queue: %s (Queue size: %d)", task.Title, len(q.tasks))
}

// 获取下一个任务
func (q *TranscriptionQueue) GetNextTask() *TranscriptionTask {
	q.mu.Lock()
	defer q.mu.Unlock()
	
	if len(q.tasks) == 0 {
		return nil
	}
	
	task := q.tasks[0]
	q.tasks = q.tasks[1:]
	return &task
}

// 后台转录处理器
func transcriptionWorker() {
	log.Printf("🤖 Transcription worker started")
	
	for {
		task := transcriptionQueue.GetNextTask()
		if task == nil {
			time.Sleep(5 * time.Second) // 没有任务时等待
			continue
		}
		
		log.Printf("🎬 Processing transcription task: %s", task.Title)
		
		// 更新状态为处理中
		db.Model(&Episode{}).Where("guid = ?", task.GUID).Update("transcription_status", "processing")
		
		// 确保音频文件已下载
		if task.LocalPath == "" || !fileExists(task.LocalPath) {
			log.Printf("📥 Downloading audio for: %s", task.Title)
			localPath, err := downloadAudio(task.AudioURL, task.GUID)
			if err != nil {
				log.Printf("❌ Failed to download audio: %v", err)
				db.Model(&Episode{}).Where("guid = ?", task.GUID).Update("transcription_status", "failed")
				continue
			}
			task.LocalPath = localPath
			
			// 更新数据库
			db.Model(&Episode{}).Where("guid = ?", task.GUID).Updates(map[string]interface{}{
				"local_audio_path": localPath,
			})
		}
		
		// 执行转录
		srtContent, err := performTranscription(task.LocalPath)
		if err != nil {
			log.Printf("❌ Transcription failed for %s: %v", task.Title, err)
			db.Model(&Episode{}).Where("guid = ?", task.GUID).Update("transcription_status", "failed")
			continue
		}
		
		// 保存到数据库
		result := db.Model(&Episode{}).Where("guid = ?", task.GUID).Updates(map[string]interface{}{
			"srt_content":          srtContent,
			"transcription_status": "completed",
		})
		if result.Error != nil {
			log.Printf("❌ Failed to save SRT for %s: %v", task.Title, result.Error)
		} else {
			log.Printf("✅ Transcription completed and saved: %s", task.Title)
		}
	}
}

// 辅助函数：检查文件是否存在
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// 下载音频文件（独立函数，供队列使用）
func downloadAudio(audioURL, guid string) (string, error) {
	cacheDir := "media_cache"
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create cache dir: %v", err)
	}

	// Parse URL to get extension
	parsedURL, err := url.Parse(audioURL)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %v", err)
	}
	
	ext := filepath.Ext(parsedURL.Path)
	if ext == "" {
		ext = ".mp3"
	}
	
	fileName := fmt.Sprintf("%s%s", guid, ext)
	fileName = strings.ReplaceAll(fileName, "/", "_")
	fileName = strings.ReplaceAll(fileName, "?", "_")
	fileName = strings.ReplaceAll(fileName, "&", "_")
	localPath := filepath.Join(cacheDir, fileName)

	// Check if already exists
	if fileExists(localPath) {
		return localPath, nil
	}

	// Download
	out, err := os.Create(localPath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %v", err)
	}
	defer out.Close()

	resp, err := http.Get(audioURL)
	if err != nil {
		return "", fmt.Errorf("failed to download: %v", err)
	}
	defer resp.Body.Close()

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to write file: %v", err)
	}

	log.Printf("✅ Downloaded audio: %s (%.2f MB)", fileName, float64(getFileSize(localPath))/(1024*1024))
	return localPath, nil
}

// 执行转录（独立函数，供队列使用）
func performTranscription(localPath string) (string, error) {
	file, err := os.Open(localPath)
	if err != nil {
		return "", fmt.Errorf("failed to open file: %v", err)
	}
	defer file.Close()

	fileInfo, _ := file.Stat()
	
	// Prepare multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	
	part, err := writer.CreateFormFile("file", filepath.Base(localPath))
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %v", err)
	}
	
	_, err = io.Copy(part, file)
	if err != nil {
		return "", fmt.Errorf("failed to copy file content: %v", err)
	}
	
	writer.WriteField("model", "base")
	writer.WriteField("response_format", "srt")
	writer.Close()

	// Call Whisper API
	whisperURL := fmt.Sprintf("%s/v1/audio/transcriptions", WHISPER_SERVER_URL)
	proxyReq, err := http.NewRequest("POST", whisperURL, body)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}
	proxyReq.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 30 * time.Minute}
	start := time.Now()
	
	log.Printf("🚀 Sending to Whisper (%.2f MB)...", float64(fileInfo.Size())/(1024*1024))
	
	resp, err := client.Do(proxyReq)
	if err != nil {
		return "", fmt.Errorf("whisper request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("whisper returned %d: %s", resp.StatusCode, string(respBody))
	}

	srtContent, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %v", err)
	}

	duration := time.Since(start)
	log.Printf("✅ Transcription completed in %v (%d bytes)", duration, len(srtContent))
	
	return string(srtContent), nil
}

// 获取文件大小
func getFileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PATCH")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func listChannelsHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	var channels []Channel
	db.Find(&channels)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channels)
}

func channelEpisodesHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

    // Path should be /api/channels/{id}/episodes
    parts := strings.Split(r.URL.Path, "/")
    if len(parts) < 4 {
        http.Error(w, "Invalid path", http.StatusBadRequest)
        return
    }
    channelID := parts[3]

    // 获取频道信息
    var channel Channel
    if result := db.First(&channel, "id = ?", channelID); result.Error != nil {
         http.Error(w, "Channel not found", http.StatusNotFound)
         return
    }

    // 智能刷新逻辑：
    // 1. 明确请求刷新 (?refresh=true)
    // 2. 没有任何节目数据
    // 3. 频道超过 1 小时未更新
    refresh := r.URL.Query().Get("refresh") == "true"
    var count int64
    db.Model(&Episode{}).Where("channel_id = ?", channelID).Count(&count)
    
    // 检查最后更新时间
    needsRefresh := refresh || count == 0
    if !needsRefresh {
        // 检查频道的 updated_at 时间
        timeSinceUpdate := time.Since(channel.UpdatedAt)
        if timeSinceUpdate > 1*time.Hour {
            needsRefresh = true
            log.Printf("📡 Channel %s hasn't been updated for %v, refreshing...", channelID, timeSinceUpdate.Round(time.Minute))
        }
    }

    if needsRefresh {
        log.Printf("🔄 Fetching latest episodes for channel: %s", channel.Name)
        
        fp := gofeed.NewParser()
        feed, err := fp.ParseURL(channel.RSS)
        if err != nil {
            log.Printf("❌ Failed to parse RSS for %s: %v", channel.ID, err)
            // If parse fails, we still serve cached episodes
        } else {
            log.Printf("✅ Fetched %d items from RSS feed: %s", len(feed.Items), channel.Name)
            
            // 优化：如果不是初次导入，只处理最新的 50 条，避免全量更新太慢
            itemsToProcess := feed.Items
            if count > 0 && len(itemsToProcess) > 50 {
                itemsToProcess = itemsToProcess[:50]
                log.Printf("⚡ Optimization: Only processing latest 50 items (database already has data)")
            }

            // Save episodes
            newCount := 0
            updatedCount := 0
            for _, item := range itemsToProcess {
                pubDate := time.Now()
                if item.PublishedParsed != nil {
                    pubDate = *item.PublishedParsed
                }
                
                audioUrl := ""
                if len(item.Enclosures) > 0 {
                    audioUrl = item.Enclosures[0].URL
                }

                // 检查是否已存在 (使用 Find 避免 record not found 错误日志)
                var existing Episode
                result := db.Where("guid = ?", item.GUID).Limit(1).Find(&existing)
                isNew := result.RowsAffected == 0

                episode := Episode{
                    GUID:        item.GUID,
                    ChannelID:   channelID,
                    Title:       item.Title,
                    Description: item.Description,
                    Link:        item.Link,
                    PubDate:     pubDate,
                    AudioURL:    audioUrl,
                }
                
                // Upsert
                result = db.Clauses(clause.OnConflict{
                    Columns:   []clause.Column{{Name: "guid"}},
                    DoUpdates: clause.AssignmentColumns([]string{"title", "description", "audio_url", "pub_date", "updated_at"}),
                }).Create(&episode)
                
                if result.Error == nil {
                    if isNew {
                        newCount++
                    } else {
                        updatedCount++
                    }
                }
            }
            
            // 更新频道的 updated_at 时间
            db.Model(&channel).Update("updated_at", time.Now())
            
            log.Printf("📊 Channel %s: %d new episodes, %d updated", channel.Name, newCount, updatedCount)
        }
    }

    var episodes []Episode
    db.Where("channel_id = ?", channelID).Order("pub_date desc").Limit(50).Find(&episodes)
    
    // Check local files existence
    for i := range episodes {
        if episodes[i].LocalAudioPath != "" {
            if _, err := os.Stat(episodes[i].LocalAudioPath); os.IsNotExist(err) {
                 episodes[i].LocalAudioPath = "" // Reset if file deleted
                 db.Save(&episodes[i])
            }
        }
    }

    // Log SRT status summary
    srtCount := 0
    for _, ep := range episodes {
        if ep.SrtContent != "" {
            srtCount++
        }
    }
    log.Printf("📋 Fetched %d episodes for channel %s. %d have subtitles.", len(episodes), channelID, srtCount)

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "success": true,
        "episodes": episodes,
    })
}

// Download Audio
func downloadEpisodeHandler(w http.ResponseWriter, r *http.Request) {
    enableCors(&w)
    if r.Method == "OPTIONS" { w.WriteHeader(http.StatusOK); return }
    if r.Method != "POST" { http.Error(w, "Method not allowed", http.StatusMethodNotAllowed); return }

    var req struct {
        GUID string `json:"guid"`
        URL  string `json:"url"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // Ensure cache dir exists (mapped from docker volume or local)
    cacheDir := "media_cache"
    if err := os.MkdirAll(cacheDir, 0755); err != nil {
        http.Error(w, "Server storage error", http.StatusInternalServerError)
        return
    }

    // Parse URL to get clean extension without query params
    parsedURL, err := url.Parse(req.URL)
    if err != nil {
        http.Error(w, "Invalid URL", http.StatusBadRequest)
        return
    }
    
    // Extract extension from path, not full URL
    ext := filepath.Ext(parsedURL.Path)
    if ext == "" {
        ext = ".mp3" // Default fallback
    }
    
    fileName := fmt.Sprintf("%s%s", req.GUID, ext)
    
    // Sanitize filename
    fileName = strings.ReplaceAll(fileName, "/", "_")
    fileName = strings.ReplaceAll(fileName, "?", "_")
    fileName = strings.ReplaceAll(fileName, "&", "_")
    localPath := filepath.Join(cacheDir, fileName)

    // Check if already exists
    if _, err := os.Stat(localPath); err == nil {
         // Update DB just in case
         db.Model(&Episode{}).Where("guid = ?", req.GUID).Update("local_audio_path", localPath)
         json.NewEncoder(w).Encode(map[string]string{"path": localPath, "status": "exists"})
         return
    }

    // Download
    out, err := os.Create(localPath)
    if err != nil {
        http.Error(w, "Failed to create file", http.StatusInternalServerError)
        return
    }
    defer out.Close()

    resp, err := http.Get(req.URL)
    if err != nil {
        http.Error(w, "Failed to download", http.StatusBadGateway)
        return
    }
    defer resp.Body.Close()

    _, err = io.Copy(out, resp.Body)
    if err != nil {
        http.Error(w, "Failed to write file", http.StatusInternalServerError)
        return
    }

    // Update DB
    result := db.Model(&Episode{}).Where("guid = ?", req.GUID).Update("local_audio_path", localPath)
    if result.Error != nil {
        log.Printf("Failed to update episode with local path: %v", result.Error)
    }

    // Return updated episode
    var episode Episode
    db.Where("guid = ?", req.GUID).First(&episode)
    
    // Cleanup old files if cache gets too large (>500MB)
    go cleanupMediaCache(cacheDir, 500 * 1024 * 1024)
    
    json.NewEncoder(w).Encode(map[string]interface{}{
        "path": localPath, 
        "status": "downloaded",
        "episode": episode,
    })
}

func cleanupMediaCache(dir string, maxSize int64) {
    files, err := os.ReadDir(dir)
    if err != nil {
        return
    }

    var totalSize int64
    type fileInfo struct {
        name string
        size int64
        time time.Time
    }
    var fileList []fileInfo

    for _, f := range files {
        if f.IsDir() {
            continue
        }
        info, err := f.Info()
        if err != nil {
            continue
        }
        totalSize += info.Size()
        fileList = append(fileList, fileInfo{
            name: f.Name(),
            size: info.Size(),
            time: info.ModTime(),
        })
    }

    if totalSize <= maxSize {
        return
    }

    log.Printf("🧹 Media cache size (%d MB) exceeds limit (%d MB), cleaning up...", totalSize/(1024*1024), maxSize/(1024*1024))

    // Sort by modification time (oldest first)
    sort.Slice(fileList, func(i, j int) bool {
        return fileList[i].time.Before(fileList[j].time)
    })

    for _, f := range fileList {
        if totalSize <= maxSize {
            break
        }
        err := os.Remove(filepath.Join(dir, f.name))
        if err == nil {
            totalSize -= f.size
            log.Printf("🗑️ Deleted old cache: %s", f.name)
            
            // Also update DB to reflect file is gone
            db.Model(&Episode{}).Where("local_audio_path LIKE ?", "%"+f.name).Update("local_audio_path", "")
        }
    }
}

// Save SRT
func saveSrtHandler(w http.ResponseWriter, r *http.Request) {
    enableCors(&w)
    if r.Method == "OPTIONS" { w.WriteHeader(http.StatusOK); return }
    if r.Method != "POST" { http.Error(w, "Method not allowed", http.StatusMethodNotAllowed); return }

    var req struct {
        GUID       string `json:"guid"`
        SrtContent string `json:"srtContent"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    result := db.Model(&Episode{}).Where("guid = ?", req.GUID).Update("srt_content", req.SrtContent)
    if result.Error != nil {
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }

    json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// Upload SRT File
func uploadSrtHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form
	err := r.ParseMultipartForm(10 << 20) // 10MB limit
	if err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	guid := r.FormValue("guid")
	if guid == "" {
		http.Error(w, "GUID is required", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "File is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	srtStr := string(content)
	
	// Update DB
	result := db.Model(&Episode{}).Where("guid = ?", guid).Updates(map[string]interface{}{
		"srt_content":          srtStr,
		"transcription_status": "completed",
	})
	
	if result.Error != nil {
		log.Printf("❌ Failed to update SRT via upload for %s: %v", guid, result.Error)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	log.Printf("📥 Manually uploaded SRT for GUID: %s (%d bytes)", guid, len(content))
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "SRT uploaded successfully",
		"size":    len(content),
	})
}

// AI Summarization
type SummaryRequest struct {
	GUID       string `json:"guid"`
	SrtContent string `json:"srtContent"`
	APIKey     string `json:"apiKey"`
	APIBase    string `json:"apiBase"`
	Model      string `json:"model"`
}

func summarizeHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req SummaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("🤖 Received summary request for GUID: %s, Model: %s", req.GUID, req.Model)

	// 1. Check if summary already exists in DB
	if req.GUID != "" {
		var episode Episode
		if err := db.Where("guid = ?", req.GUID).First(&episode).Error; err == nil && episode.Summary != "" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"summary": episode.Summary,
				"cached":  true,
			})
			return
		}
	}

	if req.SrtContent == "" {
		http.Error(w, "SrtContent is required", http.StatusBadRequest)
		return
	}

	// 2. Call LLM to summarize
	log.Printf("📡 Calling LLM (%s) for summary...", req.Model)
	summary, err := callLLMForSummary(req.SrtContent, req.APIKey, req.APIBase, req.Model)
	if err != nil {
		log.Printf("❌ LLM summary error: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("AI 生成摘要失败: %v", err),
		})
		return
	}

	// 3. Save to DB
	if req.GUID != "" {
		db.Model(&Episode{}).Where("guid = ?", req.GUID).Update("summary", summary)
	}

	log.Printf("✅ Summary generated successfully for %s", req.GUID)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"summary": summary,
	})
}

func callLLMForSummary(content, customKey, customBase, customModel string) (string, error) {
	apiKey := customKey
	if apiKey == "" {
		apiKey = os.Getenv("OPENAI_API_KEY")
	}

	apiBase := customBase
	if apiBase == "" {
		apiBase = os.Getenv("OPENAI_API_BASE")
	}
	if apiBase == "" {
		apiBase = "https://api.openai.com/v1"
	}

	model := customModel
	if model == "" {
		model = os.Getenv("OPENAI_MODEL")
	}
	if model == "" {
		model = "gpt-3.5-turbo"
	}

	if apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY not set")
	}

	// Simple heuristic: Take first 4000 chars of srt to avoid context limit
	textToSummarize := content
	if len(textToSummarize) > 8000 {
		textToSummarize = textToSummarize[:8000]
	}

	prompt := "你是一个专业的播客文稿摘要助手。请根据以下 SRT 格式的转录文本，生成一份简洁生动的内容摘要。要求：1. 概括核心亮点；2. 使用时间轴标记关键话题（如果有的话）；3. 语言通俗易懂；4. 直接输出摘要内容，不要包含转录格式。\n\n文本内容：\n" + textToSummarize

	// Handle API Base URL trailing slash
	apiBase = strings.TrimSuffix(apiBase, "/")

	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
	}

	jsonData, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", apiBase+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	// Increase timeout to 120 seconds
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("❌ LLM API Error: Status=%d, Body=%s", resp.StatusCode, string(body))
		return "", fmt.Errorf("API error (%d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices returned")
	}

	return result.Choices[0].Message.Content, nil
}

// AI Transcribe logic
var WHISPER_SERVER_URL = getEnv("WHISPER_SERVER_URL", "")

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func transcribeHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		AudioPath string `json:"audioPath"`
		GUID      string `json:"guid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("🎙️ Starting transcription for: %s (GUID: %s)", req.AudioPath, req.GUID)
	log.Printf("🌐 WHISPER_SERVER_URL: %s", WHISPER_SERVER_URL)

	// Normalize the audio path - extract just the filename if it's a full path
	audioFilename := filepath.Base(req.AudioPath)
	localPath := filepath.Join("media_cache", audioFilename)

	// 更新状态为处理中
	db.Model(&Episode{}).Where("guid = ?", req.GUID).Update("transcription_status", "processing")
	
	// Try the normalized local path first
	var filePath string
	if _, err := os.Stat(localPath); err == nil {
		filePath = localPath
	} else if _, err := os.Stat(req.AudioPath); err == nil {
		// Fallback to the original path if it exists
		filePath = req.AudioPath
	} else {
		log.Printf("❌ Transcription failed: file not found at %s or %s", localPath, req.AudioPath)
		http.Error(w, fmt.Sprintf("Audio file not found: %s", audioFilename), http.StatusNotFound)
		return
	}
	
	log.Printf("📂 Using audio file: %s", filePath)

	// 1. Read the audio file
	file, err := os.Open(filePath)
	if err != nil {
		log.Printf("❌ Transcription failed: could not open file %s: %v", filePath, err)
		http.Error(w, fmt.Sprintf("Failed to open audio file: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	fileInfo, _ := file.Stat()
	log.Printf("📂 Processing file: %s (Size: %.2f MB)", req.AudioPath, float64(fileInfo.Size())/(1024*1024))

	// 2. Prepare multipart form (OpenAI API format)
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	
	// Add file field (OpenAI API uses "file" not "audio_file")
	part, err := writer.CreateFormFile("file", filepath.Base(req.AudioPath))
	if err != nil {
		log.Printf("❌ Failed to create multipart form: %v", err)
		http.Error(w, fmt.Sprintf("Failed to create form file: %v", err), http.StatusInternalServerError)
		return
	}
	_, err = io.Copy(part, file)
	if err != nil {
		log.Printf("❌ Failed to copy file content to buffer: %v", err)
		http.Error(w, fmt.Sprintf("Failed to copy file content: %v", err), http.StatusInternalServerError)
		return
	}
	
	// Add required OpenAI API parameters
	writer.WriteField("model", "base")  // Use the model available on the server
	writer.WriteField("response_format", "srt")  // Request SRT format output
	
	writer.Close()


	// 3. Call Whisper API (OpenAI-compatible endpoint)
	whisperURL := fmt.Sprintf("%s/v1/audio/transcriptions", WHISPER_SERVER_URL)
	log.Printf("🔗 Constructed Whisper URL: %s", whisperURL)
	log.Printf("🚀 Uploading to Whisper server: %s (File size: %.2f MB)", WHISPER_SERVER_URL, float64(fileInfo.Size())/(1024*1024))
	
	proxyReq, err := http.NewRequest("POST", whisperURL, body)
	if err != nil {
		log.Printf("❌ Failed to create request for Whisper server: %v", err)
		http.Error(w, fmt.Sprintf("Failed to create whisper request: %v", err), http.StatusInternalServerError)
		return
	}
	proxyReq.Header.Set("Content-Type", writer.FormDataContentType())

	// Use a longer timeout for transcription
	client := &http.Client{Timeout: 30 * time.Minute}
	start := time.Now()
	log.Printf("⏱️ Sending request to Whisper server (timeout: 30min)...")
	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Printf("❌ Whisper server request failed after %v: %v", time.Since(start), err)
		if req.GUID != "" {
			db.Model(&Episode{}).Where("guid = ?", req.GUID).Update("transcription_status", "failed")
		}
		http.Error(w, fmt.Sprintf("Whisper server error: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	log.Printf("📥 Received response from Whisper server (Status: %d) after %v", resp.StatusCode, time.Since(start))

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("❌ Whisper server returned error %d: %s", resp.StatusCode, string(respBody))
		if req.GUID != "" {
			db.Model(&Episode{}).Where("guid = ?", req.GUID).Update("transcription_status", "failed")
		}
		http.Error(w, fmt.Sprintf("Whisper server returned error %d: %s", resp.StatusCode, string(respBody)), http.StatusInternalServerError)
		return
	}

	srtContent, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("❌ Failed to read Whisper server response: %v", err)
		http.Error(w, "Failed to read whisper response", http.StatusInternalServerError)
		return
	}

	duration := time.Since(start)
	srtStr := string(srtContent)
	lineCount := strings.Count(srtStr, "-->")
	srtSize := len(srtContent)
	
	// Log audio file duration for comparison
	log.Printf("✅ Transcription completed in %v. Generated %d lines (%d bytes).", duration, lineCount, srtSize)
	log.Printf("📊 Audio file size: %.2f MB, SRT size: %.2f KB", float64(fileInfo.Size())/(1024*1024), float64(srtSize)/1024)

	// 4. Save to DB if GUID provided
	if req.GUID != "" {
		result := db.Model(&Episode{}).Where("guid = ?", req.GUID).Updates(map[string]interface{}{
			"srt_content":          srtStr,
			"transcription_status": "completed",
		})
		if result.Error != nil {
			log.Printf("⚠️ Failed to update database for GUID %s: %v", req.GUID, result.Error)
		} else {
			log.Printf("💾 Subtitles saved to database for GUID: %s", req.GUID)
		}
	}

	// 5. Return response (No longer saving .srt file to disk for Option 3)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"srtContent": srtStr,
		"lineCount":  lineCount,
	})
}

// 队列转录触发 API
func queueTranscriptionHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		GUID     string `json:"guid"`
		AudioURL string `json:"audioUrl"`
		Title    string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 获取节目信息
	var episode Episode
	if err := db.Where("guid = ?", req.GUID).First(&episode).Error; err != nil {
		http.Error(w, "Episode not found", http.StatusNotFound)
		return
	}

	// 添加到队列
	task := TranscriptionTask{
		GUID:      req.GUID,
		AudioURL:  req.AudioURL,
		LocalPath: episode.LocalAudioPath,
		Title:     req.Title,
		AddedAt:   time.Now(),
	}
	
	transcriptionQueue.AddTask(task)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Added to transcription queue",
	})
}

func main() {
	initDB()
	initTranscriptionQueue()

	http.HandleFunc("/api/channels", listChannelsHandler)
    http.HandleFunc("/api/channels/", channelEpisodesHandler) // Matches /api/channels/{id}/episodes... technically matches anything after
    http.HandleFunc("/api/download", downloadEpisodeHandler)
    http.HandleFunc("/api/save-srt", saveSrtHandler)
    http.HandleFunc("/api/upload-srt", uploadSrtHandler)
    http.HandleFunc("/api/transcribe", transcribeHandler)
    http.HandleFunc("/api/summary", summarizeHandler)
    http.HandleFunc("/api/queue-transcription", queueTranscriptionHandler)
    
    // Documentation
    http.HandleFunc("/doc", func(w http.ResponseWriter, r *http.Request) {
        http.ServeFile(w, r, "doc.html")
    })
    
    // Serve cached media files with CORS
    fs := http.FileServer(http.Dir("media_cache"))
    http.Handle("/media/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        enableCors(&w)
        http.StripPrefix("/media/", fs).ServeHTTP(w, r)
    }))
    
	port := ":8080"
	log.Printf("Server starting on port %s...", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}
