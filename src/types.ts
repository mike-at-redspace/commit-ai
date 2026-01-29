/**
 * Git diff information including staged changes, file list, and optional stat.
 */
export interface GitDiff {
  /** Raw staged diff content */
  staged: string;
  /** List of staged file paths */
  stagedFiles: string[];
  /** Output of `git diff --staged --stat` for high-level summary when diff is truncated */
  stat?: string;
}

/**
 * Configuration options for commit message generation.
 */
export interface Config {
  /** Copilot model name (e.g. grok-code-fast-1) */
  model: string;
  /** Premium model for "Retry with premium model" (e.g. sonnet-3.5) */
  premiumModel?: string;
  /** Use conventional commit format (type(scope): subject) */
  conventionalCommit: boolean;
  /** Include scope in conventional commits */
  includeScope: boolean;
  /** Include emoji prefix when conventional */
  includeEmoji: boolean;
  /** Max subject line length in characters */
  maxSubjectLength: number;
  /** Message verbosity: minimal (subject only), normal, or detailed */
  verbosity: "minimal" | "normal" | "detailed";
  /** Max diff length in characters; uses default (8000) when unset */
  maxDiffLength?: number;
  /** Max diff size in tokens (approximated from chars); when set, caps diff so estimated tokens stay under this */
  maxDiffTokens?: number;
  /** When true, run `git diff --staged -w` to ignore whitespace changes */
  ignoreWhitespaceInDiff?: boolean;
  /** When true, use premium model for first generation when diff is truncated or over limit */
  preferPremiumForLargeDiffs?: boolean;
  /** Elevate low-priority files when this fraction of changed lines is in tier 0–1 (default 0.8) */
  elevationThreshold?: number;
  /** Only consider elevation when total changed lines is at least this (optional) */
  elevationMinLines?: number;
  /** Optional map of language id to import-detection regex string (e.g. python, rust, go) */
  languageImportPatterns?: Record<string, string>;
  /** When true (default), collapse consecutive import lines in diffs to save tokens */
  importCollapse?: boolean;
}

/**
 * Parsed commit message with metadata.
 */
export interface GeneratedMessage {
  /** Subject line (first line) */
  subject: string;
  /** Optional body (lines after subject) */
  body?: string;
  /** Conventional type (feat, fix, chore, etc.) */
  type: string;
  /** Optional scope from conventional format */
  scope?: string;
  /** Full message (subject + optional body) */
  fullMessage: string;
}

/**
 * Context information for AI commit message generation.
 */
export interface CommitContext {
  /** Recent oneline commit messages for style reference */
  recentCommits?: string[];
  /** Current branch name */
  branch?: string;
}

/** Progress phases reported during generation */
export type GenerateProgressPhase = "session" | "sending" | "streaming";

/** User action when message is ready: commit, regenerate, or cancel */
export type Action = "commit" | "regenerate" | "cancel";

/** Regeneration style: same, detailed, minimal, premium, or custom instruction */
export type RegenerateStyle = "same" | "detailed" | "minimal" | "premium" | "custom";

/** Executor that runs a shell command and returns stdout; used for tests and default spawn. */
export type GitExecutor = (command: string, options?: { input?: string }) => Promise<string>;

/** Options for getGitDiff */
export interface GetGitDiffOptions {
  /** When true, use `git diff --staged -w` to ignore whitespace-only changes */
  ignoreWhitespace?: boolean;
}
