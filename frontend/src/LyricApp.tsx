import { useState, useEffect, useRef, useMemo, memo } from "react";

// Optimized Word Component
const KaraokeWord = memo(
  ({
    word,
    startProgress,
    endProgress,
    currentProgress,
    activeColor,
    color,
    textShadow,
  }: any) => {
    const isFocused =
      currentProgress >= startProgress && currentProgress < endProgress;

    return (
      <span
        style={{
          whiteSpace: "nowrap",
          display: "inline-block",
          transform: isFocused ? "scale(1.1)" : "scale(1)",
          transition: "transform 0.1s ease-out",
          margin: "0 1px",
        }}>
        {Array.from(word).map((char: any, i: number) => {
          const charLen = word.length || 1;
          const charStart =
            startProgress + (i / charLen) * (endProgress - startProgress);
          const charEnd =
            startProgress + ((i + 1) / charLen) * (endProgress - startProgress);

          let p = 0;
          if (currentProgress >= charEnd) p = 1;
          else if (currentProgress <= charStart) p = 0;
          else p = (currentProgress - charStart) / (charEnd - charStart);

          return (
            <span
              key={i}
              style={{
                position: "relative",
                display: "inline-block",
                color: color,
                whiteSpace: "pre",
                textShadow: textShadow,
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
  },
);

const LyricApp = () => {
  const [lyricData, setLyricData] = useState({
    text: "等待播放...",
    progress: 0,
  });
  const [settings, setSettings] = useState({
    fontSize: 32,
    color: "#ffffff",
    activeColor: "#ffeb3b",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    shadowOpacity: 0.5,
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isLocked, setIsLocked] = useState(true); // 默认锁定（点击穿透）
  const boxRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef(0);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.ipcRenderer) return;

    const lyricHandler = (_event: any, data: any) => {
      setLyricData((prev) => {
        if (typeof data === "string")
          return prev.text === data ? prev : { text: data, progress: 0 };
        if (
          prev.text === data.text &&
          Math.abs(prev.progress - data.progress) < 0.005
        )
          return prev;
        return data;
      });
    };

    const settingsHandler = (_event: any, s: any) => {
      setSettings((prev) => ({ ...prev, ...s }));
    };

    const lockStateHandler = (_event: any, locked: boolean) => {
      setIsLocked(locked);
    };

    window.ipcRenderer.on("update-lyric", lyricHandler);
    window.ipcRenderer.on("update-settings", settingsHandler);
    window.ipcRenderer.on("update-lock-state", lockStateHandler);

    // 初始化时设置点击穿透（默认锁定）
    window.ipcRenderer.invoke("set-lyric-ignore-mouse-events", true, {
      forward: true,
    });

    return () => {
      if (window.ipcRenderer.off) {
        window.ipcRenderer.off("update-lyric", lyricHandler);
        window.ipcRenderer.off("update-settings", settingsHandler);
        window.ipcRenderer.off("update-lock-state", lockStateHandler);
      }
    };
  }, []);

  useEffect(() => {
    const updateHeight = () => {
      if (boxRef.current && window.ipcRenderer) {
        const h = Math.ceil(boxRef.current.getBoundingClientRect().height + 30);
        if (Math.abs(h - lastHeightRef.current) > 4 && h > 20) {
          window.ipcRenderer.send("resize-lyric-window", { height: h });
          lastHeightRef.current = h;
        }
      }
    };
    updateHeight();
    const obs = new ResizeObserver(updateHeight);
    if (boxRef.current) obs.observe(boxRef.current);
    return () => obs.disconnect();
  }, [lyricData.text, settings.fontSize]);

  const lines = useMemo(() => lyricData.text.split("\n"), [lyricData.text]);

  const isActuallyTransparent = settings.backgroundColor === "rgba(0,0,0,0)";

  const effectiveBg = useMemo(() => {
    if (isActuallyTransparent) {
      return isHovered ? "rgba(0, 0, 0, 0.5)" : "transparent";
    }
    return settings.backgroundColor;
  }, [isHovered, settings.backgroundColor, isActuallyTransparent]);

  const effectiveBlur = useMemo(() => {
    if (isActuallyTransparent) {
      return isHovered ? "blur(15px)" : "none";
    }
    return "blur(15px)";
  }, [isHovered, isActuallyTransparent]);

  const hasShadow = useMemo(() => {
    if (isActuallyTransparent) return isHovered;
    return true;
  }, [isHovered, isActuallyTransparent]);


  return (
    <div
      className="lyric-container"
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}>
      {/* 透明背景层 - 用于拖动，只在解锁时启用 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          WebkitAppRegion: isLocked ? "none" : "drag",
          pointerEvents: isLocked ? "none" : "auto",
          zIndex: 1,
        } as React.CSSProperties}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      
      {/* 拖动手柄 - 只在解锁时显示 */}
      {!isLocked && (
        <div
          ref={dragHandleRef}
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isHovered
              ? "rgba(255, 255, 255, 0.1)"
              : "rgba(255, 255, 255, 0.05)",
            borderRadius: "8px",
            cursor: "move",
            transition: "all 0.2s ease",
            zIndex: 1000,
            pointerEvents: "auto",
            WebkitAppRegion: "drag",
          } as React.CSSProperties}
          title="拖动窗口">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              color: isHovered
                ? "rgba(255, 255, 255, 0.8)"
                : "rgba(255, 255, 255, 0.3)",
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties}>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="3" y1="15" x2="21" y2="15"></line>
          </svg>
        </div>
      )}
      
      {/* 歌词内容区域 - 解锁时可拖动，禁用文本选择 */}
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 2,
          pointerEvents: "auto",
          WebkitAppRegion: isLocked ? "none" : "drag",
          userSelect: "none",
          WebkitUserSelect: "none",
        } as React.CSSProperties}>
        <div
          ref={boxRef}
          style={{
            backgroundColor: effectiveBg,
            padding: "16px 32px",
            borderRadius: "20px",
            width: "auto",
            maxWidth: "92%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            boxShadow: hasShadow ? "0 10px 40px rgba(0,0,0,0.3)" : "none",
            backdropFilter: effectiveBlur,
            WebkitBackdropFilter: effectiveBlur,
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            border:
              isActuallyTransparent && !isHovered
                ? "none"
                : "1px solid rgba(255,255,255,0.1)",
            WebkitAppRegion: isLocked ? "none" : "drag",
            userSelect: "none",
            WebkitUserSelect: "none",
            pointerEvents: "auto",
          } as React.CSSProperties}>
        {lines.map((line, idx) => {
          const lineWords = line.split(/(\s+)/);
          const lineLength = line.length || 1;
          let currentOffset = 0;

          return (
            <div
              key={idx}
              style={{
                textAlign: "center",
                width: "100%",
                marginBottom: idx < lines.length - 1 ? "8px" : 0,
                fontSize: `${idx === 0 ? settings.fontSize : settings.fontSize * 0.7}px`,
                fontWeight: idx === 0 ? 700 : 500,
                color: settings.color,
                textShadow:
                  isActuallyTransparent && !isHovered
                    ? `0 1px 3px rgba(0,0,0,${settings.shadowOpacity})`
                    : "none",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitAppRegion: isLocked ? "none" : "drag",
                pointerEvents: "auto",
              } as React.CSSProperties}>
              {lineWords.map((word, wordIdx) => {
                const start = currentOffset / lineLength;
                const end = (currentOffset + word.length) / lineLength;
                const elem = (
                  <KaraokeWord
                    key={wordIdx}
                    word={word}
                    startProgress={start}
                    endProgress={end}
                    currentProgress={lyricData.progress}
                    activeColor={settings.activeColor}
                    color={settings.color}
                    textShadow={
                      isActuallyTransparent && !isHovered
                        ? `0 1px 3px rgba(0,0,0,${settings.shadowOpacity})`
                        : "none"
                    }
                  />
                );
                currentOffset += word.length;
                return elem;
              })}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};

export default LyricApp;
