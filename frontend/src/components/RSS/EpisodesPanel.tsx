import React from "react";
import { MusicNoteIcon } from "../Icons";
import { ArtworkTile } from "../ui/ArtworkTile";
import { Badge } from "../ui/Badge";
import type { BadgeTone } from "../ui/Badge";
import { ListItemCard } from "../ui/ListItemCard";
import { PanelHeader } from "../ui/PanelHeader";
import { color, fontSize, radius } from "../../styles/tokens";

interface Episode {
  guid?: string;
  title?: string;
  pubDate?: string;
  duration?: number;
  image_url?: string;
  srt_content?: string;
  transcription_status?: string;
}

interface EpisodesPanelProps {
  currentChannel: { name?: string; image_url?: string } | null;
  episodes: Episode[];
  onBack?: () => void;
  onPlayEpisode: (episode: Episode) => void;
  onDownloadEpisode: (episode: Episode, e: React.MouseEvent) => void;
  onRequestTranscription?: (episode: Episode, e: React.MouseEvent) => void;
}

/** 秒 -> "1:02:03" / "13:20"，RSS 未提供时长时返回空 */
const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

const TRANSCRIPTION_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "排队中", tone: "warning" },
  processing: { label: "转录中...", tone: "warning" },
  completed: { label: "已转录", tone: "success" },
};

export const EpisodesPanel: React.FC<EpisodesPanelProps> = ({
  currentChannel,
  episodes,
  onBack,
  onPlayEpisode,
  onDownloadEpisode,
  onRequestTranscription,
}) => {
  const actionButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: `1px solid ${color.fg5}`,
    color: "white",
    borderRadius: radius.sm,
    cursor: "pointer",
    padding: "4px 8px",
    fontSize: fontSize.sm,
  };

  return (
    <div
      className="browser-panel"
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        animation: "fadeIn 0.3s ease",
        flexShrink: 0,
        flex: 1,
        minHeight: 0,
        borderRadius: "18px",
      }}>
      <PanelHeader
        eyebrow="Playlist"
        title={currentChannel?.name || "节目列表"}
        left={
          onBack && (
            <button
              className="browser-back-btn"
              onClick={onBack}
              style={{ border: "none" }}>
              {"<"}
            </button>
          )
        }
      />

      <div
        className="custom-scrollbar browser-list"
        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {episodes.map((episode) => {
          const status = episode.transcription_status
            ? (TRANSCRIPTION_LABELS[episode.transcription_status] ?? {
                label: "转录失败",
                tone: "danger" as BadgeTone,
              })
            : null;

          return (
            <ListItemCard
              key={episode.guid || episode.title}
              onClick={() => onPlayEpisode(episode)}>
              <ArtworkTile
                src={episode.image_url || currentChannel?.image_url}
                alt={episode.title}
                fallback={<MusicNoteIcon size={24} />}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fontSize.xl,
                    fontWeight: 600,
                    color: "#fff",
                    marginBottom: "6px",
                    paddingRight: "96px",
                    lineHeight: 1.3,
                  }}>
                  {episode.title}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}>
                  {episode.pubDate && (
                    <div style={{ fontSize: "0.82rem", color: color.fg3 }}>
                      {new Date(episode.pubDate).toLocaleDateString("zh-CN")}
                    </div>
                  )}
                  {formatDuration(episode.duration) && (
                    <div style={{ fontSize: "0.82rem", color: color.fg4 }}>
                      {formatDuration(episode.duration)}
                    </div>
                  )}
                  {status && <Badge tone={status.tone}>{status.label}</Badge>}
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  right: "14px",
                  top: "14px",
                  display: "flex",
                  gap: "5px",
                }}>
                {!episode.srt_content &&
                  episode.transcription_status !== "pending" &&
                  episode.transcription_status !== "processing" && (
                    <button
                      onClick={(e) => onRequestTranscription?.(episode, e)}
                      title="请求生成字幕"
                      style={{
                        ...actionButtonStyle,
                        background: "rgba(63, 81, 181, 0.2)",
                        border: "1px solid rgba(63, 81, 181, 0.4)",
                        color: "#9fa8da",
                      }}>
                      🪄
                    </button>
                  )}
                <button
                  onClick={(e) => onDownloadEpisode(episode, e)}
                  title="缓存音频"
                  style={actionButtonStyle}>
                  ⬇
                </button>
              </div>
            </ListItemCard>
          );
        })}
      </div>
    </div>
  );
};
