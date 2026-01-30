# 后台转录队列系统

## ✅ 已实现的功能

### 1. 队列数据结构
- `TranscriptionTask`: 转录任务结构
- `TranscriptionQueue`: 队列管理器（带互斥锁）

### 2. 核心函数
- `initTranscriptionQueue()`: 初始化队列并启动后台 worker
- `AddTask()`: 添加任务到队列（带去重检查）
- `GetNextTask()`: 获取下一个待处理任务
- `transcriptionWorker()`: 后台处理器（goroutine）

### 3. 辅助函数
- `downloadAudio()`: 下载音频文件
- `performTranscription()`: 执行 Whisper 转录
- `fileExists()`: 检查文件是否存在
- `getFileSize()`: 获取文件大小

## 🚀 工作流程

```
用户点击播放
    ↓
前端调用 /api/queue-transcription
    ↓
后端添加任务到队列
    ↓
立即返回成功响应
    ↓
后台 worker 异步处理：
  1. 检查音频是否已下载
  2. 如果没有，下载音频
  3. 调用 Whisper API 转录
  4. 保存 SRT 到数据库
    ↓
前端定期轮询或 WebSocket 获取更新
```

## 📝 需要添加的代码

### 1. 添加 API 端点处理函数

在 `main.go` 的 `main()` 函数之前添加：

```go
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
```

### 2. 注册路由

在 `main()` 函数中添加路由（在其他 HandleFunc 之后）：

```go
http.HandleFunc("/api/queue-transcription", queueTranscriptionHandler)
```

## 🎯 前端集成

### 修改播放逻辑

在 `src/App.tsx` 的 `handlePlayPodcast` 函数中：

```typescript
const handlePlayPodcast = async (episode: PodcastEpisode) => {
  // ... 现有代码 ...

  // 如果没有字幕，自动加入转录队列
  if (!episode.srt_content && episode.audioUrl) {
    try {
      await axios.post(`${settings.apiUrl}/api/queue-transcription`, {
        guid: episode.guid,
        audioUrl: episode.audioUrl,
        title: episode.title,
      });
      console.log("✅ Added to transcription queue:", episode.title);
    } catch (error) {
      console.error("Failed to queue transcription:", error);
    }
  }

  // ... 播放逻辑 ...
};
```

### 可选：添加队列状态查询

```typescript
// 定期检查转录状态
useEffect(() => {
  const interval = setInterval(async () => {
    if (currentEpisode && !currentEpisode.srt_content) {
      try {
        const response = await axios.get(
          `${settings.apiUrl}/api/channels/${currentEpisode.channel_id}/episodes`
        );
        const updated = response.data.episodes.find(
          (ep: any) => ep.guid === currentEpisode.guid
        );
        if (updated?.srt_content) {
          setLyrics(parseSrt(updated.srt_content));
          setCurrentEpisode(updated);
        }
      } catch (error) {
        console.error("Failed to check transcription status:", error);
      }
    }
  }, 10000); // 每 10 秒检查一次

  return () => clearInterval(interval);
}, [currentEpisode]);
```

## 📊 优势

✅ **异步处理**：不阻塞用户操作
✅ **自动下载**：如果音频未下载，自动下载
✅ **去重**：避免重复转录
✅ **顺序处理**：一次处理一个任务，避免资源耗尽
✅ **持久化**：转录结果自动保存到数据库

## 🔍 监控和调试

### 查看队列状态

可以添加一个状态查询端点：

```go
func queueStatusHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	transcriptionQueue.mu.Lock()
	defer transcriptionQueue.mu.Unlock()
	
	json.NewEncoder(w).Encode(map[string]interface{}{
		"queueSize": len(transcriptionQueue.tasks),
		"processing": transcriptionQueue.processing,
		"tasks": transcriptionQueue.tasks,
	})
}
```

### 日志输出

后台 worker 会输出详细日志：
```
🎙️ Transcription queue initialized
🤖 Transcription worker started
➕ Added to transcription queue: Episode Title (Queue size: 1)
🎬 Processing transcription task: Episode Title
📥 Downloading audio for: Episode Title
✅ Downloaded audio: xxx.mp3 (29.32 MB)
🚀 Sending to Whisper (29.32 MB)...
✅ Transcription completed in 2m15s (45678 bytes)
✅ Transcription completed and saved: Episode Title
```

## 🎉 总结

这个系统实现了完全自动化的后台转录流程：
1. 用户点击播放
2. 后端自动加入队列
3. 后台异步下载 + 转录
4. 自动保存到数据库
5. 前端定期刷新获取结果

无需用户手动操作，体验流畅！
