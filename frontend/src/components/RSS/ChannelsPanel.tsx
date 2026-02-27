import React from "react";
import { CloseIcon, RadioIcon } from "../Icons";

interface ChannelsPanelProps {
  loadingChannels: boolean;
  channels: any[];
  currentChannel: any;
  loadingPodcast: boolean;
  onFetchChannel: (channel: any) => void;
  onClose: () => void;
}

export const ChannelsPanel: React.FC<ChannelsPanelProps> = ({
  loadingChannels,
  channels,
  currentChannel,
  loadingPodcast,
  onFetchChannel,
  onClose,
}) => {
  return (
    <div
      className="glass-card"
      style={{
        width: "330px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "20px 0 20px 20px", // 右侧不留 padding
        animation: "fadeIn 0.3s ease",
        flexShrink: 0,
      }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "20px",
          justifyContent: "space-between",
          paddingRight: "20px", // 标题区补上
        }}>
        <h2
          style={{
            margin: 0,
            fontSize: "1.2rem",
            color: "white",
            fontWeight: 600,
          }}>
          在线频道
        </h2>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            padding: "5px",
          }}>
          <CloseIcon />
        </button>
      </div>

      <div
        className="custom-scrollbar"
        style={{ flex: 1, overflowY: "auto", paddingRight: "8px" }}>
        {/* Channels List Content */}
        {loadingChannels ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#888" }}>
            加载频道列表...
          </div>
        ) : (
          channels.map((channel: any) => (
            <div
              key={channel.id}
              onClick={() => onFetchChannel(channel)}
              style={{
                padding: "16px",
                background:
                  currentChannel?.id === channel.id
                    ? "rgba(255, 255, 255, 0.15)"
                    : "rgba(255, 255, 255, 0.05)",
                borderRadius: "12px",
                border:
                  currentChannel?.id === channel.id
                    ? "1px solid rgba(255, 255, 255, 0.3)"
                    : "1px solid rgba(255, 255, 255, 0.1)",
                cursor: "pointer",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                minHeight: "70px",
              }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  flexShrink: 0,
                  position: "relative",
                }}>
                <RadioIcon />

                {/* Loading Overlay */}
                {loadingPodcast && currentChannel?.id === channel.id && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                    <div
                      className="spinner"
                      style={{
                        width: "24px",
                        height: "24px",
                        border: "3px solid rgba(255,255,255,0.1)",
                        borderTopColor: "#f5576c", // Pink
                        borderLeftColor: "#f093fb", // Purple
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "#fff",
                    marginBottom: "4px",
                    lineHeight: "1.2",
                  }}>
                  {channel.name}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "rgba(255,255,255,0.5)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                  {channel.description}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
