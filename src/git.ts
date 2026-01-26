import { execSync } from "child_process";
import type { GitDiff } from "./types.js";
import {
  MAX_GIT_BUFFER_SIZE,
  DEFAULT_RECENT_COMMITS_COUNT,
} from "./constants.js";

/**
 * Executes a git command and returns the output
 */
function execGit(command: string, options?: { input?: string }): string {
  return execSync(command, {
    encoding: "utf-8",
    stdio: options?.input ? ["pipe", "pipe", "pipe"] : "pipe",
    input: options?.input,
    maxBuffer: MAX_GIT_BUFFER_SIZE,
  });
}

/**
 * Checks if the current directory is inside a git repository
 */
export function isGitRepository(): boolean {
  try {
    execGit("git rev-parse --is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves staged changes and list of staged files
 */
export function getGitDiff(): GitDiff {
  const staged = execGit("git diff --staged");
  const stagedFiles = execGit("git diff --staged --name-only")
    .trim()
    .split("\n")
    .filter(Boolean);

  return { staged, stagedFiles };
}

/**
 * Stages all changes in the working directory
 */
export function stageAllChanges(): void {
  execGit("git add -A");
}

/**
 * Creates a commit with the provided message
 */
export function commit(message: string): void {
  execGit("git commit -F -", { input: message });
}

/**
 * Fetches recent commit messages for style reference
 */
export function getRecentCommits(
  count: number = DEFAULT_RECENT_COMMITS_COUNT,
): string[] {
  try {
    const output = execGit(`git log --oneline -${count}`);
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Gets the name of the current git branch
 */
export function getCurrentBranch(): string {
  try {
    return execGit("git branch --show-current").trim();
  } catch {
    return "unknown";
  }
}
