package models

import "time"

type Channel struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Author      string    `json:"author"`
	RSS         string    `json:"rss"`
	ImageURL    string    `json:"image_url"`
	AutoConvert bool      `json:"auto_convert"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Episode struct {
	GUID                string    `json:"guid"`
	ChannelID           string    `json:"channel_id"`
	Title               string    `json:"title"`
	Description         string    `json:"description"`
	Link                string    `json:"link"`
	PubDate             time.Time `json:"pub_date"`
	AudioURL            string    `json:"audio_url"`
	ImageURL            string    `json:"image_url"`
	SrtContent          string    `json:"srt_content"`
	Summary             string    `json:"summary"`
	Tags                string    `json:"tags"`
	TranscriptionStatus string    `json:"transcription_status"`
	LocalAudioPath      string    `json:"local_audio_path"`
}

type TranscriptionJob struct {
	ID          string     `json:"id"`
	EpisodeGUID string     `json:"episode_guid"`
	ChannelID   string     `json:"channel_id"`
	Title       string     `json:"title"`
	AudioURL    string     `json:"audio_url"`
	Status      string     `json:"status"` // pending | processing | completed | failed
	Priority    int        `json:"priority"`
	Attempts    int        `json:"attempts"`
	MaxAttempts int        `json:"max_attempts"`
	LockedAt    *time.Time `json:"locked_at,omitempty"`
	LockedBy    string     `json:"locked_by,omitempty"`
	LastError   string     `json:"last_error,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	SrtContent  string     `json:"srt_content,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type Config struct {
	ID          string    `json:"id"`
	Key         string    `json:"key"`
	Value       string    `json:"value"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Subtitle struct {
	ID          string    `json:"id"`
	EpisodeGUID string    `json:"episode_guid"`
	Type        string    `json:"type"` // "srt" | "lrc"
	Content     string    `json:"content"`
	Status      string    `json:"status"` // "pending" | "completed" | "failed"
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Translation struct {
	ID          string    `json:"id"`
	EpisodeGUID string    `json:"episode_guid"`
	SourceType  string    `json:"source_type"` // "srt" | "lrc"
	TargetLang  string    `json:"target_lang"` // "zh-CN", "en", etc.
	Content     string    `json:"content"`
	Model       string    `json:"model"`
	Status      string    `json:"status"` // "pending" | "completed" | "failed"
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Summary struct {
	ID          string    `json:"id"`
	EpisodeGUID string    `json:"episode_guid"`
	Content     string    `json:"content"`
	Model       string    `json:"model"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
