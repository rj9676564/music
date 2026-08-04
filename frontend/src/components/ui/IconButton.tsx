import React from "react";
import { color, radius, CONTROL_HEIGHT } from "../../styles/tokens";

/**
 * Square 42px icon button. Promoted from the `iconButtonStyle()` factory that
 * lived inside PlayerPanel and was then re-hand-rolled inline twice more.
 */
export const IconButton: React.FC<{
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}> = ({ active = false, disabled = false, title, onClick, children }) => (
  <button
    title={title}
    disabled={disabled}
    onClick={onClick}
    style={{
      width: CONTROL_HEIGHT,
      height: CONTROL_HEIGHT,
      borderRadius: radius.lg,
      border: `1px solid ${active ? color.accentBorder : color.hairlineStrong}`,
      background: active ? color.accentBg : color.surface2,
      color: active ? color.accent : "#fff",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.65 : 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      flexShrink: 0,
    }}>
    {children}
  </button>
);
