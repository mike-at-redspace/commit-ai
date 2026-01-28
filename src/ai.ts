import { CopilotClient } from "@github/copilot-sdk";
import type { Config, GeneratedMessage, CommitContext } from "./types.js";
import {
  EMOJI_MAP,
  MAX_DIFF_LENGTH,
  COPILOT_SESSION_TIMEOUT,
} from "./constants.js";

/**
 * System prompt that guides the AI to write killer commit messages
 *
 * Think of this as the AI's personality blueprint - we're teaching it to write
 * commits the way a senior dev would: focused on the "why", not just the "what".
 *
 * The prompt emphasizes intent over mechanics because nobody wants to read
 * "changed line 42" when what they really need to know is "fixed race condition
 * in user auth flow". We're also teaching it conventional commits because
 * standardized formats make everyone's life easier when you're spelunking
 * through git history at 2am trying to find when that bug was introduced.
 */
const SYSTEM_PROMPT = `You're a senior developer who writes crystal-clear commit messages that actually help your teammates.

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

CRITICAL: Output ONLY the commit message. No markdown, no explanations, no fluff.`;

let client: CopilotClient | null = null;

/**
 * Stops the Copilot client if active (for final cleanup)
 * Call this before your process exits to avoid hanging connections
 */
export async function stopClient(): Promise<void> {
  if (client) {
    try {
      await Promise.race([
        client.stop(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Stop timeout")), 1000)
        ),
      ]);
    } catch (error) {
      // Ignore errors during stop (timeout or actual error)
    } finally {
      client = null;
    }
  }
}

/**
 * Truncates large diffs to avoid hitting token limits
 * Returns truncated content and whether truncation occurred
 */
function truncateDiff(diff: string): {
  content: string;
  wasTruncated: boolean;
} {
  if (diff.length <= MAX_DIFF_LENGTH) {
    return { content: diff, wasTruncated: false };
  }

  // Truncate intelligently: try to keep complete hunks
  const lines = diff.split("\n");
  let truncatedLines: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    if (currentLength + line.length + 1 > MAX_DIFF_LENGTH) {
      break;
    }
    truncatedLines.push(line);
    currentLength += line.length + 1; // +1 for newline
  }

  return {
    content: truncatedLines.join("\n"),
    wasTruncated: true,
  };
}

/**
 * Builds the user prompt with diff, context, and config-specific instructions
 */
function buildPrompt(
  diff: string,
  config: Config,
  context?: CommitContext,
): string {
  const { content, wasTruncated } = truncateDiff(diff);

  let prompt = `Analyze this git diff and generate a commit message:\n\n${content}`;

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
      "Do NOT use conventional commit prefixes (feat:, fix:, etc.) - use plain descriptive subjects",
    );
  }
  if (!config.includeScope) {
    configInstructions.push("Do NOT include a scope in parentheses");
  }
  if (config.verbosity === "minimal") {
    configInstructions.push("Keep it very brief - subject line only, no body");
  } else if (config.verbosity === "detailed") {
    configInstructions.push(
      "Include a detailed body explaining the changes, rationale, and impact",
    );
  }

  if (configInstructions.length) {
    prompt += `\n\nAdditional requirements:\n${configInstructions.map((i) => `- ${i}`).join("\n")}`;
  }

  return prompt;
}

/**
 * Parses raw AI output into structured commit message
 * Handles emoji injection, scope formatting, and length limits
 * Respects config for conventional commits and features
 */
function parseCommitMessage(raw: string, config: Config): GeneratedMessage {
  const cleaned = raw
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/```$/gm, "")
    .trim();

  const lines = cleaned.split("\n").filter((line) => line.trim());
  let subject = lines[0] || "";
  const bodyLines = lines.slice(1).filter((line) => line.trim());
  const body = bodyLines.length > 0 ? bodyLines.join("\n") : undefined;

  if (!subject) {
    throw new Error("Generated commit message is empty");
  }

  const conventionalMatch = subject.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);
  let type = "chore";
  let scope: string | undefined;
  let description = subject;

  if (conventionalMatch) {
    type = conventionalMatch[1];
    scope = conventionalMatch[2];
    description = conventionalMatch[3];
  }

  if (config.conventionalCommit) {
    subject = type;
    if (config.includeEmoji && EMOJI_MAP[type]) {
      subject = `${EMOJI_MAP[type]} ${subject}`;
    }
    if (config.includeScope && scope) {
      subject += `(${scope})`;
    }
    subject += `: ${description}`;
  } else {
    // For non-conventional, use as-is, optionally add default emoji if configured
    if (config.includeEmoji) {
      subject = `${EMOJI_MAP.chore} ${subject}`; // Default to chore emoji
    }
  }

  if (subject.length > config.maxSubjectLength) {
    subject = subject.substring(0, config.maxSubjectLength - 3) + "...";
  }

  const fullMessage = body ? `${subject}\n\n${body}` : subject;

  return { subject, body, type, scope, fullMessage };
}

/**
 * Generates a commit message using GitHub Copilot
 *
 * Takes your messy git diff and turns it into a beautiful, conventional commit
 * message. Uses recent commits and branch name for context so the AI can match
 * your team's style. Respects all your config preferences for emoji, scope, etc.
 *
 * Pro tip: The more context you provide (recent commits, clear branch names),
 * the better the AI performs. "feat/user-auth" gives better results than "asdf".
 *
 * Uses a shared client instance for efficiency across multiple generations
 * (e.g., during regenerates), but creates fresh sessions each time.
 */
export async function generateCommitMessage(
  diff: string,
  config: Config,
  context?: CommitContext,
): Promise<GeneratedMessage> {
  if (!client) {
    client = new CopilotClient({ logLevel: "error" });
  }

  const prompt = buildPrompt(diff, config, context);

  let session;
  try {
    session = await client.createSession({
      model: config.model,
      systemMessage: {
        mode: "replace",
        content: SYSTEM_PROMPT,
      },
    });

    const response = await session.sendAndWait(
      { prompt },
      COPILOT_SESSION_TIMEOUT,
    );

    const rawMessage = response?.data?.content?.trim();
    if (!rawMessage) {
      throw new Error("No response received from Copilot");
    }

    return parseCommitMessage(rawMessage, config);
  } catch (error) {
    throw new Error(
      `Failed to generate commit message: ${(error as Error).message}`,
    );
  } finally {
    if (session) {
      await session.destroy();
    }
  }
}
