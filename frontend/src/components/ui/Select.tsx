import React from "react";
import { color, radius, fontSize, CONTROL_HEIGHT } from "../../styles/tokens";

export interface SelectOption {
  value: string | number;
  label: string;
}

/**
 * Dark-themed native select. The per-<option> background is a workaround for
 * native dropdowns ignoring the parent's dark styling — it was previously
 * repeated on seven separate options in PlayerPanel.
 */
export const Select: React.FC<{
  value: string | number;
  options: SelectOption[];
  onChange: (value: string) => void;
  title?: string;
  minWidth?: number;
  bare?: boolean;
}> = ({ value, options, onChange, title, minWidth = 86, bare = false }) => (
  <select
    value={value}
    title={title}
    onChange={(e) => onChange(e.target.value)}
    style={{
      height: bare ? "100%" : CONTROL_HEIGHT,
      minWidth: `${minWidth}px`,
      padding: "0 12px",
      borderRadius: bare ? 0 : radius.lg,
      border: bare ? "none" : `1px solid ${color.hairlineStrong}`,
      background: bare ? "transparent" : color.surface2,
      color: "#fff",
      appearance: "none",
      textAlign: "center",
      outline: "none",
      fontSize: fontSize.sm,
      cursor: "pointer",
    }}>
    {options.map((o) => (
      <option key={o.value} value={o.value} style={{ background: "#222" }}>
        {o.label}
      </option>
    ))}
  </select>
);
