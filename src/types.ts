/**
 * Git diff information including staged changes and file list
 */
export interface GitDiff {
  staged: string;
  stagedFiles: string[];
}

/**
 * Configuration options for commit message generation
 */
export interface Config {
  model: string;
  premiumModel?: string;
  conventionalCommit: boolean;
  includeScope: boolean;
  includeEmoji: boolean;
  maxSubjectLength: number;
  verbosity: "minimal" | "normal" | "detailed";
}

/**
 * Parsed commit message with metadata
 */
export interface GeneratedMessage {
  subject: string;
  body?: string;
  type: string;
  scope?: string;
  fullMessage: string;
}

/**
 * Context information for AI commit message generation
 */
export interface CommitContext {
  recentCommits?: string[];
  branch?: string;
}
