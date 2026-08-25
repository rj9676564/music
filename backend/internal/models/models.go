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
