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
	"time"

	"github.com/mmcdole/gofeed"
	"gorm.io/driver/sqlite"
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
	ChannelID     string    `json:"channel_id" gorm:"index"`
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	Link          string    `json:"link"`
	PubDate       time.Time `json:"pub_date"`
	AudioURL      string    `json:"audioUrl"` // Standardized to matches frontend expectation
	Duration      string    `json:"duration"`
	LocalAudioPath string   `json:"local_audio_path"`
	SrtContent    string    `json:"srt_content"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

var db *gorm.DB

func initDB() {
	var err error
	if err := os.MkdirAll("data", 0755); err != nil {
		log.Fatal("Failed to create data directory:", err)
	}
	
	db, err = gorm.Open(sqlite.Open("data/molten.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect database:", err)
	}

	// Auto Migrate
	err = db.AutoMigrate(&Channel{}, &Episode{})
	if err != nil {
		log.Fatal("failed to migrate database:", err)
	}

	// Seed initial channels if empty
	initialChannels := []Channel{
		{ID: "the-daily", Name: "The Daily", Author: "The New York Times", RSS: "https://feeds.simplecast.com/54nAGcIl", Description: "This is how the news should sound."},
		{ID: "crime-junkie", Name: "Crime Junkie", Author: "audiochuck", RSS: "https://feeds.simplecast.com/qm_9xx0g", Description: "If you can never get enough true crime... Congratulations, you’re a Crime Junkie!"},
		{ID: "pod-save-america", Name: "Pod Save America", Author: "Crooked Media", RSS: "https://feeds.simplecast.com/dxZsm5kX", Description: "A political podcast for people who aren’t ready to give up yet."},
		{ID: "mel-robbins", Name: "The Mel Robbins Podcast", Author: "Mel Robbins", RSS: "https://feeds.simplecast.com/UCwaTX1J", Description: "Systems to change your life from the global expert on behavior change."},
		{ID: "allearsenglish", Name: "All Ears English", Author: "All Ears English", RSS: "https://feeds.megaphone.fm/allearsenglish", Description: "Are you looking for a new way to learn English?"},
		{ID: "techmeme-ride-home", Name: "Techmeme Ride Home", Author: "Techmeme", RSS: "https://rsshub.app/spotify/show/6qXldSz1Ulq1Nvj2JK5kSR", Description: "The day's tech news, every day at 5pm ET."},
		{ID: "gcores", Name: "机核 GCORES", Author: "GCORES", RSS: "https://wiki.dio.wtf/gcores", Description: "Share the core culture of games."},
		{ID: "vergecast", Name: "The Vergecast", Author: "The Verge", RSS: "https://feeds.megaphone.fm/vergecast", Description: "The flagship podcast of The Verge."},
	}

	for _, ch := range initialChannels {
		// Use Clause(clause.OnConflict{UpdateAll: true}) to update if exists, or just FirstOrCreate to only insert if missing
		db.Where(Channel{ID: ch.ID}).FirstOrCreate(&ch)
	}
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

    // Check if we need to refresh (simple logic: refresh if no episodes or query param ?refresh=true)
    refresh := r.URL.Query().Get("refresh") == "true"
    var count int64
    db.Model(&Episode{}).Where("channel_id = ?", channelID).Count(&count)

    if count == 0 || refresh {
        // Fetch RSS
        var channel Channel
        if result := db.First(&channel, "id = ?", channelID); result.Error != nil {
             http.Error(w, "Channel not found", http.StatusNotFound)
             return
        }

        fp := gofeed.NewParser()
        feed, err := fp.ParseURL(channel.RSS)
        if err != nil {
            log.Printf("Failed to parse RSS for %s: %v", channel.ID, err)
            // If parse fails, we might still serve cached episodes
        } else {
            // Save episodes
            for _, item := range feed.Items {
                pubDate := time.Now()
                if item.PublishedParsed != nil {
                    pubDate = *item.PublishedParsed
                }
                
                audioUrl := ""
                if len(item.Enclosures) > 0 {
                    audioUrl = item.Enclosures[0].URL
                }

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
                db.Clauses(clause.OnConflict{
                    Columns:   []clause.Column{{Name: "guid"}},
                    DoUpdates: clause.AssignmentColumns([]string{"title", "description", "audio_url", "pub_date", "updated_at"}),
                }).Create(&episode)
            }
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
    log.Printf("Fetched %d episodes for channel %s. %d have subtitles.", len(episodes), channelID, srtCount)

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

// AI Transcribe logic moved from Electron
const WHISPER_SERVER_URL = "http://d.mrlb.top:9999"

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

	log.Printf("Starting transcription for: %s (GUID: %s)", req.AudioPath, req.GUID)

	// 1. Read the audio file
	file, err := os.Open(req.AudioPath)
	if err != nil {
		log.Printf("❌ Transcription failed: could not open file %s: %v", req.AudioPath, err)
		http.Error(w, fmt.Sprintf("Failed to open audio file: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	fileInfo, _ := file.Stat()
	log.Printf("📂 Processing file: %s (Size: %.2f MB)", req.AudioPath, float64(fileInfo.Size())/(1024*1024))

	// 2. Prepare multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("audio_file", filepath.Base(req.AudioPath))
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
	writer.Close()

	// 3. Call Whisper API
	whisperURL := fmt.Sprintf("%s/asr?task=transcribe&output=srt", WHISPER_SERVER_URL)
	log.Printf("🚀 Uploading to Whisper server: %s", WHISPER_SERVER_URL)
	
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
	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Printf("❌ Whisper server request failed: %v", err)
		http.Error(w, fmt.Sprintf("Whisper server error: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("❌ Whisper server returned error %d: %s", resp.StatusCode, string(respBody))
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
		result := db.Model(&Episode{}).Where("guid = ?", req.GUID).Update("srt_content", srtStr)
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

func main() {
	initDB()

	http.HandleFunc("/api/channels", listChannelsHandler)
    http.HandleFunc("/api/channels/", channelEpisodesHandler) // Matches /api/channels/{id}/episodes... technically matches anything after
    http.HandleFunc("/api/download", downloadEpisodeHandler)
    http.HandleFunc("/api/srt", saveSrtHandler)
    http.HandleFunc("/api/transcribe", transcribeHandler)
    
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
