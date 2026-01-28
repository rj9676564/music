import React from "react";
import { CloseIcon } from "./Icons";
import { ColorPicker } from "./ColorPicker";

interface SettingsDialogProps {
  onClose: () => void;
  settings: any;
  isTranscribing: boolean;
  onAiTranscribe: () => void;
  onResetLyricWindow: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  onClose,
  settings,
  isTranscribing,
  onAiTranscribe,
  onResetLyricWindow,
}) => {
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);

  React.useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devs.filter((d) => d.kind === "audiooutput");
        setDevices(audioOutputs);
      } catch (err) {
        console.error("Error fetching audio devices:", err);
      }
    };
    fetchDevices();
  }, []);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-dialog-header">
          <h2 className="settings-dialog-title">歌词设置</h2>
          <button className="settings-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="settings-dialog-content custom-scrollbar">
          <div className="setting-row">
            <button
              className={`tool-btn ${isTranscribing ? "" : "active"}`}
              style={{
                flex: 1,
                padding: "10px",
                background: isTranscribing
                  ? "#444"
                  : "linear-gradient(45deg, #f5576c 0%, #f093fb 100%)",
                border: "none",
                color: "#fff",
                fontWeight: "bold",
                fontSize: "0.8rem",
              }}
              onClick={onAiTranscribe}
              disabled={isTranscribing}>
              {isTranscribing ? "⏳ AI 转录中..." : "✨ AI 生成歌词"}
            </button>
            <button
              className="tool-btn"
              style={{ padding: "0 15px" }}
              onClick={onResetLyricWindow}>
              🔄 重置位置
            </button>
          </div>

          <div className="setting-grid setting-grid-checkbox">
            <div className="setting-item setting-item-checkbox">
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                }}>
                <input
                  type="checkbox"
                  checked={settings.showDesktopLyric}
                  onChange={(e) =>
                    settings.updateSettings({
                      showDesktopLyric: e.target.checked,
                    })
                  }
                />
                桌面歌词
              </label>
            </div>
            <div className="setting-item setting-item-checkbox">
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                }}>
                <input
                  type="checkbox"
                  checked={settings.loop}
                  onChange={(e) =>
                    settings.updateSettings({
                      loop: e.target.checked,
                    })
                  }
                />
                循环播放
              </label>
            </div>
            <div className="setting-item">
              <label>
                歌词时间偏移: {settings.lyricOffset > 0 ? "+" : ""}
                {settings.lyricOffset.toFixed(1)}s
              </label>
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={() =>
                    settings.updateSettings({
                      lyricOffset: Math.max(-10, settings.lyricOffset - 0.1),
                    })
                  }
                  style={{
                    padding: "4px 12px",
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "4px",
                    color: "white",
                    cursor: "pointer",
                  }}>
                  -0.1s
                </button>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="0.1"
                  value={settings.lyricOffset}
                  onChange={(e) =>
                    settings.updateSettings({
                      lyricOffset: parseFloat(e.target.value),
                    })
                  }
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() =>
                    settings.updateSettings({
                      lyricOffset: Math.min(10, settings.lyricOffset + 0.1),
                    })
                  }
                  style={{
                    padding: "4px 12px",
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "4px",
                    color: "white",
                    cursor: "pointer",
                  }}>
                  +0.1s
                </button>
                <button
                  onClick={() =>
                    settings.updateSettings({
                      lyricOffset: 0,
                    })
                  }
                  style={{
                    padding: "4px 12px",
                    background: "rgba(245, 87, 108, 0.2)",
                    border: "1px solid rgba(245, 87, 108, 0.4)",
                    borderRadius: "4px",
                    color: "#f5576c",
                    cursor: "pointer",
                  }}>
                  重置
                </button>
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "rgba(255,255,255,0.5)",
                  marginTop: "4px",
                }}>
                如果歌词显示过早，请增加偏移；如果过晚，请减少偏移
              </div>
            </div>
            <div className="setting-item">
              <label>API 服务器地址</label>
              <input
                type="text"
                value={settings.apiUrl}
                onChange={(e) =>
                  settings.updateSettings({ apiUrl: e.target.value })
                }
                placeholder="http://localhost:8080"
                style={{
                  width: "100%",
                  padding: "8px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "4px",
                  color: "white",
                  outline: "none",
                  marginTop: "4px",
                  fontSize: "0.8rem",
                }}
              />
            </div>
            <div className="setting-item">
              <label>输出设备</label>
              <select
                value={settings.audioDeviceId}
                onChange={(e) =>
                  settings.updateSettings({ audioDeviceId: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "4px",
                  color: "white",
                  outline: "none",
                  marginTop: "4px",
                  fontSize: "0.8rem",
                }}>
                <option value="default" style={{ background: "#222" }}>
                  系统默认设备
                </option>
                {devices.map((device) => (
                  <option
                    key={device.deviceId}
                    value={device.deviceId}
                    style={{ background: "#222" }}>
                    {device.label || `设备 (${device.deviceId.slice(0, 5)}...)`}
                  </option>
                ))}
              </select>
            </div>
            <div className="setting-item">
              <label>字号: {settings.fontSize}px</label>
              <input
                type="range"
                min="16"
                max="72"
                value={settings.fontSize}
                onChange={(e) =>
                  settings.updateSettings({
                    fontSize: parseInt(e.target.value),
                  })
                }
              />
            </div>
            <div className="setting-item">
              <label>
                桌面歌词阴影:{" "}
                {Math.round((settings.shadowOpacity ?? 0.5) * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.shadowOpacity ?? 0.5}
                onChange={(e) =>
                  settings.updateSettings({
                    shadowOpacity: parseFloat(e.target.value),
                  })
                }
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <div className="setting-grid colors">
            <ColorPicker
              label="常规文字颜色"
              value={settings.color}
              onUpdate={(val) => settings.updateSettings({ color: val })}
              presets={["#ffffff", "#cccccc", "#ffeb3b", "#4caf50"]}
            />
            <ColorPicker
              label="当前播放高亮"
              value={settings.activeColor}
              onUpdate={(val) => settings.updateSettings({ activeColor: val })}
              presets={["#ffeb3b", "#ff9800", "#f44336", "#00e676"]}
            />
            <ColorPicker
              label="桌面歌词背景"
              value={settings.backgroundColor}
              onUpdate={(val) =>
                settings.updateSettings({ backgroundColor: val })
              }
              presets={[
                "rgba(0,0,0,0)",
                "rgba(0,0,0,0.4)",
                "rgba(0,0,0,0.8)",
                "#1a1a2e",
              ]}
            />
          </div>
        </div>
        <div className="settings-dialog-actions">
          <button className="settings-confirm-btn" onClick={onClose}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
};
