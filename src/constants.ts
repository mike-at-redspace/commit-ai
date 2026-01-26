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
