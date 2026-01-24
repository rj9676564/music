import { useRef, useEffect, memo, useCallback, useMemo, useState } from "react";
import { parseLrc, parseSrt } from "./utils/lrcParser";
import { useSettingsStore } from "./store/settingsStore";
import { usePlayerStore } from "./store/playerStore";
import "./App.css";

const LINE_STYLE: React.CSSProperties = {
  lineHeight: "1.6",
  padding: "12px 0",
  boxSizing: "border-box",
  fontSize: "inherit",
};

// 1. StaticLine now correctly applies settings.color
const StaticLine = memo(
  ({
    text,
    color,
    fontSize,
  }: {
    text: string;
    color: string;
    fontSize: number;
  }) => (
    <div
      className="lyric-line"
      style={{ ...LINE_STYLE, color, fontSize: `${fontSize * 0.8}px` }}>
      {" "}
      {text}{" "}
    </div>
  ),
);

// 2. ActiveKaraokeLine now respects the selected base color
const ActiveKaraokeLine = memo(
  ({
    text,
    progress,
    activeColor,
    color,
    fontSize,
  }: {
    text: string;
    progress: number;
    activeColor: string;
    color: string;
    fontSize: number;
  }) => {
    const parts = useMemo(() => text.split(/(\s+)/), [text]);
    const totalChars = text.length || 1;
    let charOffset = 0;
    return (
      <div
        className="lyric-line active"
        style={{
          ...LINE_STYLE,
          fontSize: `${fontSize}px`,
          fontWeight: "bold",
          color: color,
        }}>
        {parts.map((word, wordIdx) => {
          const wordLen = word.length;
          const wordEndProgress = (charOffset + wordLen) / totalChars;
          const isWordFocused =
            progress >= charOffset / totalChars && progress < wordEndProgress;
          const element = (
            <span
              key={wordIdx}
              style={{
                whiteSpace: "nowrap",
                display: "inline-block",
                transform: isWordFocused ? "scale(1.05)" : "scale(1)",
                color: progress >= wordEndProgress ? activeColor : "inherit",
                transition: "transform 0.1s ease-out",
              }}>
              {Array.from(word).map((char, i) => {
                const start = (charOffset + i) / totalChars;
                const end = (charOffset + i + 1) / totalChars;
                const p =
                  progress >= end
                    ? 1
                    : progress <= start
                      ? 0
                      : (progress - start) / (end - start);
                return (
                  <span
                    key={i}
                    style={{
                      position: "relative",
                      display: "inline-block",
                      whiteSpace: "pre",
                    }}>
                    {p > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: `${p * 105}%`,
                          overflow: "hidden",
                          color: activeColor,
                          zIndex: 1,
                          whiteSpace: "pre",
                        }}>
                        {char}
                      </span>
                    )}
                    {char}
                  </span>
                );
              })}
            </span>
          );
          charOffset += wordLen;
          return element;
        })}
      </div>
    );
  },
);

const ColorPicker = memo(
  ({
    label,
    value,
    presets,
    onUpdate,
  }: {
    label: string;
    value: string;
    presets: string[];
    onUpdate: (val: string) => void;
  }) => (
    <div className="setting-item">
      <label>{label}</label>
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: "5px",
          flexWrap: "wrap",
        }}>
        {presets.map((c) => (
          <div
            key={c}
            onClick={() => onUpdate(c)}
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              backgroundColor: c.startsWith("rgba(0,0,0,0)")
                ? "transparent"
                : c,
              cursor: "pointer",
              border:
                value === c
                  ? "2px solid #fff"
                  : "1px solid rgba(255,255,255,0.2)",
              position: "relative",
              overflow: "hidden",
            }}>
            {c === "rgba(0,0,0,0)" && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 0,
                  width: "100%",
                  height: "1px",
                  backgroundColor: "red",
                  transform: "rotate(45deg)",
                }}
              />
            )}
          </div>
        ))}
        <input
          type="color"
          value={String(value).startsWith("rgba") ? "#000000" : String(value)}
          onChange={(e) => onUpdate(e.target.value)}
          style={{
            width: "22px",
            height: "22px",
            padding: 0,
            border: "none",
            background: "none",
          }}
        />
      </div>
    </div>
  ),
);

