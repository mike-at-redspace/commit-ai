import { CopilotClient } from "@github/copilot-sdk";
import type { Config, GeneratedMessage, CommitContext } from "./types.js";
import { EMOJI_MAP, COPILOT_SESSION_TIMEOUT } from "./constants.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";

/**
 * Parses raw AI output into structured commit message
 * Handles emoji injection, scope formatting, and length limits
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

/** Progress phases reported during generation */
export type GenerateProgressPhase = "session" | "sending" | "streaming";

/**
 * Generates commit messages using a Copilot client.
 * Reuses a single session across generate() calls (e.g. Regenerate); call stop() before exit.
 */
export class CommitGenerator {
  private session: Awaited<ReturnType<CopilotClient["createSession"]>> | null = null;

  constructor(private client: CopilotClient) {}

  /**
   * Generate a commit message from a diff using the configured client.
   * Reuses the same Copilot session on subsequent calls so the system prompt is not resent.
   * When modelOverride is set, uses a one-off session with that model and does not reuse it.
   */
  async generate(
    diff: string,
    config: Config,
    context?: CommitContext,
    customInstruction?: string,
    onChunk?: (chunk: string) => void,
    onProgress?: (phase: GenerateProgressPhase) => void,
    modelOverride?: string
  ): Promise<GeneratedMessage> {
    const prompt = buildUserPrompt(diff, config, context, customInstruction);

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
          const rawMessage = await this.runWithSession(
            tempSession,
            prompt,
            onChunk,
            onProgress
          );
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

      const rawMessage = await this.runWithSession(
        this.session,
        prompt,
        onChunk,
        onProgress
      );
      return parseCommitMessage(rawMessage, config);
    } catch (error) {
      if (this.session) {
        await this.session.destroy();
        this.session = null;
      }
      throw new Error(`Failed to generate commit message: ${(error as Error).message}`);
    }
  }

  private async runWithSession(
    session: Awaited<ReturnType<CopilotClient["createSession"]>>,
    prompt: string,
    onChunk?: (chunk: string) => void,
    onProgress?: (phase: GenerateProgressPhase) => void
  ): Promise<string> {
    let fullRawMessage = "";
    let hasReportedStreaming = false;

    const done = new Promise<void>((resolve, reject) => {
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
   * Stop the Copilot client. Destroys the session if present. Call before process exit.
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
