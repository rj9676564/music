import React from "react";

interface EpisodesPanelProps {
  currentChannel: any;
  episodes: any[];
  onPlayEpisode: (episode: any) => void;
  onDownloadEpisode: (episode: any, e: React.MouseEvent) => void;
}

export const EpisodesPanel: React.FC<EpisodesPanelProps> = ({
  currentChannel,
  episodes,
  onPlayEpisode,
  onDownloadEpisode,
}) => {
  return (
    <div
      className="glass-card"
      style={{
        width: "330px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "20px 0 20px 20px", // 右侧不留 padding，让滚动条靠右
        animation: "fadeIn 0.3s ease",
        flexShrink: 0,
      }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "20px",
          gap: "10px",
          paddingRight: "20px", // 标题区域补上 padding
        }}>
        <h2
          style={{
            margin: 0,
            fontSize: "1.2rem",
            color: "white",
            fontWeight: 600,
          }}>
          {currentChannel?.name || "节目列表"}
        </h2>
      </div>

      <div
        className="custom-scrollbar"
        style={{ flex: 1, overflowY: "auto", paddingRight: "8px" }}>
        {" "}
        {episodes.map((episode) => (
          <div
            key={episode.guid || episode.title}
            onClick={() => onPlayEpisode(episode)}
            style={{
              padding: "12px",
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              cursor: "pointer",
              marginBottom: "10px",
              position: "relative",
            }}>
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#fff",
                marginBottom: "6px",
                paddingRight: "40px",
                lineHeight: 1.3,
              }}>
              {episode.title}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {episode.pubDate && (
                <div
                  style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)" }}>
                  {new Date(episode.pubDate).toLocaleDateString("zh-CN")}
                </div>
              )}
              {episode.transcription_status && (
                <div
                  style={{
                    fontSize: "0.65rem",
                    padding: "1px 4px",
                    borderRadius: "3px",
                    background:
                      episode.transcription_status === "completed"
                        ? "rgba(76, 175, 80, 0.2)"
                        : episode.transcription_status === "failed"
                          ? "rgba(244, 67, 54, 0.2)"
                          : "rgba(255, 193, 7, 0.2)",
                    color:
                      episode.transcription_status === "completed"
                        ? "#81c784"
                        : episode.transcription_status === "failed"
                          ? "#e57373"
                          : "#ffd54f",
                    border: `1px solid ${
                      episode.transcription_status === "completed"
                        ? "rgba(76, 175, 80, 0.3)"
                        : episode.transcription_status === "failed"
                          ? "rgba(244, 67, 54, 0.3)"
                          : "rgba(255, 193, 7, 0.3)"
                    }`,
                  }}>
                  {episode.transcription_status === "pending"
                    ? "排队中"
                    : episode.transcription_status === "processing"
                      ? "转录中..."
                      : episode.transcription_status === "completed"
                        ? "已转录"
                        : "转录失败"}
                </div>
              )}
            </div>
            <button
              onClick={(e) => onDownloadEpisode(episode, e)}
              title="缓存到本地"
              style={{
                position: "absolute",
                right: "10px",
                top: "10px",
                background: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "white",
                borderRadius: "4px",
                cursor: "pointer",
                padding: "4px 8px",
                fontSize: "0.8rem",
              }}>
              ⬇
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
