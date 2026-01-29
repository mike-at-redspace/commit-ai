import React, { useState, useCallback, useRef } from "react";
import { Box } from "ink";
import { Header } from "./components/Header.js";
import { ContextPanel } from "./components/ContextPanel.js";
import { MessageCard } from "./components/MessageCard.js";
import { ActionMenu, type Action } from "./components/ActionMenu.js";
import { StatusBar } from "./components/StatusBar.js";
import { StyleMenu, type RegenerateStyle } from "./components/StyleMenu.js";
import { CustomInstructionInput } from "./components/CustomInstructionInput.js";
import { useRunOnceOnMount } from "./hooks/useRunOnceOnMount.js";
import type { Config, CommitContext } from "../types.js";
import type { CommitGenerator, GenerateProgressPhase } from "../ai.js";
import { commit } from "../git.js";
import { DEFAULT_PREMIUM_MODEL, STATUS_CANCELLED, STATUS_COMMITTING } from "../constants.js";

interface CommitDashboardProps {
  diff: string;
  /** Output of `git diff --staged --stat` for high-level summary when diff is truncated */
  diffStat?: string;
  /** When true, diff exceeded the limit and was truncated; show premium suggestion */
  diffTruncated?: boolean;
  config: Config;
  context: CommitContext;
  generator: CommitGenerator;
  files: string[];
  version?: string;
  onComplete: () => void;
  onError: (error: Error) => void;
}

type ViewState =
  | "generating"
  | "ready"
  | "regenerating"
  | "style-selection"
  | "custom-instruction"
  | "committing"
  | "cancelled";

/**
 * Main interactive dashboard: runs initial generation, shows message, style menu, and commit/cancel actions.
 * @param props.diff - Staged diff content
 * @param props.diffStat - Optional output of `git diff --staged --stat`
 * @param props.diffTruncated - When true, diff was truncated; may suggest premium
 * @param props.config - Generation config
 * @param props.context - Branch and recent commits
 * @param props.generator - CommitGenerator instance
 * @param props.files - Staged file paths
 * @param props.version - Optional CLI version
 * @param props.onComplete - Called on successful commit or cancel
 * @param props.onError - Called on generation or commit error
 */
export function CommitDashboard({
  diff,
  diffStat,
  diffTruncated,
  config: initialConfig,
  context,
  generator,
  files,
  version,
  onComplete,
  onError,
}: CommitDashboardProps) {
  const [message, setMessage] = useState<string>("");
  const [fullMessage, setFullMessage] = useState<string>("");
  const [phase, setPhase] = useState<GenerateProgressPhase>("session");
  const [viewState, setViewState] = useState<ViewState>("generating");
  const [config, setConfig] = useState<Config>(initialConfig);
  const [customInstruction, setCustomInstruction] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const generationKey = useRef(0);

  // Generate commit message
  const generateMessage = useCallback(
    async (currentConfig: Config, instruction?: string, modelOverride?: string) => {
      setMessage("");
      setFullMessage("");
      setPhase("session");
      setError(undefined);
      generationKey.current += 1;
      const key = generationKey.current;

      try {
        const onChunk = (chunk: string) => {
          if (key === generationKey.current) {
            setMessage((prev: string) => prev + chunk);
          }
        };

        const onProgress = (progressPhase: GenerateProgressPhase) => {
          if (key === generationKey.current) {
            setPhase(progressPhase);
            if (progressPhase === "streaming") {
              setViewState("generating");
            }
          }
        };

        const result = await generator.generate(
          diff,
          currentConfig,
          context,
          instruction,
          onChunk,
          onProgress,
          modelOverride,
          diffStat
        );

        if (key === generationKey.current) {
          setMessage(result.fullMessage);
          setFullMessage(result.fullMessage);
          setViewState("ready");
        }
      } catch (err) {
        if (key === generationKey.current) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          setViewState("ready");
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    },
    [diff, diffStat, context, generator, onError]
  );

  // Initial generation (use premium when diff was truncated and config says so)
  useRunOnceOnMount(() => {
    const usePremium =
      diffTruncated && (initialConfig.preferPremiumForLargeDiffs ?? false)
        ? (initialConfig.premiumModel ?? DEFAULT_PREMIUM_MODEL)
        : undefined;
    generateMessage(initialConfig, undefined, usePremium);
  });

  // Handle action selection
  const handleAction = useCallback(
    async (action: Action) => {
      switch (action) {
        case "commit":
          setViewState("committing");
          try {
            await commit(fullMessage || message);
            await generator.stop();
            onComplete();
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Commit failed";
            setError(errorMessage);
            setViewState("ready");
            onError(err instanceof Error ? err : new Error("Commit failed"));
          }
          break;

        case "regenerate":
          setViewState("style-selection");
          break;

        case "cancel":
          await generator.stop();
          onComplete();
          break;
      }
    },
    [fullMessage, message, generator, onComplete, onError]
  );

  // Handle style selection
  const handleStyleSelect = useCallback(
    (style: RegenerateStyle) => {
      if (style === "custom") {
        setViewState("custom-instruction");
      } else if (style === "premium") {
        setViewState("regenerating");
        generateMessage(config, undefined, config.premiumModel ?? DEFAULT_PREMIUM_MODEL);
      } else {
        const newConfig = { ...config };
        if (style !== "same") {
          newConfig.verbosity = style as Config["verbosity"];
        }
        setConfig(newConfig);
        setViewState("regenerating");
        // Reuse previous custom instruction when "Same style" is selected
        generateMessage(newConfig, style === "same" ? customInstruction : undefined);
      }
    },
    [config, customInstruction, generateMessage]
  );

  // Handle custom instruction
  const handleCustomInstruction = useCallback(
    (instruction: string) => {
      setCustomInstruction(instruction);
      setViewState("regenerating");
      generateMessage(config, instruction);
    },
    [config, generateMessage]
  );

  // Cancel custom instruction
  const handleCancelCustomInstruction = useCallback(() => {
    setViewState("ready");
  }, []);

  const showMenu = viewState === "ready" && !error && fullMessage;
  const isGenerating = viewState === "generating" || viewState === "regenerating";
  const showStyleMenu = viewState === "style-selection";
  const showCustomInput = viewState === "custom-instruction";

  return (
    <Box borderStyle="round" borderColor="green" padding={1} flexDirection="column">
      <Header branch={context.branch || "unknown"} version={version} />
      <ContextPanel files={files} showFiles={false} />
      <MessageCard message={message} isStreaming={isGenerating && phase === "streaming"} />
      <StatusBar
        phase={isGenerating ? phase : undefined}
        isGenerating={isGenerating}
        error={error}
        status={
          viewState === "committing"
            ? STATUS_COMMITTING
            : viewState === "cancelled"
              ? STATUS_CANCELLED
              : undefined
        }
        hint={
          diffTruncated && showMenu
            ? "Diff was truncated. For better results, try 'Retry with premium model'."
            : undefined
        }
      />
      {showStyleMenu && <StyleMenu onSelect={handleStyleSelect} />}
      {showCustomInput && (
        <CustomInstructionInput
          onSubmit={handleCustomInstruction}
          onCancel={handleCancelCustomInstruction}
        />
      )}
      {showMenu && <ActionMenu onSelect={handleAction} />}
    </Box>
  );
}
