import type { Config, CommitContext } from "./types.js";
import { MAX_DIFF_LENGTH } from "./constants.js";

/**
 * System prompt that guides the AI to write killer commit messages
 *
 * Think of this as the AI's personality blueprint - we're teaching it to write
 * commits the way a senior dev would: focused on the "why", not just the "what".
 */
export const SYSTEM_PROMPT = `You're a senior developer who writes crystal-clear commit messages that actually help your teammates.

Your mission: analyze git diffs and craft commit messages that tell the story of WHY changes were made, not just WHAT changed.

Core principles:
1. Focus on INTENT - Why did this change happen? What problem does it solve?
2. Present tense, imperative mood (e.g., "Add feature" not "Added feature") 
3. Keep subjects under 72 chars - respect those terminal windows
4. Add a body with bullet points for anything non-trivial

Guidelines:
- Infer scope from file paths (e.g., components/Button.tsx → "button")
- Be specific but concise - every word should earn its place
- Group related changes logically - tell a coherent story
- Use modern web dev context - you know React hooks, API routes, styling libs

Output format (Conventional Commits):
<type>(<scope>): <subject>

<body - optional, use bullet points>

Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build

Real-world examples:
- feat(auth): add OAuth2 login with Google provider
- fix(api): prevent race condition in user session refresh
- refactor(hooks): extract useAuth logic for reusability
- docs(readme): add troubleshooting section for M1 Macs

CRITICAL: Output ONLY the commit message. No markdown, no explanations, no fluff.

When the user message includes "[Note: Diff was truncated]" or similar: the visible diff is incomplete. Rely more on the branch name and recent commits to infer scope and intent, and still produce a coherent conventional commit from the partial changes and context.`;

/** Approximate chars per token for code (conservative) */
const CHARS_PER_TOKEN = 3.5;

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
]);
const DEPRIORITIZED_DIRS = ["dist/", "build/", ".cache/", "out/", "coverage/"];
const PREFERRED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
]);

/**
 * Numeric priority for file-aware diff truncation: 0 = lockfiles/deprioritized dirs, 1 = other, 2 = preferred (source files, package.json, etc.).
 * @param path - File path (e.g. "src/foo.ts" or "package.json")
 * @returns Priority 0, 1, or 2
 */
function pathPriority(path: string): number {
  const base = path.split("/").pop() ?? path;
  if (LOCKFILE_NAMES.has(base)) return 0;
  const lower = path.toLowerCase();
  if (DEPRIORITIZED_DIRS.some((d) => lower.startsWith(d))) return 0;
  if (base === "package.json" || base === "Cargo.toml" || base === "go.mod") return 2;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  if (PREFERRED_EXTENSIONS.has(ext)) return 2;
  return 1;
}

/**
 * Splits a raw git diff into one chunk per file (each chunk starts with "diff --git ").
 * @param diff - Raw git diff string
 * @returns Array of { path, chunk } for each file
 */
