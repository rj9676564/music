import { useState, useRef, useEffect, memo, useCallback } from "react";
import { parseLrc, parseSrt } from "./utils/lrcParser";
import type { LyricLine } from "./utils/lrcParser";
import "./App.css";

const LINE_STYLE: React.CSSProperties = {
  lineHeight: "1.6",
  padding: "12px 0",
  boxSizing: "border-box",
};

const StaticLine = memo(({ text, color }: { text: string; color: string }) => (
  <div className="lyric-line" style={{ ...LINE_STYLE, color }}>
    {text}
  </div>
));

const ActiveKaraokeLine = memo(
  ({
    text,
    progress,
    activeColor,
  }: {
    text: string;
    progress: number;
    activeColor: string;
  }) => {
    const words = text.split(/(\s+)/);
    const totalChars = text.length || 1;
    let charOffset = 0;

    return (
      <div
        className="lyric-line active"
        style={{
          ...LINE_STYLE,
          wordBreak: "normal",
          overflowWrap: "break-word",
        }}>
        {words.map((word, wordIdx) => {
          const wordChars = Array.from(word);
          const wordElem = (
            <span
              key={wordIdx}
              style={{ whiteSpace: "nowrap", display: "inline-block" }}>
              {wordChars.map((char, i) => {
                const globalIdx = charOffset + i;
                const start = globalIdx / totalChars;
                const end = (globalIdx + 1) / totalChars;
                let p = 0;
                // Ensure progress remains 1 if we've passed the line's time
                if (progress >= end) p = 1;
                else if (progress <= start) p = 0;
                else p = (progress - start) / (end - start);

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
                          width: `${p * 100}%`,
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
          charOffset += wordChars.length;
          return wordElem;
        })}
      </div>
    );
  },
);

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLyricLocked, setIsLyricLocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioPath, setAudioPath] = useState<string | null>(null);

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("player-settings");
    const defaults = {
      fontSize: 32,
      color: "#ffffff",
      activeColor: "#ffeb3b",
      backgroundColor: "rgba(0,0,0,0.3)",
      showDesktopLyric: true,
    };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  const [musicInfo, setMusicInfo] = useState({
    name: "未选择歌曲",
    artist: "未知艺术家",
  });
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

  useEffect(() => {
    if (lyrics.length > 0) setTimeout(() => scrollToActive(true), 200);
  }, [lyrics, scrollToActive]);

  useEffect(() => {
    if (!lyricListRef.current) return;
    const observer = new ResizeObserver(() => scrollToActive(true));
    observer.observe(lyricListRef.current);
    return () => observer.disconnect();
  }, [scrollToActive]);

  const togglePlay = useCallback(() => {
    if (audioRef.current && audioPath) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch((e) => console.error(e));
      }
    }
  }, [isPlaying, audioPath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (!audioRef.current) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        audioRef.current.currentTime = Math.min(
          audioRef.current.duration,
          audioRef.current.currentTime + 5,
        );
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        audioRef.current.currentTime = Math.max(
          0,
          audioRef.current.currentTime - 5,
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

  useEffect(() => {
    localStorage.setItem("player-settings", JSON.stringify(settings));
    window.ipcRenderer?.send("update-settings", settings);
    window.ipcRenderer?.send("toggle-lyric-window", settings.showDesktopLyric);
  }, [settings]);

  useEffect(() => {
    const restore = async () => {
      const saved = localStorage.getItem("last-played-music");
      if (saved && window.ipcRenderer) {
        const { path, name, artist } = JSON.parse(saved);
        if (await window.ipcRenderer.invoke("check-file-exists", path)) {
          setAudioPath(`local-file://media${path}`);
          setMusicInfo({ name, artist });
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
      }
    };
    restore();
  }, []);

  // REFINED SYNC: Sticky Focus on Musical Gaps
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let rafId: number;
    const sync = () => {
      const time = audio.currentTime;
      setCurrentTime(time);

      // STICKY: Find the last line that should have started
      // This ensures we don't drop to index -1 during background music
      const index = lyrics.findLastIndex((l) => time >= l.time);

      if (index !== -1) {
        if (index !== activeIndex) {
          setActiveIndex(index);
          setTimeout(() => scrollToActive(), 0);
        }

        const l = lyrics[index];
        // Calculate progress based on real duration or gap to next
        const dur =
          l.endTime !== undefined
            ? l.endTime - l.time
            : index < lyrics.length - 1
              ? lyrics[index + 1].time - l.time
              : 2;
        const progress = Math.min(
          1.0,
          Math.max(0, (time - l.time) / (dur || 1)),
        );

        if (
          settings.showDesktopLyric &&
          (index !== lastIpcUpdateRef.current.index ||
            Math.abs(progress - lastIpcUpdateRef.current.progress) > 0.01)
        ) {
          window.ipcRenderer?.send("update-lyric", {
            text: lyrics[index].text,
            progress,
          });
          lastIpcUpdateRef.current = { index, progress };
        }
      }

      rafId = requestAnimationFrame(sync);
    };

    if (isPlaying) rafId = requestAnimationFrame(sync);
    else setCurrentTime(audio.currentTime);
    return () => cancelAnimationFrame(rafId);
  }, [
    lyrics,
    activeIndex,
    isPlaying,
    settings.showDesktopLyric,
    scrollToActive,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setDuration(audio.duration);
    audio.addEventListener("loadedmetadata", update);
    return () => audio.removeEventListener("loadedmetadata", update);
  }, [audioPath]);

  const handleOpenMusic = async () => {
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
      setAudioPath(file.url);
      setMusicInfo({ name, artist: "本地音源" });
      setIsPlaying(false);
      localStorage.setItem(
        "last-played-music",
        JSON.stringify({ path: file.path, name, artist: "本地音源" }),
      );
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
      setTimeout(() => audioRef.current?.load(), 0);
    }
  };

  const ColorPicker = ({
    label,
    field,
    presets,
  }: {
    label: string;
    field: string;
    presets: string[];
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
            onClick={() => setSettings({ ...settings, [field]: c })}
            style={{
              width: "22px",
              height: "22px",
              borderRadius: field === "backgroundColor" ? "4px" : "50%",
              backgroundColor: c.startsWith("rgba(0,0,0,0)")
                ? "transparent"
                : c,
              cursor: "pointer",
              border:
                settings[field] === c
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
          value={
            settings[field]?.startsWith("rgba") ? "#000000" : settings[field]
          }
          onChange={(e) =>
            setSettings({ ...settings, [field]: e.target.value })
          }
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
  );

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
            {isLyricLocked ? "🔒" : "🔓"}
          </button>
          <button
            className={`tool-btn ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? "✕" : "☰"}
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ marginTop: "60px" }}>
        {showSettings ? (
          <div className="settings-panel">
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>
              播放器设置
            </h2>
            <div className="setting-item">
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}>
                显示桌面歌词
                <input
                  type="checkbox"
                  checked={settings.showDesktopLyric}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      showDesktopLyric: e.target.checked,
                    })
                  }
                  style={{
                    width: "20px",
                    height: "20px",
                    accentColor: "#f5576c",
                  }}
                />
              </label>
            </div>
            <div className="setting-item">
              <label>歌词字体大小: {settings.fontSize}px</label>
              <input
                type="range"
                min="16"
                max="72"
                value={settings.fontSize}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    fontSize: parseInt(e.target.value),
                  })
                }
              />
            </div>
            <ColorPicker
              label="基础文字颜色"
              field="color"
              presets={["#ffffff", "#cccccc", "#ffeb3b", "#4caf50"]}
            />
            <ColorPicker
              label="播放高亮颜色"
              field="activeColor"
              presets={["#ffeb3b", "#ff9800", "#f44336", "#00e676"]}
            />
            <ColorPicker
              label="桌面歌词背景"
              field="backgroundColor"
              presets={[
                "rgba(0,0,0,0)",
                "rgba(0,0,0,0.3)",
                "rgba(0,0,0,0.6)",
                "#1a1a2e",
              ]}
            />
            <div className="setting-item" style={{ marginTop: "10px" }}>
              <button
                className="tool-btn"
                style={{ width: "100%", fontSize: "0.8rem", padding: "8px" }}
                onClick={() =>
                  window.ipcRenderer?.invoke("reset-lyric-window")
                }>
                🔄 重置桌面歌词位置
              </button>
            </div>
            <button
              className="tool-btn active"
              style={{ width: "100%", marginTop: "auto" }}
              onClick={() => setShowSettings(false)}>
              确定
            </button>
          </div>
        ) : (
          <>
            <div
              className="album-art"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "3.5rem",
              }}>
              💿
            </div>
            <div className="track-info">
              <div className="track-name">{musicInfo.name}</div>
              <div className="artist-name">{musicInfo.artist}</div>
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
                      (e.clientX -
                        e.currentTarget.getBoundingClientRect().left) /
                        e.currentTarget.getBoundingClientRect().width,
                    ),
                  ) * duration)
              }
              style={{ cursor: "pointer" }}>
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
            <div className="controls" style={{ marginBottom: "1rem" }}>
              <button className="nav-btn" onClick={handleOpenMusic}>
                📂
              </button>
              <button
                className="play-btn"
                onClick={togglePlay}
                disabled={!audioPath}>
                {isPlaying ? "⏸" : "▶️"}
              </button>
              <button
                className="nav-btn"
                onClick={async () => {
                  const file = await window.ipcRenderer?.invoke("open-file", [
                    { name: "Lyrics", extensions: ["lrc", "srt"] },
                  ]);
                  if (file) {
                    const content = await window.ipcRenderer?.invoke(
                      "read-file-content",
                      file.path,
                    );
                    if (content)
                      setLyrics(
                        file.path.endsWith(".srt")
                          ? parseSrt(content)
                          : parseLrc(content),
                      );
                  }
                }}>
                📝
              </button>
            </div>
            <div
              className="lyric-list"
              ref={lyricListRef}
              style={{ maxHeight: "200px" }}>
              {lyrics.map((line, index) => {
                if (index === activeIndex) {
                  // Re-calculate local progress for renderer
                  const l = lyrics[index];
                  const dur =
                    l.endTime !== undefined
                      ? l.endTime - l.time
                      : index < lyrics.length - 1
                        ? lyrics[index + 1].time - l.time
                        : 2;
                  const progress = Math.min(
                    1.0,
                    Math.max(0, (currentTime - l.time) / (dur || 1)),
                  );
                  return (
                    <ActiveKaraokeLine
                      key={index}
                      text={line.text}
                      progress={progress}
                      activeColor={settings.activeColor}
                    />
                  );
                }
                return (
                  <StaticLine
                    key={index}
                    text={line.text}
                    color={
                      index < activeIndex
                        ? settings.activeColor
                        : "rgba(255,255,255,0.4)"
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
      {audioPath && <audio ref={audioRef} src={audioPath} key={audioPath} />}
    </div>
  );
}

export default App;
