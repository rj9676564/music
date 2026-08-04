import React from "react";
import { color, radius } from "../../styles/tokens";

/** A row in the channel or episode list. Hover treatment comes from
 *  `.browser-list-item` in index.css. */
export const ListItemCard: React.FC<{
  selected?: boolean;
  onClick?: () => void;
  minHeight?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ selected = false, onClick, minHeight = 84, style, children }) => (
  <div
    className="browser-list-item"
    onClick={onClick}
    style={{
      padding: "16px 18px",
      background: selected ? "rgba(255, 255, 255, 0.1)" : color.surface1,
      borderRadius: radius.xl,
      border: `1px solid ${selected ? "rgba(255, 255, 255, 0.18)" : color.hairline}`,
      cursor: onClick ? "pointer" : "default",
      marginBottom: "10px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
      minHeight: `${minHeight}px`,
      position: "relative",
      ...style,
    }}>
    {children}
  </div>
);
