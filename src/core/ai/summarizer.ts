import type { CopilotClient } from "@github/copilot-sdk";
import type { Config } from "@core/config";
import { COPILOT_SESSION_TIMEOUT } from "@core/config";

/**
 * System prompt for summarizing a large git diff so a follow-up step can write a conventional commit.
 * Preserves intent, scope, file paths, and key changes; omits line-by-line detail.
 */
export function getSummarizerSystemPrompt(maxChars: number): string {
  return `You are summarizing a git diff so that a follow-up step can write a conventional commit message.

Your summary will be the only diff-like input the commit message generator sees. Preserve:
1. Intent and purpose of the change (why, not just what)
2. Scope/area (e.g. auth, api, components)
3. File paths and high-level change types (added, removed, refactored, fixed)
4. Key behavioral or API changes that matter for the commit message

Omit: full line-by-line hunks, redundant context, trivial formatting.

Output ONLY a concise summary, under ${maxChars} characters. No preamble, no "Here is a summary", no meta-commentary.`;
}

/**
 * Runs a one-off Copilot session to summarize a (sanitized + collapsed) full diff.
 * Used when getSmartDiff truncated; the summary is then passed to the commit message generator.
 * @param client - Copilot client
 * @param diff - Full prepared diff (sanitize + collapse, no truncation)
 * @param config - Config (model, etc.)
 * @returns Summary string, or throws on failure
 */
export async function summarizeDiff(
  client: CopilotClient,
  diff: string,
  config: Config,
  maxSummaryChars: number
): Promise<string> {
  const session = await client.createSession({
    model: config.model,
    streaming: true,
    systemMessage: {
      mode: "replace",
      content: getSummarizerSystemPrompt(maxSummaryChars),
    },
  });

  let fullRawMessage = "";
  const done = new Promise<void>((resolve, _reject) => {
    session.on((event: { type: string; data?: unknown }) => {
      const data = event.data as { deltaContent?: string; content?: string } | undefined;
      if (event.type === "assistant.message_delta" && data?.deltaContent) {
        fullRawMessage += data.deltaContent;
      } else if (event.type === "assistant.message" && data?.content && !fullRawMessage) {
        fullRawMessage = data.content;
      } else if (event.type === "session.idle") {
        resolve();
      }
    });
  });

  await session.send({ prompt: `Summarize this git diff:\n\n${diff}` });
  await Promise.race([
    done,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Summarizer session timeout")), COPILOT_SESSION_TIMEOUT)
    ),
  ]);

  await session.destroy();

  const summary = fullRawMessage.trim();
  if (!summary) {
    throw new Error("Summarizer returned empty response");
  }
  return summary.length > maxSummaryChars ? summary.slice(0, maxSummaryChars) : summary;
}
