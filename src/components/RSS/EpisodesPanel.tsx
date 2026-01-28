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
        padding: "20px",
        animation: "fadeIn 0.3s ease",
        flexShrink: 0,
      }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "20px",
          gap: "10px",
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
        style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
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
            {episode.pubDate && (
              <div
                style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)" }}>
                {new Date(episode.pubDate).toLocaleDateString("zh-CN")}
              </div>
            )}
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
