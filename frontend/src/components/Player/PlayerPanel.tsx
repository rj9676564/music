import React from "react";
import { LockIcon, MusicNoteIcon, RepeatIcon, UnlockIcon } from "../Icons";
import { StaticLine, ActiveKaraokeLine } from "./LyricLine";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";
import { PlayButton } from "../ui/PlayButton";
import { Select } from "../ui/Select";
import { Spinner } from "../ui/Spinner";
import { color, fontSize, radius, gradient, CONTROL_HEIGHT } from "../../styles/tokens";

interface PlayerPanelProps {
  settings: any;
  hasAudio: boolean;
  musicInfo: any;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLoading: boolean;
  isTranscribing: boolean;
  isSummarizing: boolean;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  playerSubpage: "overview" | "controls";
  setPlayerSubpage: (page: "overview" | "controls") => void;
  onSummarize: () => void;
  togglePlay: () => void;
  lyrics: any[];
  activeIndex: number;
  lyricListRef: React.RefObject<HTMLDivElement | null>;
  currentProgress: number;
  sentenceLoopEnabled: boolean;
  sentenceRepeatCount: number;
  sentenceLoopCompleted: number;
  canUseSentenceLoop: boolean;
  onToggleSentenceLoop: () => void;
  onSentenceRepeatCountChange: (count: number) => void;
  showDesktopLyric: boolean;
  isLyricLocked: boolean;
  onToggleLyricLock: () => void;
  handleOpenMusic: () => void;
  handleSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const formatTime = (s: number) => {
  if (isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const PlayerPanel: React.FC<PlayerPanelProps> = ({
  settings,
  hasAudio,
  musicInfo,
  currentTime,
  duration,
  isPlaying,
  isLoading,
  isTranscribing,
  isSummarizing,
  playbackRate,
  setPlaybackRate,
  playerSubpage,
  setPlayerSubpage,
  onSummarize,
  togglePlay,
  lyrics,
  activeIndex,
  lyricListRef,
  currentProgress,
  sentenceLoopEnabled,
  sentenceRepeatCount,
  sentenceLoopCompleted,
  canUseSentenceLoop,
  onToggleSentenceLoop,
  onSentenceRepeatCountChange,
  showDesktopLyric,
  isLyricLocked,
  onToggleLyricLock,
  handleOpenMusic,
  handleSeek,
}) => {
  const summaryBlock = musicInfo.summary && (
    <div
      style={{
        minHeight: "48px",
        margin: "12px 20px 8px",
        background: color.scrim,
        borderRadius: "12px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 4px 15px rgba(0, 0, 0, 0.2)",
        backdropFilter: "blur(10px)",
        position: "relative",
        maxHeight: "300px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
      <div
        className="custom-scrollbar"
        style={{
          overflowY: "auto",
          padding: "16px",
          paddingRight: "6px",
        }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
            paddingBottom: "8px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          }}>
          <div
            style={{
              background:
                gradient.brand,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontWeight: "bold",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
            <span style={{ fontSize: "1.1rem" }}>🤖</span> AI 内容精选
          </div>
        </div>

        <div
          style={{
            whiteSpace: "pre-wrap",
            textAlign: "justify",
            fontSize: "0.9rem",
            color: color.fg1,
            lineHeight: "1.6",
            paddingRight: "8px",
          }}>
          {musicInfo.summary.split("\n").map((line: string, i: number) => {
            const parts = line.split(/(\*\*.*?\*\*)/g);
            return (
              <div key={i} style={{ minHeight: line ? "auto" : "8px" }}>
                {parts.map((part, j) => {
                  if (part.startsWith("**") && part.endsWith("**")) {
                    return (
                      <strong key={j} style={{ color: "#fff", fontWeight: 600 }}>
                        {part.slice(2, -2)}
                      </strong>
                    );
                  }
                  return part;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="glass-card main-layout"
      style={{
        width: "100%",
        maxWidth: "640px",
        minWidth: 0,
        flex: 1,
        transition: "all 0.4s ease",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
      }}>
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          marginBottom: "16px",
        }}>
        <div
          style={{
            display: "inline-flex",
            gap: "6px",
            padding: "6px",
            borderRadius: "16px",
            background: color.surface1,
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
          <button
            className="tool-btn"
            onClick={() => setPlayerSubpage("overview")}
            style={{
              minWidth: "92px",
              padding: "8px 14px",
              borderRadius: "12px",
              background:
                playerSubpage === "overview"
                  ? color.surface3
                  : "transparent",
              border:
                playerSubpage === "overview"
                  ? "1px solid rgba(255,255,255,0.12)"
                  : "1px solid transparent",
            }}>
            概览
          </button>
          <button
            className="tool-btn"
            onClick={() => setPlayerSubpage("controls")}
            style={{
              minWidth: "92px",
              padding: "8px 14px",
              borderRadius: "12px",
              background:
                playerSubpage === "controls"
                  ? color.surface3
                  : "transparent",
              border:
                playerSubpage === "controls"
                  ? "1px solid rgba(255,255,255,0.12)"
                  : "1px solid transparent",
            }}>
            控制
          </button>
        </div>
      </div>

      {playerSubpage === "overview" ? (
        <>
          {/* Cover & Title */}
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}>
            <div
              className={`album-art ${isPlaying ? "playing" : ""}`}
              onClick={() => {
                if (!hasAudio) {
                  handleOpenMusic();
                  return;
                }
                setPlayerSubpage("controls");
                if (!isPlaying) {
                  togglePlay();
                }
              }}
              title={hasAudio ? "点击开始播放并进入控制" : "点击打开音乐文件"}
              style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}>
              {musicInfo.cover ? (
                <img
                  src={musicInfo.cover}
                  alt="Cover"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: color.surface2,
                    color: color.fg4,
                  }}>
                  <MusicNoteIcon size={64} />
                </div>
              )}
            </div>
          </div>

          {/* Track Info */}
          <div className="track-info">
            <div className="track-name" title={musicInfo.name}>
              {musicInfo.name || "未播放"}
            </div>
            <div className="artist-name" title={musicInfo.artist}>
              {musicInfo.artist || "未知艺术家"}
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "8px",
                flexWrap: "wrap",
              }}>
              {isTranscribing && (
                <Badge tone="accent" icon={<Spinner />}>
                  转录中...
                </Badge>
              )}

              {lyrics.length > 0 && !musicInfo.summary && !isSummarizing && (
                <button
                  onClick={onSummarize}
                  style={{
                    padding: "4px 12px",
                    background: gradient.brand,
                    border: "none",
                    borderRadius: "12px",
                    fontSize: "0.75rem",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}>
                  ✨ 生成 AI 摘要
                </button>
              )}

              {isSummarizing && (
                <Badge icon={<Spinner />}>AI 摘要生成中...</Badge>
              )}
            </div>
          </div>

          {summaryBlock}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              flex: 1,
              width: "100%",
            }}>
            <PlayButton isLoading={isLoading} isPlaying={isPlaying} onToggle={togglePlay} />
            <div
              style={{
                fontSize: "0.82rem",
                color: color.fg3,
                letterSpacing: "0.02em",
              }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>
        </>
      ) : (
        <div
          style={{
            flex: 1,
            width: "100%",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}>
      {/* Lyrics View */}
      <div
        className="lyric-list custom-scrollbar"
        ref={lyricListRef}
        style={{
          minHeight: 0,
        }}>
        {lyrics.length === 0 ? (
<EmptyState title="暂无歌词" />
        ) : (
          lyrics.map((line, index) =>
            index === activeIndex ? (
              <ActiveKaraokeLine
                key={index}
                fontSize={17}
                text={line.text}
                progress={currentProgress}
                activeColor={settings.activeColor}
                color={settings.color}
              />
            ) : (
              <StaticLine
                key={index}
                fontSize={16}
                text={line.text}
                color={
                  index < activeIndex ? settings.activeColor : settings.color
                }
              />
            ),
          )
        )}
      </div>

      <div
        style={{
          width: "100%",
          flexShrink: 0,
          marginTop: "12px",
          padding: "14px 14px 12px",
          borderRadius: "18px",
          background: color.surface1,
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
        }}>
        <div
          className="progress-bar"
          onMouseDown={handleSeek}
          title="拖动或点击跳转进度"
          style={{ cursor: "pointer", marginBottom: "8px" }}>
          <div
            className="progress-fill"
            style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
          />
        </div>

        <div className="time-info" style={{ marginBottom: "12px" }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: showDesktopLyric ? "1fr auto 1fr" : "1fr auto 1fr",
            alignItems: "center",
            gap: "12px",
          }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              justifyContent: "flex-start",
            }}>
            <IconButton
              title={settings.loop ? "关闭循环播放" : "开启循环播放"}
              active={settings.loop}
              onClick={(e) => {
                e.stopPropagation();
                settings.updateSettings({ loop: !settings.loop });
              }}>
              <RepeatIcon />
            </IconButton>
            {showDesktopLyric && (
              <IconButton
                title={isLyricLocked ? "解锁桌面歌词" : "锁定桌面歌词"}
                active={!isLyricLocked}
                onClick={onToggleLyricLock}>
                {isLyricLocked ? <LockIcon /> : <UnlockIcon />}
              </IconButton>
            )}
          </div>

          <PlayButton isLoading={isLoading} isPlaying={isPlaying} onToggle={togglePlay} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "10px",
              flexWrap: "wrap",
            }}>
            <div
              style={{
                height: CONTROL_HEIGHT,
                display: "flex",
                alignItems: "stretch",
                borderRadius: radius.lg,
                overflow: "hidden",
                border: `1px solid ${sentenceLoopEnabled ? color.accentBorder : color.hairlineStrong}`,
                background: sentenceLoopEnabled ? color.accentBg : color.surface2,
                opacity: canUseSentenceLoop || sentenceLoopEnabled ? 1 : 0.65,
              }}>
              <button
                onClick={onToggleSentenceLoop}
                disabled={!canUseSentenceLoop}
                style={{
                  width: CONTROL_HEIGHT,
                  border: "none",
                  borderRight: `1px solid ${color.hairline}`,
                  background: "transparent",
                  color: sentenceLoopEnabled ? color.accent : "#fff",
                  cursor: canUseSentenceLoop ? "pointer" : "not-allowed",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
                title={
                  sentenceLoopEnabled
                    ? `关闭当前句复听 (R) · 剩余 ${Math.max(0, sentenceRepeatCount - sentenceLoopCompleted)}`
                    : "循环当前高亮句 (R)"
                }>
                <RepeatIcon />
              </button>
              <Select
                bare
                minWidth={60}
                title="额外复听次数"
                value={sentenceRepeatCount}
                onChange={(v) => onSentenceRepeatCountChange(Number(v))}
                options={Array.from({ length: 20 }, (_, i) => ({
                  value: i + 1,
                  label: `${i + 1}次`,
                }))}
              />
            </div>
            <Select
              title="播放倍速"
              value={playbackRate}
              onChange={(v) => setPlaybackRate(parseFloat(v))}
              options={[
                { value: 0.5, label: "0.5x" },
                { value: 0.75, label: "0.75x" },
                { value: 1, label: "1.0x" },
                { value: 1.25, label: "1.25x" },
                { value: 1.5, label: "1.5x" },
                { value: 2, label: "2.0x" },
              ]}
            />
          </div>
        </div>
      </div>
        </div>
      )}
    </div>
  );
};
