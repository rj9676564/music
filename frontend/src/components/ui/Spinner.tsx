import React from "react";

/**
 * The app's single spinner. Replaces four verbatim inline SVG copies that lived
 * in PlayerPanel, plus a CSS border-spinner in ChannelsPanel whose `.spinner`
 * class was never defined in any stylesheet.
 */
export const Spinner: React.FC<{ size?: number; style?: React.CSSProperties }> = ({
  size = 12,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ animation: "spin 1s linear infinite", ...style }}>
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
  </svg>
);