function splitDiffIntoFileChunks(diff: string): { path: string; chunk: string }[] {
  const parts = diff.split(/(?=^diff --git )/m).filter(Boolean);
  const chunks: { path: string; chunk: string }[] = [];
  for (const chunk of parts) {
    const match = chunk.match(/^diff --git a\/(.+?) b\//m);
    const path = match ? match[1] : "unknown";
    chunks.push({ path, chunk });
  }
  if (chunks.length === 0 && diff.trim()) {
    chunks.push({ path: "unknown", chunk: diff });
  }
  return chunks;
}

/**
 * Effective diff length limit in characters (min of maxDiffLength and token-based limit).
 * @param config - Config with maxDiffLength and optional maxDiffTokens
 * @returns Character limit for truncation
 */
export function getEffectiveDiffLimit(config: Config): number {
  const charLimit = config.maxDiffLength ?? MAX_DIFF_LENGTH;
  const tokenLimit = config.maxDiffTokens;
  if (tokenLimit === undefined) {
    return charLimit;
  }
  const maxCharsFromTokens = Math.floor(tokenLimit * CHARS_PER_TOKEN);
  return Math.min(charLimit, maxCharsFromTokens);
}

/**
 * Truncates large diffs to avoid hitting token limits.
 * When over limit, uses file-aware truncation: keeps higher-priority files
 * (e.g. source code, package.json) and omits or tail-truncates lower-priority
 * files (lockfiles, dist/, build/).
 * @param diff - Raw git diff string
 * @param effectiveLimit - Max character length
 * @returns Object with content and wasTruncated
 */
function truncateDiff(
  diff: string,
  effectiveLimit: number
): {
  content: string;
  wasTruncated: boolean;
} {
  if (diff.length <= effectiveLimit) {
    return { content: diff, wasTruncated: false };
  }

  const fileChunks = splitDiffIntoFileChunks(diff);
  if (fileChunks.length <= 1) {
    const lines = diff.split("\n");
    const truncatedLines: string[] = [];
    let currentLength = 0;
    for (const line of lines) {
      if (currentLength + line.length + 1 > effectiveLimit) break;
      truncatedLines.push(line);
      currentLength += line.length + 1;
    }
    return {
      content: truncatedLines.join("\n"),
      wasTruncated: true,
    };
  }

  const sorted = [...fileChunks].sort(
    (a, b) =>
      pathPriority(b.path) - pathPriority(a.path) || fileChunks.indexOf(a) - fileChunks.indexOf(b)
  );
  const result: string[] = [];
  let currentLength = 0;

  for (const { path, chunk } of sorted) {
    const chunkLen = chunk.length + (result.length ? 1 : 0);
    if (currentLength + chunkLen <= effectiveLimit) {
      result.push(chunk);
      currentLength += chunkLen;
    } else if (currentLength < effectiveLimit && pathPriority(path) >= 1) {
      const budget = effectiveLimit - currentLength - (result.length ? 1 : 0) - 50;
      if (budget > 100) {
        const lines = chunk.split("\n");
        let tailLength = 0;
        const tailLines: string[] = [];
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (tailLength + line.length + 1 > budget) break;
          tailLines.unshift(line);
          tailLength += line.length + 1;
        }
        const truncatedChunk = lines[0] + "\n...[truncated]...\n" + tailLines.join("\n");
        result.push(truncatedChunk);
        currentLength += truncatedChunk.length + (result.length > 1 ? 1 : 0);
      }
      break;
    }
  }

  const content = result.join("\n");
  return {
    content: content || diff.slice(0, effectiveLimit),
    wasTruncated: true,
  };
}

/**
 * Builds the user prompt with diff, context, and config-specific instructions.
 * When stat is provided, it is prepended so the model sees a high-level summary of changed files.
 * @param diff - Staged diff (may be truncated by getEffectiveDiffLimit/truncateDiff)
 * @param config - Generation config (verbosity, conventional, scope, etc.)
 * @param context - Optional recent commits and branch
 * @param customInstruction - Optional user instruction for regeneration
 * @param stat - Optional output of `git diff --staged --stat`
 * @returns Full user prompt string
 */
export function buildUserPrompt(
  diff: string,
  config: Config,
  context?: CommitContext,
  customInstruction?: string,
  stat?: string
): string {
  const effectiveLimit = getEffectiveDiffLimit(config);
  const { content, wasTruncated } = truncateDiff(diff, effectiveLimit);

  let prompt = "";
  if (stat) {
    prompt += `Summary of changed files (lines added/removed):\n${stat}\n\n`;
  }
  prompt += `Analyze this git diff and generate a commit message:\n\n${content}`;

  if (wasTruncated) {
    prompt +=
      "\n\n[Note: Diff was truncated due to size. Focus on the visible changes and infer overall intent.]";
  }

  if (context?.recentCommits?.length) {
    prompt += `\n\nRecent commits for style reference:\n${context.recentCommits.join("\n")}`;
  }

  if (context?.branch) {
    prompt += `\n\nCurrent branch: ${context.branch} (use this to infer scope or type if relevant)`;
  }

  const configInstructions: string[] = [];

  if (!config.conventionalCommit) {
    configInstructions.push(
      "Do NOT use conventional commit prefixes (feat:, fix:, etc.) - use plain descriptive subjects"
    );
  }
  if (!config.includeScope) {
    configInstructions.push("Do NOT include a scope in parentheses");
  }
  if (config.verbosity === "minimal") {
    configInstructions.push("Keep it very brief - subject line only, no body");
  } else if (config.verbosity === "detailed") {
    configInstructions.push(
      "Include a detailed body explaining the changes, rationale, and impact"
    );
  }

  if (configInstructions.length) {
    prompt += `\n\nAdditional requirements:\n${configInstructions.map((i) => `- ${i}`).join("\n")}`;
  }

  if (customInstruction) {
    prompt += `\n\nUSER INSTRUCTION: ${customInstruction}\n(Prioritize this instruction over other guidelines)`;
  }

  return prompt;
}
