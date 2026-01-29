import { spawn } from "child_process";
import type { GitDiff } from "./types.js";
import { MAX_GIT_BUFFER_SIZE, DEFAULT_RECENT_COMMITS_COUNT } from "./constants.js";

/** Executor that runs a shell command and returns stdout; used for tests and default spawn. */
export type GitExecutor = (command: string, options?: { input?: string }) => Promise<string>;

let executor: GitExecutor = defaultExecutor;

/**
 * Overrides the git executor (for tests). Call with no args to restore the default.
 * @param fn - Optional executor; omit to restore default (spawns sh -c)
 */
export function setGitExecutor(fn?: GitExecutor): void {
  executor = fn ?? defaultExecutor;
}

/**
 * Runs a shell command and returns stdout; rejects on stderr/exit code or buffer overflow.
 * @param command - Shell command (e.g. "git diff --staged")
 * @param options - Optional input to pipe to stdin
 * @returns Promise resolving to stdout string
 */
function defaultExecutor(command: string, options?: { input?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("sh", ["-c", command], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    const chunks: Buffer[] = [];
    let totalSize = 0;
    let exceeded = false;

    proc.stdout?.on("data", (chunk: Buffer) => {
      if (exceeded) return;
      totalSize += chunk.length;
      if (totalSize > MAX_GIT_BUFFER_SIZE) {
        exceeded = true;
        proc.kill("SIGKILL");
        reject(new Error("Git output exceeded maximum buffer size"));
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr?.on("data", () => {}); // discard stderr for output

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (exceeded) return;
      if (code !== 0) {
        reject(new Error(`Git command failed with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    if (options?.input !== undefined) {
      proc.stdin?.setDefaultEncoding("utf-8");
      proc.stdin?.write(options.input, () => {
        proc.stdin?.end();
      });
    }
  });
}

/**
 * Checks if the current directory is inside a git repository.
 * @returns True if inside a work tree, false otherwise
 */
export async function isGitRepository(): Promise<boolean> {
  try {
    await executor("git rev-parse --is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

export interface GetGitDiffOptions {
  /** When true, use `git diff --staged -w` to ignore whitespace-only changes */
  ignoreWhitespace?: boolean;
}

/**
 * Retrieves staged diff, list of staged file paths, and optional --stat summary.
 * @param options - Optional; ignoreWhitespace uses -w for diff/stat
 * @returns GitDiff with staged, stagedFiles, and optional stat
 */
export async function getGitDiff(options?: GetGitDiffOptions): Promise<GitDiff> {
  const diffFlag = options?.ignoreWhitespace ? "git diff --staged -w" : "git diff --staged";
  const statFlag = options?.ignoreWhitespace
    ? "git diff --staged -w --stat"
    : "git diff --staged --stat";
  const nameFlag = "git diff --staged --name-only -z";

  const [staged, namesOutput, statOutput] = await Promise.all([
    executor(diffFlag),
    executor(nameFlag),
    executor(statFlag).catch(() => ""),
  ]);
  const stagedFiles = namesOutput.trim().split("\0").filter(Boolean);
  const stat = statOutput.trim() || undefined;
  return { staged, stagedFiles, stat };
}

/**
 * Stages all changes in the working directory (git add -A).
 */
export async function stageAllChanges(): Promise<void> {
  await executor("git add -A");
}

/**
 * Creates a commit with the provided message (git commit -F -).
 * @param message - Full commit message (subject + optional body)
 */
export async function commit(message: string): Promise<void> {
  await executor("git commit -F -", { input: message });
}

/**
 * Fetches recent commit messages (oneline) for style reference.
 * @param count - Number of commits to return (default from constants)
 * @returns Array of oneline commit strings; empty on error
 */
export async function getRecentCommits(
  count: number = DEFAULT_RECENT_COMMITS_COUNT
): Promise<string[]> {
  try {
    const output = await executor(`git log --oneline -${count}`);
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Gets the name of the current git branch.
 * @returns Branch name or "unknown" on error
 */
export async function getCurrentBranch(): Promise<string> {
  try {
    const output = await executor("git branch --show-current");
    return output.trim();
  } catch {
    return "unknown";
  }
}
