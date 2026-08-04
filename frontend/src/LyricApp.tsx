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
    backgroundEffect: "solid",
    shadowOpacity: 0.5,
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isLocked, setIsLocked] = useState(true); // 默认锁定（点击穿透）
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const lastWindowSizeRef = useRef({ width: 0, height: 0 });
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
    const updateWindowSize = () => {
      if (!boxRef.current || !measureRef.current || !window.ipcRenderer) {
        return;
      }

      const horizontalPadding =
        settings.backgroundEffect === "transparentBlur" ? 96 : 72;
      const verticalPadding =
        settings.backgroundEffect === "transparentBlur" ? 64 : 30;
      const maxWidth = Math.max(
        360,
        Math.min(1100, Math.floor(window.screen.availWidth * 0.82)),
      );
      const naturalWidth = Math.ceil(
        measureRef.current.getBoundingClientRect().width + horizontalPadding,
      );
      const renderedHeight = Math.ceil(
        boxRef.current.getBoundingClientRect().height + verticalPadding,
      );
      const targetWidth = Math.max(280, Math.min(maxWidth, naturalWidth));
      const targetHeight = Math.max(40, renderedHeight);
      const last = lastWindowSizeRef.current;

      if (
        Math.abs(targetWidth - last.width) > 4 ||
        Math.abs(targetHeight - last.height) > 4
      ) {
        window.ipcRenderer.send("resize-lyric-window", {
          width: targetWidth,
          height: targetHeight,
        });
        lastWindowSizeRef.current = {
          width: targetWidth,
          height: targetHeight,
        };
      }
    };

    updateWindowSize();
    const obs = new ResizeObserver(updateWindowSize);
    if (boxRef.current) obs.observe(boxRef.current);
    if (measureRef.current) obs.observe(measureRef.current);
    return () => obs.disconnect();
  }, [lyricData.text, settings.backgroundEffect, settings.fontSize]);

  const lines = useMemo(() => lyricData.text.split("\n"), [lyricData.text]);

  const backgroundEffect =
    settings.backgroundEffect ??
    (settings.backgroundColor === "rgba(0,0,0,0)"
      ? "transparent"
      : "solid");
  const isActuallyTransparent = backgroundEffect === "transparent";
  const isTransparentBlur = backgroundEffect === "transparentBlur";

  const effectiveBg = useMemo(() => {
    if (backgroundEffect === "transparent") {
      return isHovered ? "rgba(0, 0, 0, 0.5)" : "transparent";
    }
    if (backgroundEffect === "transparentBlur") {
      return isHovered ? "rgba(0, 0, 0, 0.28)" : "rgba(0, 0, 0, 0.18)";
    }
    return settings.backgroundColor;
  }, [backgroundEffect, isHovered, settings.backgroundColor]);

  const effectiveBlur = useMemo(() => {
    if (backgroundEffect === "transparent") {
      return isHovered ? "blur(15px)" : "none";
    }
    if (backgroundEffect === "transparentBlur") {
      return isHovered ? "blur(18px)" : "blur(14px)";
    }
    return "blur(15px)";
  }, [backgroundEffect, isHovered]);

  const hasShadow = useMemo(() => {
    if (backgroundEffect === "transparent") return isHovered;
    return true;
  }, [backgroundEffect, isHovered]);

  const lyricBoxShadow = useMemo(() => {
    if (!hasShadow) return "none";
    if (backgroundEffect === "transparentBlur") {
      return "0 6px 18px rgba(0,0,0,0.16)";
    }
    return "0 10px 40px rgba(0,0,0,0.3)";
  }, [backgroundEffect, hasShadow]);

  const lyricTextShadow = useMemo(() => {
    if (backgroundEffect === "transparentBlur") return "none";
    if (backgroundEffect !== "solid" && !isHovered) {
      return `0 1px 3px rgba(0,0,0,${settings.shadowOpacity})`;
    }
    return "none";
  }, [backgroundEffect, isHovered, settings.shadowOpacity]);


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
          ref={measureRef}
          style={{
            position: "absolute",
            left: "-99999px",
            top: 0,
            visibility: "hidden",
            pointerEvents: "none",
            width: "fit-content",
            maxWidth: "none",
            padding: "16px 32px",
            fontFamily: "inherit",
          }}>
          {lines.map((line, idx) => (
            <div
              key={`measure-${idx}`}
              style={{
                whiteSpace: "nowrap",
                fontSize: `${idx === 0 ? settings.fontSize : settings.fontSize * 0.7}px`,
                fontWeight: idx === 0 ? 700 : 500,
                marginBottom: idx < lines.length - 1 ? "8px" : 0,
              }}>
              {line}
            </div>
          ))}
        </div>
        <div
          ref={boxRef}
          style={{
            backgroundColor: effectiveBg,
            padding: "16px 32px",
            borderRadius: "20px",
            width: "fit-content",
            maxWidth: "calc(100vw - 24px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            boxShadow: lyricBoxShadow,
            backdropFilter: effectiveBlur,
            WebkitBackdropFilter: effectiveBlur,
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            border:
              isActuallyTransparent && !isHovered
                ? "none"
                : isTransparentBlur
                  ? "1px solid rgba(255,255,255,0.14)"
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
                textShadow: lyricTextShadow,
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitAppRegion: isLocked ? "none" : "drag",
                pointerEvents: "auto",
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              } as React.CSSProperties}>
              {lineWords.map((word, wordIdx) => {
                const start = currentOffset / lineLength;
                const end = (currentOffset + word.length) / lineLength;
                const elem = word.trim() ? (
                  <KaraokeWord
                    key={wordIdx}
                    word={word}
                    startProgress={start}
                    endProgress={end}
                    currentProgress={lyricData.progress}
                    activeColor={settings.activeColor}
                    color={settings.color}
                    textShadow={lyricTextShadow}
                  />
                ) : (
                  <span key={wordIdx}>{word}</span>
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
