import pkg from "../package.json" with { type: "json" };
import type { Action, RegenerateStyle } from "./types.js";

/**
 * Maximum buffer size for git diff operations (10MB)
 */
export const MAX_GIT_BUFFER_SIZE = 10 * 1024 * 1024;

/**
 * Default number of recent commits to fetch for style reference
 */
export const DEFAULT_RECENT_COMMITS_COUNT = 5;

/**
 * Maximum diff length before truncation (8000 chars to avoid token limits)
 */
export const MAX_DIFF_LENGTH = 8000;

/**
 * Session timeout for Copilot API calls in milliseconds (60 seconds)
 */
export const COPILOT_SESSION_TIMEOUT = 60000;

/**
 * Maximum recommended commit subject line length
 */
export const MAX_SUBJECT_LENGTH = 72;

/**
 * CLI and UI version (from package.json)
 */
export const VERSION = pkg.version;

/**
 * Name of the configuration file
 */
export const CONFIG_FILENAME = ".commit-ai.json";

/**
 * Emoji mappings for conventional commit types
 */
export const EMOJI_MAP: Record<string, string> = {
  feat: "✨",
  fix: "🐛",
  refactor: "♻️",
  docs: "📝",
  style: "💄",
  test: "✅",
  chore: "🔧",
  perf: "⚡",
  ci: "👷",
  build: "📦",
};

/**
 * ASCII art logo lines for the CLI header
 */
export const LOGO_LINES = [
  "┌-┐┌-┐┌┬┐┌┬┐┬┌┬┐  ┌-┐┬",
  "|  | |||||||| |---├-┤|",
  "└-┘└-┘┴ ┴┴ ┴┴ ┴   ┴ ┴┴",
];

/**
 * Interval in ms between header logo color animation frames
 */
export const LOGO_ANIMATION_INTERVAL_MS = 280;

/**
 * Colors cycled through for the animated header logo
 */
export const LOGO_ANIMATION_COLORS = ["green", "cyan", "blue", "magenta", "yellow"] as const;

/**
 * Spinner labels shown during each Copilot generation phase
 */
export const PROGRESS_SPINNER_LABELS: Record<string, string> = {
  session: "Creating Copilot session...",
  sending: "Sending diff to Copilot...",
  streaming: "Generating message...",
};

/**
 * User-facing labels for "Stopped after X" error context in CLI
 */
export const PROGRESS_STEP_LABELS: Record<string, string> = {
  connecting: "connecting to Copilot",
  session: "creating Copilot session",
  sending: "sending diff",
  streaming: "generating message",
};

/**
 * Default Copilot model name (overridable via config or COMMIT_AI_MODEL)
 */
export const DEFAULT_COPILOT_MODEL = "grok-code-fast-1";

/**
 * Default premium model for "Retry with premium model" (overridable via config)
 */
export const DEFAULT_PREMIUM_MODEL = "sonnet-3.5";

/**
 * Status text shown while committing
 */
export const STATUS_COMMITTING = "Committing...";

/**
 * Status text shown when user cancels
 */
export const STATUS_CANCELLED = "Cancelled";

/**
 * Commit / Regenerate / Cancel action choices (label and value)
 */
export const ACTIONS: { label: string; value: Action }[] = [
  { label: "✓ Commit", value: "commit" },
  { label: "↻ Regenerate", value: "regenerate" },
  { label: "✕ Cancel", value: "cancel" },
];

/**
 * Regenerate-style options (label and value)
 */
export const STYLES: { label: string; value: RegenerateStyle }[] = [
  { label: "Same style", value: "same" },
  { label: "More detailed", value: "detailed" },
  { label: "More concise", value: "minimal" },
  { label: "Retry with premium model", value: "premium" },
  { label: "Custom instruction...", value: "custom" },
];
