import { useState, useEffect, useRef, useMemo } from "react";

const LyricApp = () => {
  const [lyricData, setLyricData] = useState({
    text: "桌面歌词准备就绪...",
    progress: 0,
  });
  const [settings, setSettings] = useState({
    fontSize: 32,
    color: "#ffffff",
    activeColor: "#ffeb3b",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    glowColor: "rgba(0,0,0,0.8)",
  });

  const boxRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef(0);

  useEffect(() => {
    if (!window.ipcRenderer) return;

    const removeLyricListener = window.ipcRenderer.on(
      "update-lyric",
      (_event, data) => {
        // Optimization: Only update state if data is different
        setLyricData((prev) => {
          if (typeof data === "string") {
            if (prev.text === data && prev.progress === 0) return prev;
            return { text: data, progress: 0 };
          }
          if (
            prev.text === data.text &&
            Math.abs(prev.progress - data.progress) < 0.001
          )
            return prev;
          return data;
        });
      },
    );

    const removeSettingsListener = window.ipcRenderer.on(
      "update-settings",
      (_event, newSettings) => {
        setSettings((prev) => ({ ...prev, ...newSettings }));
      },
    );

    return () => {
      if (typeof removeLyricListener === "function") removeLyricListener();
      if (typeof removeSettingsListener === "function")
        removeSettingsListener();
    };
  }, []);

  // Use ResizeObserver instead of setInterval for performance
  useEffect(() => {
    const updateWindowHeight = () => {
      if (boxRef.current && window.ipcRenderer) {
        const contentHeight = boxRef.current.getBoundingClientRect().height;
        const targetHeight = Math.ceil(contentHeight + 24);

        if (Math.abs(targetHeight - lastHeightRef.current) > 3) {
          window.ipcRenderer.send("resize-lyric-window", {
            height: targetHeight,
          });
          lastHeightRef.current = targetHeight;
        }
      }
    };

    const observer = new ResizeObserver(updateWindowHeight);
    if (boxRef.current) observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, [lyricData.text, settings.fontSize]);

  const lines = useMemo(() => lyricData.text.split("\n"), [lyricData.text]);

  const renderKaraokeLine = (
    text: string,
    progress: number,
    isMain: boolean,
  ) => {
    // Memoizing the word split would be better, but tricky inside a render function
    const words = text.split(/(\s+)/);
    const totalChars = text.length || 1;
    let charIndexOffset = 0;

    const fontSize = isMain ? settings.fontSize : settings.fontSize * 0.7;
    const isTransparent = settings.backgroundColor === "rgba(0,0,0,0)";
    const unifiedShadowFilter = isTransparent
      ? "none"
      : "drop-shadow(0px 2px 4px rgba(0,0,0,0.8)) drop-shadow(0px 0px 8px rgba(0,0,0,0.4))";

    return (
      <div
        style={{
          fontSize: `${fontSize}px`,
          fontWeight: isMain ? 700 : 500,
          opacity: isMain ? 1 : 0.85,
          lineHeight: 1.3,
          display: "inline-block",
          textAlign: "center",
          maxWidth: "100%",
          letterSpacing: "0.5px",
          filter: unifiedShadowFilter,
          WebkitFilter: unifiedShadowFilter,
          willChange: "filter", // Hardware acceleration hint
        }}>
        {words.map((word, wordIdx) => {
          const wordChars = Array.from(word);
          const element = (
            <span
              key={wordIdx}
              style={{ whiteSpace: "nowrap", display: "inline-block" }}>
              {wordChars.map((char, i) => {
                const globalIdx = charIndexOffset + i;
                const charStart = globalIdx / totalChars;
                const charEnd = (globalIdx + 1) / totalChars;

                let charProgress = 0;
                if (progress >= charEnd) charProgress = 1;
                else if (progress <= charStart) charProgress = 0;
                else
                  charProgress = (progress - charStart) / (charEnd - charStart);

                return (
                  <span
                    key={i}
                    style={{
                      position: "relative",
                      display: "inline-block",
                      color: settings.color,
                      whiteSpace: "pre",
                    }}>
                    {charProgress > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: `${charProgress * 100}%`,
                          overflow: "hidden",
                          color: settings.activeColor,
                          zIndex: 1,
                          transition: "none",
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
          charIndexOffset += wordChars.length;
          return element;
        })}
      </div>
    );
  };

  const maxLinesHeight = settings.fontSize * 1.5 * 3 + 40;

  return (
    <div
      className="lyric-container"
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
      <div
        ref={boxRef}
        style={{
          backgroundColor: settings.backgroundColor,
          padding: "12px 24px",
          borderRadius: "16px",
          width: "auto",
          maxWidth: "96%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxShadow:
            settings.backgroundColor === "rgba(0,0,0,0)"
              ? "none"
              : "0 8px 32px rgba(0,0,0,0.2)",
          willChange: "transform", // Performance boost
        }}>
        {lines.map((line, idx) => (
          <div
            key={idx}
            style={{
              textAlign: "center",
              width: "100%",
              marginBottom: idx < lines.length - 1 ? "6px" : 0,
            }}>
            {renderKaraokeLine(line, lyricData.progress, idx === 0)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LyricApp;
