import { memo } from "react";

export const ColorPicker = memo(
  ({
    label,
    value,
    presets,
    onUpdate,
  }: {
    label: string;
    value: string;
    presets: string[];
    onUpdate: (val: string) => void;
  }) => (
    <div className="setting-item">
      <label>{label}</label>
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginTop: "8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}>
        {presets.map((c) => (
          <div
            key={c}
            onClick={() => onUpdate(c)}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              backgroundColor: c.startsWith("rgba(0,0,0,0)")
                ? "transparent"
                : c,
              cursor: "pointer",
              border:
                value === c
                  ? "3px solid #fff"
                  : "2px solid rgba(255,255,255,0.2)",
              position: "relative",
              overflow: "hidden",
              transition: "all 0.2s ease",
              boxShadow:
                value === c ? "0 0 0 2px rgba(245, 87, 108, 0.5)" : "none",
            }}
            onMouseEnter={(e) => {
              if (value !== c) {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)";
                e.currentTarget.style.transform = "scale(1.1)";
              }
            }}
            onMouseLeave={(e) => {
              if (value !== c) {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                e.currentTarget.style.transform = "scale(1)";
              }
            }}>
            {c === "rgba(0,0,0,0)" && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 0,
                  width: "100%",
                  height: "2px",
                  backgroundColor: "#f5576c",
                  transform: "rotate(45deg)",
                }}
              />
            )}
          </div>
        ))}
        <input
          type="color"
          value={String(value).startsWith("rgba") ? "#000000" : String(value)}
          onChange={(e) => onUpdate(e.target.value)}
          style={{
            width: "32px",
            height: "32px",
            padding: 0,
            border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: "50%",
            background: "none",
            cursor: "pointer",
            overflow: "hidden",
          }}
        />
      </div>
    </div>
  ),
);
