import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import {
  Header,
  InfoPanel,
  ContentCard,
  ChoiceMenu,
  ProgressBar,
  StyleOptionsMenu,
  InstructionInput,
} from "@ui/layout";
import { useRunOnceOnMount } from "@ui/hooks/useRunOnceOnMount";
import { useTerminalSize } from "@ui/hooks/useTerminalSize";
import type { Config, Action, RegenerateStyle, GenerateProgressPhase } from "@core/config";
import { runGenerateMessage } from "@core/ai";
import { commit } from "@core/git";
import {
  DEFAULT_PREMIUM_MODEL,
  MIN_TERMINAL_COLUMNS,
  MIN_TERMINAL_ROWS,
  STATUS_CANCELLED,
  STATUS_COMMITTING,
} from "@core/config";
import { useCommitContext } from "@ui/context/CommitContext";

interface DashboardProps {
  diff: string;
  /** Output of `git diff --staged --stat` for high-level summary when diff is truncated */
  diffStat?: string;
  /** When true, diff exceeded the limit and was truncated; show premium suggestion */
  diffTruncated?: boolean;
  files: string[];
  version?: string;
  /** When true, show file list in InfoPanel (e.g. --explain) */
  showFiles?: boolean;
  /** Mutable ref updated with current progress phase for CLI error reporting */
  progressRef?: { current: string };
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
 * Config, context, and generator are read from CommitContext (must be wrapped in CommitProvider).
 */
export function Dashboard({
  diff,
  diffStat,
  diffTruncated,
  files,
  version,
  showFiles = false,
  progressRef,
  onComplete,
  onError,
}: DashboardProps) {
  const { config: initialConfig, context, generator } = useCommitContext();
  const [message, setMessage] = useState<string>("");
  const [fullMessage, setFullMessage] = useState<string>("");
  const [phase, setPhase] = useState<GenerateProgressPhase>("session");
  const [viewState, setViewState] = useState<ViewState>("generating");
  const [config, setConfig] = useState<Config>(initialConfig);
  const [customInstruction, setCustomInstruction] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const generationKey = useRef(0);
  const { columns, rows } = useTerminalSize();
  const terminalTooSmall = columns < MIN_TERMINAL_COLUMNS || rows < MIN_TERMINAL_ROWS;
  const contentWidth = Math.max(columns - 4, 1);
  const contentHeight = Math.max(rows - 2, 1);

  useEffect(() => {
    return () => {
      void generator.stop();
    };
  }, [generator]);

  useInput((input) => {
    if (input === "q" || input === "Q") {
      void generator.stop().then(() => onComplete());
    }
  });

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
            if (progressRef) progressRef.current = progressPhase;
            setPhase(progressPhase);
            if (progressPhase === "streaming") {
              setViewState("generating");
            }
          }
        };

        const result = await runGenerateMessage(generator, diff, currentConfig, context, {
          diffStat,
          onChunk,
          onProgress,
          modelOverride,
        });

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
    [diff, diffStat, context, generator, progressRef, onError, diffTruncated]
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

  let progressStatus: string | undefined;
  if (viewState === "committing") progressStatus = STATUS_COMMITTING;
  else if (viewState === "cancelled") progressStatus = STATUS_CANCELLED;

  if (terminalTooSmall) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">
          Terminal too small. Please resize to at least {MIN_TERMINAL_COLUMNS}×{MIN_TERMINAL_ROWS}.
        </Text>
        <Text color="gray">Press q to exit.</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="round" borderColor="green" padding={1} flexDirection="column">
      <Header branch={context.branch || "unknown"} version={version} maxWidth={contentWidth} />
      <InfoPanel files={files} showFiles={showFiles} maxWidth={contentWidth} />
      <ContentCard
        message={message}
        isStreaming={isGenerating && phase === "streaming"}
        maxWidth={contentWidth}
        maxHeight={contentHeight}
      />
      <ProgressBar
        phase={isGenerating ? phase : undefined}
        isGenerating={isGenerating}
        error={error}
        status={progressStatus}
        hint={
          diffTruncated && showMenu
            ? "Diff was truncated. For better results, try 'Retry with premium model'."
            : undefined
        }
        maxWidth={contentWidth}
      />
      {showStyleMenu && <StyleOptionsMenu onSelect={handleStyleSelect} />}
      {showCustomInput && (
        <InstructionInput
          onSubmit={handleCustomInstruction}
          onCancel={handleCancelCustomInstruction}
        />
      )}
      {showMenu && <ChoiceMenu onSelect={handleAction} />}
      <Box marginTop={1}>
        <Text color="gray">Press q to cancel</Text>
      </Box>
    </Box>
  );
}
