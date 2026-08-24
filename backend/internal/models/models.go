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
