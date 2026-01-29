import { CopilotClient } from "@github/copilot-sdk";
import type { Config, GeneratedMessage, CommitContext, GenerateProgressPhase } from "@core/config";
import { EMOJI_MAP, COPILOT_SESSION_TIMEOUT } from "@core/config";
import { SYSTEM_PROMPT, buildUserPrompt, type BuildUserPromptOptions } from "./prompt.js";

/**
 * Parses raw AI output into a structured commit message.
 * Handles emoji injection, scope formatting, and subject length limits.
 * @param raw - Raw string from the model (may include markdown fences)
 * @param config - Config for conventional/emoji/scope and maxSubjectLength
 * @returns Parsed subject, body, type, scope, and fullMessage
 * @throws Error if the generated message is empty
 */
export function parseCommitMessage(raw: string, config: Config): GeneratedMessage {
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
    if (config.includeEmoji) {
      subject = `${EMOJI_MAP.chore} ${subject}`;
    }
  }

  if (subject.length > config.maxSubjectLength) {
    subject = subject.substring(0, config.maxSubjectLength - 3) + "...";
  }

  const fullMessage = body ? `${subject}\n\n${body}` : subject;

  return { subject, body, type, scope, fullMessage };
}

/**
 * Generates commit messages using a Copilot client.
 * Reuses a single session across generate() calls (e.g. Regenerate); call stop() before exit.
 */
export class CommitGenerator {
  private session: Awaited<ReturnType<CopilotClient["createSession"]>> | null = null;

  /**
   * @param client - CopilotClient instance (e.g. from @github/copilot-sdk)
   */
  constructor(private client: CopilotClient) {}

  /**
   * Generates a commit message from a diff using the configured client.
   * Reuses the same Copilot session on subsequent calls so the system prompt is not resent.
   * When modelOverride is set, uses a one-off session with that model and does not reuse it.
   * When diffStat is provided (e.g. from `git diff --staged --stat`), it is prepended to the prompt for context.
   * @param diff - Staged diff content
   * @param config - Generation config
   * @param context - Optional branch and recent commits
   * @param customInstruction - Optional user instruction for regeneration
   * @param onChunk - Optional callback for each streamed chunk
   * @param onProgress - Optional callback for phase changes
   * @param modelOverride - Optional model id (e.g. premium); uses one-off session
   * @param diffStat - Optional output of `git diff --staged --stat`
   * @param promptOptions - Optional; when alreadyTruncated, diff is used as-is and getSmartDiff is skipped
   * @returns The parsed commit message
   * @throws Error when generation or session fails
   */
  async generate(
    diff: string,
    config: Config,
    context?: CommitContext,
    customInstruction?: string,
    onChunk?: (chunk: string) => void,
    onProgress?: (phase: GenerateProgressPhase) => void,
    modelOverride?: string,
    diffStat?: string,
    promptOptions?: BuildUserPromptOptions
  ): Promise<GeneratedMessage> {
    const prompt = buildUserPrompt(
      diff,
      config,
      context,
      customInstruction,
      diffStat,
      promptOptions
    );

    try {
      if (modelOverride) {
        onProgress?.("session");
        const tempSession = await this.client.createSession({
          model: modelOverride,
          streaming: true,
          systemMessage: {
            mode: "replace",
            content: SYSTEM_PROMPT,
          },
        });
        try {
          const rawMessage = await this.runWithSession(tempSession, prompt, onChunk, onProgress);
          return parseCommitMessage(rawMessage, config);
        } finally {
          await tempSession.destroy();
        }
      }

      if (this.session === null) {
        onProgress?.("session");
        this.session = await this.client.createSession({
          model: config.model,
          streaming: true,
          systemMessage: {
            mode: "replace",
            content: SYSTEM_PROMPT,
          },
        });
      }

      const rawMessage = await this.runWithSession(this.session, prompt, onChunk, onProgress);
      return parseCommitMessage(rawMessage, config);
    } catch (error) {
      if (this.session) {
        await this.session.destroy();
        this.session = null;
      }
      throw new Error(`Failed to generate commit message: ${(error as Error).message}`);
    }
  }

  /**
   * Sends the prompt to the session, streams deltas via onChunk/onProgress, and returns the raw message text.
   * @param session - Active Copilot session
   * @param prompt - User prompt (diff + context)
   * @param onChunk - Optional callback for each streamed delta
   * @param onProgress - Optional callback for phase (e.g. "streaming")
   * @returns Raw assistant message text
   * @throws Error on session timeout or empty response
   */
  private async runWithSession(
    session: Awaited<ReturnType<CopilotClient["createSession"]>>,
    prompt: string,
    onChunk?: (chunk: string) => void,
    onProgress?: (phase: GenerateProgressPhase) => void
  ): Promise<string> {
    let fullRawMessage = "";
    let hasReportedStreaming = false;

    const done = new Promise<void>((resolve, _reject) => {
      session.on((event: { type: string; data?: unknown }) => {
        const data = event.data as { deltaContent?: string; content?: string } | undefined;
        if (event.type === "assistant.message_delta" && data?.deltaContent) {
          if (!hasReportedStreaming) {
            hasReportedStreaming = true;
            onProgress?.("streaming");
          }
          const chunk = data.deltaContent;
          fullRawMessage += chunk;
          onChunk?.(chunk);
        } else if (event.type === "assistant.message" && data?.content) {
          if (!fullRawMessage) {
            fullRawMessage = data.content;
          }
        } else if (event.type === "session.idle") {
          resolve();
        }
      });
    });

    onProgress?.("sending");
    await session.send({ prompt });
    await Promise.race([
      done,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Session timeout")), COPILOT_SESSION_TIMEOUT)
      ),
    ]);

    const rawMessage = fullRawMessage.trim();
    if (!rawMessage) {
      throw new Error("No response received from Copilot");
    }
    return rawMessage;
  }

  /**
   * Stops the Copilot client and destroys the session if present. Call before process exit.
   */
  async stop(): Promise<void> {
    try {
      if (this.session) {
        await this.session.destroy();
        this.session = null;
      }
      await Promise.race([
        this.client.stop(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Stop timeout")), 1000)),
      ]);
    } catch {
      // Ignore errors during stop
    }
  }
}
