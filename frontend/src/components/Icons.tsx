/**
 * 统一的图标集。
 *
 * 全部采用描边（stroke）而非填充：侧边栏 CSS 会强制 `fill: none`，
 * 且 CSS 优先级高于 SVG 的 presentation attribute，填充型图标在那里
 * 会被掏空成轮廓。统一描边后各处渲染一致，视觉重量也整齐。
 */
import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  style: { display: "block" },
});

/** 设置：齿轮。原来是三条带圆点的横线（推子），更像均衡器而非设置。 */
export const SettingsIcon = ({ className, size = 20 }: IconProps) => (
  <svg className={className} {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const CloseIcon = ({ className, size = 20 }: IconProps) => (
  <svg className={className} {...base(size)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/** 桌面歌词：对话框内两行文字 */
export const SubtitlesIcon = ({ className, size = 20 }: IconProps) => (
  <svg className={className} {...base(size)}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <line x1="7" y1="8.5" x2="17" y2="8.5" />
    <line x1="7" y1="12.5" x2="13" y2="12.5" />
  </svg>
);

/** 锁定：真正的挂锁。原图形是个漏斗/图钉状，完全看不出是锁。 */
export const LockIcon = ({ className, size = 20 }: IconProps) => (
  <svg className={className} {...base(size)}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    <circle cx="12" cy="15.5" r="1.2" />
  </svg>
);

/** 解锁：锁梁向上敞开 */
export const UnlockIcon = ({ className, size = 20 }: IconProps) => (
  <svg className={className} {...base(size)}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    <path d="M8 10.5V7a4 4 0 0 1 7.5-1.9" />
    <circle cx="12" cy="15.5" r="1.2" />
  </svg>
);

export const RepeatIcon = ({ className, size = 20 }: IconProps) => (
  <svg className={className} {...base(size)}>
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

/** 播放器：单音符 */
export const MusicNoteIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} {...base(size)}>
    <path d="M9 18V5.5l10-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </svg>
);

/** 频道：广播信号 */
export const RadioIcon = ({ className, size = 20 }: IconProps) => (
  <svg className={className} {...base(size)}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
  </svg>
);
