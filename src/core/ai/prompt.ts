import type { Config, CommitContext } from "@core/config";
import { MAX_DIFF_LENGTH } from "@core/config";
import { getSmartDiff } from "@core/git";

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
2. Present tense, imperative mood (e.g. "Add feature" not "Added feature") 
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
 * Builds the user prompt with diff, context, and config-specific instructions.
 * When stat is provided, it is prepended so the model sees a high-level summary of changed files.
 * @param diff - Staged diff (may be truncated by getSmartDiff)
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
  const { content, wasTruncated } = getSmartDiff(diff, stat, config, effectiveLimit);

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
