import React, { memo, useMemo } from "react";
import { TRANSLATION_FONT_SCALE } from "../../utils/lyricTranslation";

const LINE_STYLE: React.CSSProperties = {
  lineHeight: "1.6",
  padding: "12px 0",
  boxSizing: "border-box",
  fontSize: "inherit",
};

/**
 * 译文子行。必须渲染在歌词行元素 *内部* —— App.tsx 的 scrollToActive 用
 * list.children[activeIndex] 定位，译文若成为兄弟节点会让所有下标错位，
 * 同时破坏滚动、整句复听和高亮。
 */
const TranslationLine = memo(
  ({ text, fontSize, active }: { text: string; fontSize: number; active: boolean }) => (
    <div
      className="lyric-translation"
      style={{
        fontSize: `${fontSize * TRANSLATION_FONT_SCALE}px`,
        fontWeight: 400,
        opacity: active ? 0.85 : 0.6,
      }}>
      {text}
    </div>
  ),
);

export const StaticLine = memo(
  ({
    text,
    translation,
    color,
    fontSize,
  }: {
    text: string;
    translation?: string;
    color: string;
    fontSize: number;
  }) => (
    <div
      className="lyric-line"
      style={{ ...LINE_STYLE, color, fontSize: `${fontSize * 0.8}px` }}>
      {text}
      {translation && (
        <TranslationLine text={translation} fontSize={fontSize * 0.8} active={false} />
      )}
    </div>
  ),
);

export const ActiveKaraokeLine = memo(
  ({
    text,
    translation,
    progress,
    activeColor,
    color,
    fontSize,
  }: {
    text: string;
    translation?: string;
    progress: number;
    activeColor: string;
    color: string;
    fontSize: number;
  }) => {
    const parts = useMemo(
      () => (/\s/.test(text) ? text.split(/(\s+)/) : Array.from(text)),
      [text],
    );
    // 进度分母只看原文；译文是独立节点，不参与卡拉OK 计算
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
          if (!wordLen) return null;

          if (/^\s+$/.test(word)) {
            charOffset += wordLen;
            return (
              <span
                key={wordIdx}
                style={{
                  whiteSpace: "pre-wrap",
                }}>
                {word}
              </span>
            );
          }

          const wordEndProgress = (charOffset + wordLen) / totalChars;
          const isWordFocused =
            progress >= charOffset / totalChars && progress < wordEndProgress;
          const element = (
            <span
              key={wordIdx}
              style={{
                whiteSpace: "normal",
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
        {translation && (
          <TranslationLine text={translation} fontSize={fontSize} active />
        )}
      </div>
    );
  },
);
