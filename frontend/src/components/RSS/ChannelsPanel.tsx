import React from "react";
import { CloseIcon, RadioIcon } from "../Icons";
import { ArtworkTile } from "../ui/ArtworkTile";
import { ListItemCard } from "../ui/ListItemCard";
import { PanelHeader } from "../ui/PanelHeader";
import { Spinner } from "../ui/Spinner";
import { color, fontSize } from "../../styles/tokens";

interface Channel {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  auto_convert?: boolean;
}

interface ChannelsPanelProps {
  loadingChannels: boolean;
  channels: Channel[];
  currentChannel: Channel | null;
  loadingPodcast: boolean;
  onFetchChannel: (channel: Channel) => void;
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
      className="browser-panel"
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        animation: "fadeIn 0.3s ease",
        flexShrink: 0,
        flex: 1,
        borderRadius: "18px",
      }}>
      <PanelHeader
        eyebrow="Browse"
        title="在线频道"
        right={
          <button
            onClick={onClose}
            className="browser-close-btn"
            style={{
              background: "none",
              border: "none",
              color: color.fg2,
              cursor: "pointer",
              padding: "5px",
            }}>
            <CloseIcon />
          </button>
        }
      />

      <div
        className="custom-scrollbar browser-list"
        style={{ flex: 1, overflowY: "auto", width: "100%" }}>
        {loadingChannels ? (
          <div style={{ padding: "20px", textAlign: "center", color: color.fg3 }}>
            加载频道列表...
          </div>
        ) : (
          channels.map((channel) => (
            <ListItemCard
              key={channel.id}
              selected={currentChannel?.id === channel.id}
              onClick={() => onFetchChannel(channel)}>
              <ArtworkTile
                src={channel.image_url}
                alt={channel.name}
                fallback={<RadioIcon />}
                overlay={
                  loadingPodcast && currentChannel?.id === channel.id ? (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: color.scrim,
                        borderRadius: "inherit",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: color.accent,
                      }}>
                      <Spinner size={24} />
                    </div>
                  ) : undefined
                }
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fontSize.xl,
                    fontWeight: 600,
                    color: "#fff",
                    marginBottom: "4px",
                    lineHeight: "1.2",
                  }}>
                  {channel.name}
                </div>
                <div
                  style={{
                    fontSize: "0.82rem",
                    color: color.fg3,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                  {channel.description}
                </div>
              </div>
            </ListItemCard>
          ))
        )}
      </div>
    </div>
  );
};
