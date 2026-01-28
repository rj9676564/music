import React, { memo, useMemo } from "react";

const LINE_STYLE: React.CSSProperties = {
  lineHeight: "1.6",
  padding: "12px 0",
  boxSizing: "border-box",
  fontSize: "inherit",
};

export const StaticLine = memo(
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

export const ActiveKaraokeLine = memo(
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
