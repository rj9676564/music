import React, { useState, useRef, useEffect, useCallback } from "react";
import { color, radius, fontSize, CONTROL_HEIGHT, gradient } from "../../styles/tokens";

export interface SpeedControlProps {
  playbackRate: number;
  onChange: (rate: number) => void;
  title?: string;
  min?: number;
  max?: number;
  step?: number;
  align?: "left" | "right";
}

const PRESET_RATES = [
  0.5, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95,
  1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.5, 2.0
];

const roundRate = (num: number): number => {
  return Math.round(num * 100) / 100;
};

const formatRate = (rate: number): string => {
  const rounded = roundRate(rate);
  if (rounded % 0.1 === 0) {
    return `${rounded.toFixed(1)}x`;
  }
  return `${rounded.toFixed(2)}x`;
};

export const SpeedControl: React.FC<SpeedControlProps> = ({
  playbackRate,
  onChange,
  title = "播放倍速 (点击展开详细调节 / 滚轮微调)",
  min = 0.25,
  max = 3.0,
  step = 0.05,
  align = "right",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [isEditingInput, setIsEditingInput] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const clampAndSet = useCallback(
    (val: number) => {
      const clamped = Math.min(max, Math.max(min, roundRate(val)));
      onChange(clamped);
    },
    [min, max, onChange]
  );

  // Close on click outside or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setIsEditingInput(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setIsEditingInput(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Mouse wheel scroll to adjust speed
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? step : -step;
    clampAndSet(playbackRate + delta);
  };

  const handleCustomInputSubmit = () => {
    const parsed = parseFloat(customInput);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      clampAndSet(parsed);
    }
    setIsEditingInput(false);
    setCustomInput("");
  };

  const isCustomRate = playbackRate !== 1.0;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "inline-block" }}
      onWheel={handleWheel}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={title}
        style={{
          height: CONTROL_HEIGHT,
          minWidth: "76px",
          padding: "0 12px",
          borderRadius: radius.lg,
          border: `1px solid ${
            isOpen || isCustomRate ? color.accentBorder : color.hairlineStrong
          }`,
          background: isCustomRate ? color.accentBg : color.surface2,
          color: isCustomRate ? color.accent : "#fff",
          fontSize: fontSize.sm,
          fontWeight: isCustomRate ? 600 : 500,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          transition: "all 0.15s ease",
          userSelect: "none",
          outline: "none",
        }}>
        <span>{formatRate(playbackRate)}</span>
        <span
          style={{
            fontSize: "10px",
            opacity: 0.7,
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.2s ease",
          }}>
          ▼
        </span>
      </button>

      {/* Floating Popover */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 10px)",
            [align === "right" ? "right" : "left"]: 0,
            width: "280px",
            background: "rgba(22, 24, 38, 0.95)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: radius.xl,
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)",
            padding: "16px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            animation: "fadeIn 0.15s ease-out",
          }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: `1px solid ${color.hairline}`,
              paddingBottom: "10px",
            }}>
            <span
              style={{
                fontSize: fontSize.sm,
                fontWeight: 600,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}>
              <span>⚡</span> 播放倍速调节
            </span>
            {isCustomRate && (
              <button
                type="button"
                onClick={() => clampAndSet(1.0)}
                style={{
                  fontSize: fontSize.xs,
                  padding: "2px 8px",
                  borderRadius: radius.sm,
                  background: color.accentBgStrong,
                  border: `1px solid ${color.accentBorder}`,
                  color: color.accent,
                  cursor: "pointer",
                }}>
                1.0x 重置
              </button>
            )}
          </div>

          {/* Stepper Controls & Current Readout */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              background: color.surface1,
              padding: "6px 8px",
              borderRadius: radius.md,
              border: `1px solid ${color.hairline}`,
            }}>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                title="减速 0.1x"
                onClick={() => clampAndSet(playbackRate - 0.1)}
                style={{
                  padding: "4px 8px",
                  borderRadius: radius.sm,
                  background: color.surface2,
                  border: `1px solid ${color.hairline}`,
                  color: "#fff",
                  fontSize: fontSize.xs,
                  cursor: "pointer",
                }}>
                -0.1
              </button>
              <button
                type="button"
                title="微调减速 0.05x"
                onClick={() => clampAndSet(playbackRate - 0.05)}
                style={{
                  padding: "4px 8px",
                  borderRadius: radius.sm,
                  background: color.surface2,
                  border: `1px solid ${color.hairline}`,
                  color: "#fff",
                  fontSize: fontSize.xs,
                  cursor: "pointer",
                }}>
                -0.05
              </button>
            </div>

            <span
              style={{
                fontSize: fontSize.md,
                fontWeight: 700,
                color: color.accent,
                letterSpacing: "0.02em",
              }}>
              {formatRate(playbackRate)}
            </span>

            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                title="微调加速 0.05x"
                onClick={() => clampAndSet(playbackRate + 0.05)}
                style={{
                  padding: "4px 8px",
                  borderRadius: radius.sm,
                  background: color.surface2,
                  border: `1px solid ${color.hairline}`,
                  color: "#fff",
                  fontSize: fontSize.xs,
                  cursor: "pointer",
                }}>
                +0.05
              </button>
              <button
                type="button"
                title="加速 0.1x"
                onClick={() => clampAndSet(playbackRate + 0.1)}
                style={{
                  padding: "4px 8px",
                  borderRadius: radius.sm,
                  background: color.surface2,
                  border: `1px solid ${color.hairline}`,
                  color: "#fff",
                  fontSize: fontSize.xs,
                  cursor: "pointer",
                }}>
                +0.1
              </button>
            </div>
          </div>

          {/* Slider */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: fontSize.xs,
                color: color.fg3,
              }}>
              <span>{min}x</span>
              <span style={{ color: playbackRate === 1.0 ? color.accent : color.fg2 }}>
                1.0x
              </span>
              <span>{max}x</span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={playbackRate}
              onChange={(e) => clampAndSet(parseFloat(e.target.value))}
              style={{
                width: "100%",
                accentColor: "var(--c-accent)",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Quick Preset Pills */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: fontSize.xs, color: color.fg3 }}>常用预设</span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "6px",
              }}>
              {PRESET_RATES.map((rate) => {
                const isActive = Math.abs(playbackRate - rate) < 0.001;
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => clampAndSet(rate)}
                    style={{
                      padding: "6px 2px",
                      borderRadius: radius.sm,
                      border: `1px solid ${
                        isActive ? color.accentBorder : color.hairline
                      }`,
                      background: isActive ? color.accentBgStrong : color.surface2,
                      color: isActive ? color.accent : color.fg1,
                      fontSize: fontSize.xs,
                      fontWeight: isActive ? 700 : 400,
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.1s ease",
                    }}>
                    {rate}x
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Input & Keyboard Hints */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "8px",
              borderTop: `1px solid ${color.hairline}`,
              gap: "8px",
            }}>
            {isEditingInput ? (
              <div style={{ display: "flex", gap: "4px", width: "100%" }}>
                <input
                  type="number"
                  step="0.01"
                  min={min}
                  max={max}
                  autoFocus
                  placeholder="例如 0.85"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCustomInputSubmit();
                    if (e.key === "Escape") setIsEditingInput(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    background: color.surface2,
                    border: `1px solid ${color.accentBorder}`,
                    borderRadius: radius.sm,
                    color: "#fff",
                    fontSize: fontSize.xs,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={handleCustomInputSubmit}
                  style={{
                    padding: "4px 8px",
                    background: gradient.brand,
                    border: "none",
                    borderRadius: radius.sm,
                    color: "#fff",
                    fontSize: fontSize.xs,
                    cursor: "pointer",
                  }}>
                  确定
                </button>
              </div>
            ) : (
              <>
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: color.fg4,
                    lineHeight: 1.3,
                  }}>
                  快捷键: <b>[</b> <b>]</b> 调速 · <b>\</b> 复位 · 滚轮微调
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCustomInput(String(roundRate(playbackRate)));
                    setIsEditingInput(true);
                  }}
                  style={{
                    padding: "3px 6px",
                    background: "transparent",
                    border: `1px solid ${color.hairline}`,
                    borderRadius: radius.sm,
                    color: color.fg2,
                    fontSize: fontSize.xs,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}>
                  自定义
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
