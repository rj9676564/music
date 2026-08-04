import React from "react";
import { gradient } from "../../styles/tokens";

/**
 * Square artwork thumbnail with a gradient fallback. Shared by the channel and
 * episode lists, which previously carried near-identical copies.
 */
export const ArtworkTile: React.FC<{
  src?: string;
  alt?: string;
  size?: number;
  radius?: number;
  fallback?: React.ReactNode;
  overlay?: React.ReactNode;
}> = ({ src, alt, size = 52, radius = 14, fallback, overlay }) => (
  <div
    style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${radius}px`,
      background: gradient.artwork,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      flexShrink: 0,
      position: "relative",
    }}>
    {src ? (
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "inherit",
          display: "block",
        }}
      />
    ) : (
      fallback
    )}
    {overlay}
  </div>
);