function App() {
  const settings = useSettingsStore();

  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const audioPath = usePlayerStore((state) => state.audioPath);
  const lyrics = usePlayerStore((state) => state.lyrics);
  const activeIndex = usePlayerStore((state) => state.activeIndex);
  const musicInfo = usePlayerStore((state) => state.musicInfo);
  const isTranscribing = usePlayerStore((state) => state.isTranscribing);

  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setCurrentTime = usePlayerStore((state) => state.setCurrentTime);
  const setActiveIndex = usePlayerStore((state) => state.setActiveIndex);
  const setAudio = usePlayerStore((state) => state.setAudio);
  const setLyrics = usePlayerStore((state) => state.setLyrics);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const setTranscribing = usePlayerStore((state) => state.setTranscribing);

  const [showSettings, setShowSettings] = useState(false);
  const [isLyricLocked, setIsLyricLocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const lyricListRef = useRef<HTMLDivElement>(null);
  const lastIpcUpdateRef = useRef({ index: -1, progress: -1 });

  const scrollToActive = useCallback(
    (immediate = false) => {
      const list = lyricListRef.current;
      if (!list || activeIndex === -1) return;
      const activeEl = list.children[activeIndex] as HTMLElement;
      if (!activeEl) return;
      const targetTop =
        activeEl.offsetTop - list.offsetHeight / 2 + activeEl.offsetHeight / 2;
      list.scrollTo({
        top: targetTop,
        behavior: immediate ? "auto" : "smooth",
      });
    },
    [activeIndex],
  );

  const handleOpenMusic = useCallback(async () => {
    if (!window.ipcRenderer) return;
    const file = await window.ipcRenderer.invoke("open-file", [
      { name: "Music", extensions: ["mp3", "wav", "m4a", "aac"] },
    ]);
    if (file) {
      const name =
        file.path
          .split("/")
          .pop()
          ?.replace(/\.[^/.]+$/, "") || "未知歌曲";
      setAudio(file.url, { name, artist: "本地音源" });
      const match = await window.ipcRenderer.invoke(
        "find-matching-lyric",
        file.path,
      );
      setLyrics(
        match
          ? match.path.toLowerCase().endsWith(".srt")
            ? parseSrt(match.content)
            : parseLrc(match.content)
          : [],
      );
      const lastPos = localStorage.getItem(`pos-${file.url}`);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          if (lastPos) {
            audioRef.current.currentTime = parseFloat(lastPos);
            setCurrentTime(parseFloat(lastPos));
          }
        }
      }, 0);
    }
  }, [setAudio, setLyrics, setCurrentTime]);

  const togglePlay = useCallback(() => {
    if (!audioPath) {
      handleOpenMusic();
      return;
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setPlaying(false);
        localStorage.setItem(
          `pos-${audioPath}`,
          audioRef.current.currentTime.toString(),
        );
      } else {
        audioRef.current
          .play()
          .then(() => setPlaying(true))
          .catch((e) => console.error(e));
      }
    }
  }, [isPlaying, audioPath, handleOpenMusic, setPlaying]);

  // Main Sync Engine
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let requestID: number;
    const sync = () => {
      const time = audio.currentTime;
      if (Math.abs(time - usePlayerStore.getState().currentTime) > 0.05)
        setCurrentTime(time);
      const currentLyrics = usePlayerStore.getState().lyrics;
      const index = currentLyrics.findLastIndex((l) => time >= l.time);
      if (index !== -1 && index !== usePlayerStore.getState().activeIndex) {
        setActiveIndex(index);
        setTimeout(() => scrollToActive(), 0);
      }
      if (index !== -1 && settings.showDesktopLyric) {
        const l = currentLyrics[index];
        const dur =
          l.endTime !== undefined
            ? l.endTime - l.time
            : index < currentLyrics.length - 1
              ? currentLyrics[index + 1].time - l.time
              : 2;
        const progress = Math.min(
          1.0,
          Math.max(0, (time - l.time) / (dur || 1)),
        );
        if (
          index !== lastIpcUpdateRef.current.index ||
          Math.abs(progress - lastIpcUpdateRef.current.progress) > 0.03
        ) {
          window.ipcRenderer?.send("update-lyric", {
            text: currentLyrics[index].text,
            progress,
          });
          lastIpcUpdateRef.current = { index, progress };
        }
      }
      if (usePlayerStore.getState().isPlaying)
        requestID = requestAnimationFrame(sync);
    };
    if (isPlaying) requestID = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(requestID);
  }, [
    isPlaying,
    settings.showDesktopLyric,
    scrollToActive,
    setCurrentTime,
    setActiveIndex,
  ]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (audioRef.current) audioRef.current.currentTime += 5;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (audioRef.current) audioRef.current.currentTime -= 5;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

  // Settings Sync (IPC)
  useEffect(() => {
    const { updateSettings, ...data } = settings;
    window.ipcRenderer?.send("update-settings", data);
    window.ipcRenderer?.send("toggle-lyric-window", data.showDesktopLyric);
  }, [settings]);

  // Restore
  useEffect(() => {
    const restore = async () => {
      const saved = localStorage.getItem("last-played-music");
      if (saved && window.ipcRenderer) {
        const { path, name, artist } = JSON.parse(saved);
        if (await window.ipcRenderer.invoke("check-file-exists", path)) {
          const full = `local-file://media${path}`;
          setAudio(full, { name, artist });
          const savedLyric = localStorage.getItem(`lyric-${full}`);
          if (
            savedLyric &&
            (await window.ipcRenderer.invoke("check-file-exists", savedLyric))
          ) {
            const content = await window.ipcRenderer.invoke(
              "read-file-content",
              savedLyric,
            );
            if (content)
              setLyrics(
                savedLyric.toLowerCase().endsWith(".srt")
                  ? parseSrt(content)
                  : parseLrc(content),
              );
          } else {
            const match = await window.ipcRenderer.invoke(
              "find-matching-lyric",
              path,
            );
            if (match)
              setLyrics(
                match.path.toLowerCase().endsWith(".srt")
                  ? parseSrt(match.content)
                  : parseLrc(match.content),
              );
          }
          const lp = localStorage.getItem(`pos-${full}`);
          if (lp && audioRef.current) {
            audioRef.current.currentTime = parseFloat(lp);
            setCurrentTime(parseFloat(lp));
          }
          setTimeout(() => audioRef.current?.load(), 0);
        }
      }
    };
    restore();
  }, [setAudio, setLyrics, setCurrentTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const upd = () => setDuration(audio.duration);
    audio.addEventListener("loadedmetadata", upd);
    return () => audio.removeEventListener("loadedmetadata", upd);
  }, [audioPath, setDuration]);

  const handleAiTranscribe = async () => {
    if (!audioPath) {
      alert("请先打开一个音频文件");
      return;
    }
    setTranscribing(true);
    try {
      const res: any = await window.ipcRenderer?.invoke(
        "transcribe-audio",
        audioPath.replace("local-file://media", ""),
      );
      if (res.success) {
        if (res.srtContent) setLyrics(parseSrt(res.srtContent));
        alert("🎉 转录成功！");
      } else alert(res.message);
    } catch (e) {
      console.error(e);
    } finally {
      setTranscribing(false);
    }
  };

  const currentProgress = useMemo(() => {
    if (activeIndex === -1 || !lyrics[activeIndex]) return 0;
    const l = lyrics[activeIndex];
    const dur =
      l.endTime !== undefined
        ? l.endTime - l.time
        : activeIndex < lyrics.length - 1
          ? lyrics[activeIndex + 1].time - l.time
          : 2;
    return Math.min(1.0, Math.max(0, (currentTime - l.time) / (dur || 1)));
  }, [activeIndex, lyrics, currentTime]);

  return (
    <div className="player-container">
      <div className="app-header">
        <div className="top-toolbar">
          <button
            className={`tool-btn ${isLyricLocked ? "active" : ""}`}
            onClick={() => {
              setIsLyricLocked(!isLyricLocked);
              window.ipcRenderer?.invoke(
                "set-lyric-ignore-mouse-events",
                !isLyricLocked,
                { forward_system_messages: true },
              );
            }}>
            {" "}
            {isLyricLocked ? "🔒" : "🔓"}{" "}
          </button>
          <button
            className={`tool-btn ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(!showSettings)}>
            {" "}
            {showSettings ? "✕" : "☰"}{" "}
          </button>
        </div>
      </div>

      <div className="glass-card main-layout">
        {showSettings && (
          <div className="settings-panel inline-panel">
            <div className="setting-row">
              <button
                className={`tool-btn ${isTranscribing ? "" : "active"}`}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: isTranscribing
                    ? "#444"
                    : "linear-gradient(45deg, #f5576c 0%, #f093fb 100%)",
                  border: "none",
                  color: "#fff",
                  fontWeight: "bold",
                  fontSize: "0.8rem",
                }}
                onClick={handleAiTranscribe}
                disabled={isTranscribing}>
                {" "}
                {isTranscribing ? "⏳ AI 转录中..." : "✨ AI 生成歌词"}{" "}
              </button>
              <button
                className="tool-btn"
                style={{ padding: "0 15px" }}
                onClick={() =>
                  window.ipcRenderer?.invoke("reset-lyric-window")
                }>
                {" "}
                🔄 重置位置{" "}
              </button>
            </div>
            <div className="setting-grid">
              <div className="setting-item">
                {" "}
                <label
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    cursor: "pointer",
                  }}>
                  {" "}
                  桌面歌词{" "}
                  <input
                    type="checkbox"
                    checked={settings.showDesktopLyric}
                    onChange={(e) =>
                      settings.updateSettings({
                        showDesktopLyric: e.target.checked,
                      })
                    }
                  />{" "}
                </label>{" "}
              </div>
              <div className="setting-item">
                {" "}
                <label>字号: {settings.fontSize}px</label>{" "}
                <input
                  type="range"
                  min="16"
                  max="72"
                  value={settings.fontSize}
                  onChange={(e) =>
                    settings.updateSettings({
                      fontSize: parseInt(e.target.value),
                    })
                  }
                />{" "}
              </div>
            </div>
            <div className="setting-grid colors">
              <ColorPicker
                label="常规文字颜色"
                value={settings.color}
                onUpdate={(val) => settings.updateSettings({ color: val })}
                presets={["#ffffff", "#cccccc", "#ffeb3b", "#4caf50"]}
              />
              <ColorPicker
                label="当前播放高亮"
                value={settings.activeColor}
                onUpdate={(val) =>
                  settings.updateSettings({ activeColor: val })
                }
                presets={["#ffeb3b", "#ff9800", "#f44336", "#00e676"]}
              />
              <ColorPicker
                label="桌面歌词背景"
                value={settings.backgroundColor}
                onUpdate={(val) =>
                  settings.updateSettings({ backgroundColor: val })
                }
                presets={[
                  "rgba(0,0,0,0)",
                  "rgba(0,0,0,0.4)",
                  "rgba(0,0,0,0.8)",
                  "#1a1a2e",
                ]}
              />
            </div>
          </div>
        )}

        <div
          className="player-content-wrapper"
          style={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            width: "100%",
            overflow: "hidden",
          }}>
          <div
            className="mini-info"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "15px",
              marginBottom: "10px",
            }}>
            <div
              className="album-art mini"
              style={{
                width: "60px",
                height: "60px",
                fontSize: "1.5rem",
                marginBottom: 0,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}>
              💿
            </div>
            <div
              className="track-info"
              style={{ textAlign: "left", marginBottom: 0 }}>
              <div
                className="track-name"
                style={{ fontSize: "1rem", color: "#fff" }}>
                {musicInfo.name}
              </div>
              <div className="artist-name">{musicInfo.artist}</div>
            </div>
          </div>
          <div
            className="progress-bar"
            onClick={(e) =>
              audioRef.current &&
              (audioRef.current.currentTime =
                Math.max(
                  0,
                  Math.min(
                    1,
                    (e.clientX - e.currentTarget.getBoundingClientRect().left) /
                      e.currentTarget.getBoundingClientRect().width,
                  ),
                ) * duration)
            }>
            <div
              className="progress-fill"
              style={{
                width: `${(currentTime / duration) * 100 || 0}%`,
                pointerEvents: "none",
              }}></div>
          </div>
          <div className="time-info">
            <span>
              {Math.floor(currentTime / 60)}:
              {Math.floor(currentTime % 60)
                .toString()
                .padStart(2, "0")}
            </span>
            <span>
              {Math.floor(duration / 60)}:
              {Math.floor(duration % 60)
                .toString()
                .padStart(2, "0")}
            </span>
          </div>
          <div className="controls">
            <button className="nav-btn" onClick={handleOpenMusic}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            </button>
            <button
              className="play-btn"
              onClick={togglePlay}
              style={{
                width: "56px",
                height: "56px",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
              {isPlaying ? (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M8 5C7.44772 5 7 5.44772 7 6V18C7 18.5523 7.44772 19 8 19H11C11.5523 19 12 18.5523 12 18V6C12 5.44772 11.5523 5 11 5H8Z"
                    fill="currentColor"
                  />
                  <path
                    d="M15 5C14.4477 5 14 5.44772 14 6V18C14 18.5523 14.4477 19 15 19H18C18.5523 19 19 18.5523 19 18V6C19 5.44772 18.5523 5 18 5H15Z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ marginLeft: "4px" }}>
                  <path
                    d="M5.5 3.5L20.5 12L5.5 20.5V3.5Z"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              )}
            </button>
            <button className="nav-btn" onClick={() => {}}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                <line x1="7" y1="8" x2="17" y2="8"></line>
                <line x1="7" y1="12" x2="17" y2="12"></line>
              </svg>
            </button>
          </div>
          <div className="lyric-list" ref={lyricListRef}>
            {lyrics.map((line, index) =>
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
            )}
          </div>
        </div>
      </div>
      {audioPath && <audio ref={audioRef} src={audioPath} key={audioPath} />}
    </div>
  );
}

export default App;
