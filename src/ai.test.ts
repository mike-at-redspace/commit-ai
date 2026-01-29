import { describe, it, expect, vi } from "vitest";
import { parseCommitMessage, CommitGenerator } from "./ai.js";
import type { Config } from "./types.js";
import { MAX_SUBJECT_LENGTH } from "./constants.js";

const defaultConfig: Config = {
  model: "grok-code-fast-1",
  conventionalCommit: true,
  includeScope: true,
  includeEmoji: false,
  maxSubjectLength: MAX_SUBJECT_LENGTH,
  verbosity: "normal",
};

describe("parseCommitMessage", () => {
  it("parses conventional subject with scope and body", () => {
    const raw = "feat(auth): add OAuth2 login\n\n- Google provider\n- Session handling";
    const result = parseCommitMessage(raw, defaultConfig);
    expect(result.type).toBe("feat");
    expect(result.scope).toBe("auth");
    expect(result.subject).toBe("feat(auth): add OAuth2 login");
    expect(result.body).toBe("- Google provider\n- Session handling");
    expect(result.fullMessage).toContain("feat(auth): add OAuth2 login");
    expect(result.fullMessage).toContain("- Google provider");
  });

  it("parses conventional subject without scope", () => {
    const raw = "fix: prevent race condition in session refresh";
    const result = parseCommitMessage(raw, defaultConfig);
    expect(result.type).toBe("fix");
    expect(result.scope).toBeUndefined();
    expect(result.subject).toBe("fix: prevent race condition in session refresh");
    expect(result.body).toBeUndefined();
  });

  it("strips markdown code fences", () => {
    const raw = "```\nfeat(api): add endpoint\n```";
    const result = parseCommitMessage(raw, defaultConfig);
    expect(result.subject).toBe("feat(api): add endpoint");
  });

  it("strips markdown code fences with language tag", () => {
    const raw = "```text\nchore: bump deps\n```";
    const result = parseCommitMessage(raw, defaultConfig);
    expect(result.subject).toBe("chore: bump deps");
  });

  it("respects includeEmoji when conventional", () => {
    const configWithEmoji: Config = { ...defaultConfig, includeEmoji: true };
    const raw = "feat(button): add click handler";
    const result = parseCommitMessage(raw, configWithEmoji);
    expect(result.subject).toContain("✨");
    expect(result.subject).toContain("feat(button): add click handler");
  });

  it("respects includeScope: false", () => {
    const configNoScope: Config = { ...defaultConfig, includeScope: false };
    const raw = "refactor(hooks): extract useAuth";
    const result = parseCommitMessage(raw, configNoScope);
    expect(result.subject).toBe("refactor: extract useAuth");
  });

  it("respects conventionalCommit: false (plain subject)", () => {
    const configPlain: Config = { ...defaultConfig, conventionalCommit: false };
    const raw = "feat(api): add new endpoint";
    const result = parseCommitMessage(raw, configPlain);
    expect(result.subject).toBe("feat(api): add new endpoint");
  });

  it("adds default emoji for non-conventional when includeEmoji true", () => {
    const configPlain: Config = { ...defaultConfig, conventionalCommit: false, includeEmoji: true };
    const raw = "Just a plain message";
    const result = parseCommitMessage(raw, configPlain);
    expect(result.subject).toContain("🔧");
    expect(result.subject).toContain("Just a plain message");
  });

  it("truncates subject at maxSubjectLength", () => {
    const shortMax = 30;
    const configShort: Config = { ...defaultConfig, maxSubjectLength: shortMax };
    const raw = "feat(very-long-scope): this is a very long subject line that should be cut";
    const result = parseCommitMessage(raw, configShort);
    expect(result.subject.length).toBe(shortMax);
    expect(result.subject.endsWith("...")).toBe(true);
  });

  it("throws on empty message", () => {
    expect(() => parseCommitMessage("", defaultConfig)).toThrow(
      "Generated commit message is empty"
    );
  });

  it("throws on only whitespace after trim", () => {
    expect(() => parseCommitMessage("   \n\n  ", defaultConfig)).toThrow(
      "Generated commit message is empty"
    );
  });

  it("handles non-conventional subject (no type: prefix)", () => {
    const configPlain: Config = { ...defaultConfig, conventionalCommit: false };
    const raw = "Updated README with setup instructions";
    const result = parseCommitMessage(raw, configPlain);
    expect(result.subject).toBe("Updated README with setup instructions");
    expect(result.type).toBe("chore");
  });
});

describe("CommitGenerator", () => {
  it("uses modelOverride for one-off session when provided", async () => {
    let createSessionModel: string | undefined;
    const mockSession = {
      on: vi.fn((handler: (event: { type: string; data?: unknown }) => void) => {
        setTimeout(() => {
          handler({ type: "assistant.message_delta", data: { deltaContent: "feat: add login\n" } });
          handler({ type: "session.idle" });
        }, 0);
      }),
      send: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const mockClient = {
      createSession: vi.fn(async (opts: { model: string }) => {
        createSessionModel = opts.model;
        return mockSession;
      }),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    const generator = new CommitGenerator(mockClient as unknown as import("@github/copilot-sdk").CopilotClient);
    await generator.generate(
      "diff",
      defaultConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      "sonnet-3.5"
    );

    expect(mockClient.createSession).toHaveBeenCalledTimes(1);
    expect(createSessionModel).toBe("sonnet-3.5");
    expect(mockSession.destroy).toHaveBeenCalled();
  });
});
