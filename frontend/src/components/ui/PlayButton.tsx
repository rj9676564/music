import React from "react";
import { Spinner } from "./Spinner";

/**
 * The three-state transport button (loading / playing / paused). Previously
 * duplicated verbatim in both PlayerPanel subpages.
 */
export const PlayButton: React.FC<{
  isLoading: boolean;
  isPlaying: boolean;
  onToggle: () => void;
  size?: number;
}> = ({ isLoading, isPlaying, onToggle, size = 24 }) => (
  <button className="play-btn" onClick={onToggle}>
    {isLoading ? (
      <Spinner size={size} />
    ) : isPlaying ? (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </svg>
    ) : (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    )}
  </button>
);
