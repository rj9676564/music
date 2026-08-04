/**
 * TS mirror of styles/tokens.css.
 *
 * These are `var()` strings, NOT values — tokens.css remains the single source
 * of truth. This module exists so heavily inline-styled components can adopt
 * tokens without being rewritten into CSS classes, and so a typo produces a
 * type error instead of a silently transparent color.
 */

export const color = {
  accent: "var(--c-accent)",
  accent2: "var(--c-accent-2)",
  accentBg: "var(--c-accent-bg)",
  accentBgStrong: "var(--c-accent-bg-strong)",
  accentBorder: "var(--c-accent-border)",

  fg1: "var(--fg-1)",
  fg2: "var(--fg-2)",
  fg3: "var(--fg-3)",
  fg4: "var(--fg-4)",
  fg5: "var(--fg-5)",

  surface1: "var(--surface-1)",
  surface2: "var(--surface-2)",
  surface3: "var(--surface-3)",
  hairline: "var(--hairline)",
  hairlineStrong: "var(--hairline-strong)",
  scrim: "var(--scrim)",

  success: "var(--c-success)",
  successBg: "var(--c-success-bg)",
  successBorder: "var(--c-success-border)",
  warning: "var(--c-warning)",
  warningBg: "var(--c-warning-bg)",
  warningBorder: "var(--c-warning-border)",
  danger: "var(--c-danger)",
  dangerBg: "var(--c-danger-bg)",
  dangerBorder: "var(--c-danger-border)",
} as const;

export const gradient = {
  brand: "var(--g-brand)",
  brandH: "var(--g-brand-h)",
  artwork: "var(--g-artwork)",
  appBg: "var(--g-app-bg)",
} as const;

export const radius = {
  sm: "var(--r-sm)",
  md: "var(--r-md)",
  lg: "var(--r-lg)",
  xl: "var(--r-xl)",
  pill: "var(--r-pill)",
} as const;

export const space = {
  1: "var(--s-1)",
  2: "var(--s-2)",
  3: "var(--s-3)",
  4: "var(--s-4)",
  5: "var(--s-5)",
  6: "var(--s-6)",
} as const;

export const fontSize = {
  xs: "var(--fs-xs)",
  sm: "var(--fs-sm)",
  md: "var(--fs-md)",
  lg: "var(--fs-lg)",
  xl: "var(--fs-xl)",
} as const;

export const motion = {
  fast: "var(--t-fast)",
  base: "var(--t-base)",
} as const;

export const shadow = {
  s1: "var(--shadow-1)",
  s2: "var(--shadow-2)",
} as const;

export const CONTROL_HEIGHT = "var(--ctl-h)";
export const PANEL_BLUR = "var(--blur-panel)";

/** Shared style recipes used by more than one component. */
export const recipe = {
  /** Translucent card surface with a hairline border. */
  surfaceCard: {
    background: color.surface1,
    border: `1px solid ${color.hairline}`,
    borderRadius: radius.xl,
  },
  /** The 42px-tall control chrome shared by icon buttons and selects. */
  control: {
    height: CONTROL_HEIGHT,
    borderRadius: radius.lg,
    border: `1px solid ${color.hairlineStrong}`,
    background: color.surface2,
    color: "#fff",
  },
} as const;
