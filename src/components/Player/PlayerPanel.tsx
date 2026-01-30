import React from "react";
import { MusicNoteIcon } from "../Icons";
import { StaticLine, ActiveKaraokeLine } from "./LyricLine";

interface PlayerPanelProps {
  settings: any;
  musicInfo: any;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLoading: boolean;
  isTranscribing: boolean;
  isSummarizing: boolean;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  onSummarize: () => void;
  togglePlay: () => void;
  lyrics: any[];
  activeIndex: number;
  lyricListRef: React.RefObject<HTMLDivElement | null>;
  currentProgress: number;
  handleOpenMusic: () => void;
  handleOpenLyric: () => void;
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
  musicInfo,
  currentTime,
  duration,
  isPlaying,
  isLoading,
  isTranscribing,
  isSummarizing,
  playbackRate,
  setPlaybackRate,
  onSummarize,
  togglePlay,
  lyrics,
  activeIndex,
  lyricListRef,
  currentProgress,
  handleOpenMusic,
  handleOpenLyric,
  handleSeek,
}) => {
  return (
    <div
      className="glass-card main-layout"
      style={{
        width: "450px",
        flexShrink: 0,
        transition: "all 0.4s ease",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}>
      {/* Cover & Title */}
      <div
        className={`album-art ${isPlaying ? "playing" : ""}`}
        onClick={handleOpenMusic}
        title="点击打开音乐文件"
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
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.3)",
            }}>
            <MusicNoteIcon size={64} />
          </div>
        )}
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
            <div
              style={{
                padding: "4px 12px",
                background: "rgba(245, 87, 108, 0.2)",
                border: "1px solid rgba(245, 87, 108, 0.4)",
                borderRadius: "12px",
                fontSize: "0.75rem",
                color: "#f5576c",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
              转录中...
            </div>
          )}

          {lyrics.length > 0 && !musicInfo.summary && !isSummarizing && (
            <button
              onClick={onSummarize}
              style={{
                padding: "4px 12px",
                background: "linear-gradient(45deg, #f5576c 0%, #f093fb 100%)",
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
            <div
              style={{
                padding: "4px 12px",
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "12px",
                fontSize: "0.75rem",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
              AI 摘要生成中...
            </div>
          )}
        </div>
      </div>

      {/* AI Summary Content */}
      {musicInfo.summary && (
        <div
          style={{
            margin: "15px 20px 0",
            padding: "12px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.1)",
            fontSize: "0.85rem",
            color: "rgba(255,255,255,0.8)",
            maxHeight: "100px",
            overflowY: "auto",
            lineHeight: "1.5",
          }}
          className="custom-scrollbar">
          <div
            style={{
              color: "#f093fb",
              fontWeight: "bold",
              marginBottom: "4px",
              fontSize: "0.75rem",
            }}>
            🤖 AI 内容摘要
          </div>
          {musicInfo.summary}
        </div>
      )}

      {/* Controls */}
      <div className="controls">
        <button
          className="nav-btn"
          title="打开歌词文件"
          onClick={handleOpenLyric}
          style={{ width: "40px", height: "40px", fontSize: "0.8rem" }}>
          词
        </button>
        <button className="play-btn" onClick={togglePlay}>
          {isLoading ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="12" cy="12" r="10" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
          ) : isPlaying ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"></path>
            </svg>
          )}
        </button>
        <button
          className="nav-btn"
          title={settings.loop ? "关闭循环播放" : "开启循环播放"}
          onClick={(e) => {
            e.stopPropagation();
            settings.updateSettings({ loop: !settings.loop });
          }}
          style={{
            width: "40px",
            height: "40px",
            fontSize: "1.2rem",
            opacity: settings.loop ? 1 : 0.5,
            color: settings.loop ? "#f5576c" : "inherit",
          }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round">
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>

        {/* Speed Selector */}
        <select
          value={playbackRate}
          onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "15px",
            color: "white",
            padding: "2px 8px",
            fontSize: "0.75rem",
            outline: "none",
            cursor: "pointer",
            width: "55px",
            height: "26px",
            appearance: "none",
            textAlign: "center",
          }}
          title="播放倍速">
          <option value="0.5" style={{ background: "#222" }}>
            0.5x
          </option>
          <option value="0.75" style={{ background: "#222" }}>
            0.75x
          </option>
          <option value="1" style={{ background: "#222" }}>
            1.0x
          </option>
          <option value="1.25" style={{ background: "#222" }}>
            1.25x
          </option>
          <option value="1.5" style={{ background: "#222" }}>
            1.5x
          </option>
          <option value="2" style={{ background: "#222" }}>
            2.0x
          </option>
        </select>
      </div>

      {/* Progress Section */}
      <div
        className="progress-bar"
        onMouseDown={handleSeek}
        title="拖动或点击跳转进度"
        style={{ cursor: "pointer" }}>
        <div
          className="progress-fill"
          style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
        />
      </div>

      <div className="time-info">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Lyric Offset Quick Adjust */}
      {lyrics.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "8px 0",
            fontSize: "0.75rem",
            color: "rgba(255,255,255,0.6)",
          }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              settings.updateSettings({
                lyricOffset: Math.max(-10, settings.lyricOffset - 0.5),
              });
            }}
            style={{
              padding: "2px 8px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "4px",
              color: "white",
              cursor: "pointer",
              fontSize: "0.7rem",
            }}
            title="歌词提前 0.5 秒">
            -0.5s
          </button>
          <span style={{ minWidth: "60px", textAlign: "center" }}>
            偏移: {settings.lyricOffset > 0 ? "+" : ""}
            {settings.lyricOffset.toFixed(1)}s
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              settings.updateSettings({
                lyricOffset: Math.min(10, settings.lyricOffset + 0.5),
              });
            }}
            style={{
              padding: "2px 8px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "4px",
              color: "white",
              cursor: "pointer",
              fontSize: "0.7rem",
            }}
            title="歌词延后 0.5 秒">
            +0.5s
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              settings.updateSettings({ lyricOffset: 0 });
            }}
            style={{
              padding: "2px 8px",
              background: "rgba(245, 87, 108, 0.15)",
              border: "1px solid rgba(245, 87, 108, 0.3)",
              borderRadius: "4px",
              color: "#f5576c",
              cursor: "pointer",
              fontSize: "0.7rem",
            }}
            title="重置偏移">
            ↻
          </button>
        </div>
      )}

      {/* Lyrics View */}
      <div className="lyric-list custom-scrollbar" ref={lyricListRef}>
        {lyrics.length === 0 ? (
          <div
            style={{
              padding: "40px 0",
              color: "rgba(255,255,255,0.2)",
              textAlign: "center",
              fontSize: "0.9rem",
            }}>
            暂无歌词
          </div>
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
    </div>
  );
};
