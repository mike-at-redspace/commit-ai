import { spawn } from "child_process";
import type { GitDiff } from "./types.js";
import { MAX_GIT_BUFFER_SIZE, DEFAULT_RECENT_COMMITS_COUNT } from "./constants.js";

export type GitExecutor = (command: string, options?: { input?: string }) => Promise<string>;

let executor: GitExecutor = defaultExecutor;

/**
 * Override the git executor (for tests). Call with no args to restore default.
 */
export function setGitExecutor(fn?: GitExecutor): void {
  executor = fn ?? defaultExecutor;
}

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
 * Checks if the current directory is inside a git repository
 */
export async function isGitRepository(): Promise<boolean> {
  try {
    await executor("git rev-parse --is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves staged changes and list of staged files
 */
export async function getGitDiff(): Promise<GitDiff> {
  const [staged, namesOutput] = await Promise.all([
    executor("git diff --staged"),
    executor("git diff --staged --name-only -z"),
  ]);
  const stagedFiles = namesOutput.trim().split("\0").filter(Boolean);
  return { staged, stagedFiles };
}

/**
 * Stages all changes in the working directory
 */
export async function stageAllChanges(): Promise<void> {
  await executor("git add -A");
}

/**
 * Creates a commit with the provided message
 */
export async function commit(message: string): Promise<void> {
  await executor("git commit -F -", { input: message });
}

/**
 * Fetches recent commit messages for style reference
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
 * Gets the name of the current git branch
 */
export async function getCurrentBranch(): Promise<string> {
  try {
    const output = await executor("git branch --show-current");
    return output.trim();
  } catch {
    return "unknown";
  }
}
