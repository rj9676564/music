import React from "react";
import { color, radius, fontSize } from "../../styles/tokens";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: "#fff", bg: color.surface2, border: color.hairlineStrong },
  accent: { fg: color.accent, bg: color.accentBg, border: color.accentBorder },
  success: { fg: color.success, bg: color.successBg, border: color.successBorder },
  warning: { fg: color.warning, bg: color.warningBg, border: color.warningBorder },
  danger: { fg: color.danger, bg: color.dangerBg, border: color.dangerBorder },
};

/** Small status pill — transcription state, AI activity, translation state. */
export const Badge: React.FC<{
  tone?: BadgeTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ tone = "neutral", icon, children }) => {
  const t = TONES[tone];
  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: radius.md,
        fontSize: fontSize.sm,
        color: t.fg,
        background: t.bg,
        border: `1px solid ${t.border}`,
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        whiteSpace: "nowrap",
      }}>
      {icon}
      {children}
    </span>
  );
};
