import React from "react";

/** Eyebrow + title header shared by the channel and episode panels. */
export const PanelHeader: React.FC<{
  eyebrow: string;
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ eyebrow, title, left, right }) => (
  <div
    className="browser-panel-header"
    style={{
      display: "flex",
      alignItems: "center",
      marginBottom: "18px",
      justifyContent: "space-between",
      gap: "12px",
    }}>
    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
      {left}
      <div style={{ minWidth: 0 }}>
        <div className="browser-panel-eyebrow">{eyebrow}</div>
        <h2
          className="browser-panel-title"
          title={title}
          style={{
            margin: 0,
            fontSize: "1.75rem",
            color: "white",
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
          {title}
        </h2>
      </div>
    </div>
    {right}
  </div>
);
