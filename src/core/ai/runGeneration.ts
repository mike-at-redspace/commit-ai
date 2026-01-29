import type { Config, CommitContext, GeneratedMessage, GenerateProgressPhase } from "@core/config";
import type { CommitGenerator } from "./ai.js";

/**
 * Options for runGenerateMessage. Diff is the (possibly pre-truncated) content to send.
 */
export interface RunGenerateMessageOptions {
  /** Optional output of `git diff --staged --stat` */
  diffStat?: string;
  /** Callback for each streamed chunk */
  onChunk?: (chunk: string) => void;
  /** Callback for progress phase changes */
  onProgress?: (phase: GenerateProgressPhase) => void;
  /** Optional model override (e.g. premium) */
  modelOverride?: string;
  /** When true, diff is already truncated; pass through to buildUserPrompt so getSmartDiff is not run again */
  alreadyTruncated?: boolean;
  /** When alreadyTruncated is true, whether the diff was truncated (for prompt note) */
  wasTruncated?: boolean;
}

/**
 * Single core generation path: runs generator.generate with optional callbacks.
 * Use from both non-interactive (stdout) and interactive (React state) flows.
 * @param generator - CommitGenerator instance
 * @param diff - Staged diff content (or pre-truncated content when alreadyTruncated)
 * @param config - Generation config
 * @param context - Branch and recent commits
 * @param options - Optional callbacks and diff options
 * @returns The generated commit message
 */
export async function runGenerateMessage(
  generator: CommitGenerator,
  diff: string,
  config: Config,
  context: CommitContext,
  options: RunGenerateMessageOptions = {}
): Promise<GeneratedMessage> {
  const { diffStat, onChunk, onProgress, modelOverride, alreadyTruncated, wasTruncated } = options;

  const promptOptions =
    alreadyTruncated === true
      ? { alreadyTruncated: true as const, wasTruncated: wasTruncated ?? false }
      : undefined;

  return generator.generate(
    diff,
    config,
    context,
    undefined,
    onChunk,
    onProgress,
    modelOverride,
    diffStat,
    promptOptions
  );
}
