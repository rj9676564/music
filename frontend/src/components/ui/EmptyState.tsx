import React from "react";
import { color, fontSize } from "../../styles/tokens";

/** Placeholder for an empty list or an unavailable surface. */
export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}> = ({ icon, title, hint, action }) => (
  <div
    style={{
      padding: "40px 20px",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
    }}>
    {icon && <div style={{ color: color.fg5, marginBottom: "4px" }}>{icon}</div>}
    <div style={{ color: color.fg3, fontSize: fontSize.md }}>{title}</div>
    {hint && (
      <div style={{ color: color.fg4, fontSize: fontSize.sm }}>{hint}</div>
    )}
    {action && (
      <button className="tool-btn" style={{ marginTop: "8px" }} onClick={action.onClick}>
        {action.label}
      </button>
    )}
  </div>
);
