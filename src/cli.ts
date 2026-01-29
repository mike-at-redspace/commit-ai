#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { CopilotClient } from "@github/copilot-sdk";
import { loadConfig, getConfigTemplate } from "@core/config";
import {
  isGitRepository,
  getGitDiff,
  getSmartDiff,
  stageAllChanges,
  commit,
  getRecentCommits,
  getCurrentBranch,
} from "@core/git";
import { CommitGenerator, getEffectiveDiffLimit, runGenerateMessage } from "@core/ai";
import type { Config, CommitContext, GenerateProgressPhase } from "@core/config";
import { PROGRESS_STEP_LABELS, VERSION, INITIAL_PROGRESS_PHASE } from "@core/config";

/** Options from commander (subset we use for overrides and flow). */
interface CliOptions {
  init?: boolean;
  style?: string;
  elevationThreshold?: string;
  importCollapse?: boolean;
  model?: string;
  maxDiffLength?: string;
  maxDiffTokens?: string;
  all?: boolean;
  verbose?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  explain?: boolean;
}

/**
 * Validates that the current directory is a git repository; exits with an error message if not.
 * @returns Promise that resolves when valid, or never (process exits) when invalid
 */
async function validateGitRepo(): Promise<void> {
  const inside = await isGitRepository();
  if (!inside) {
    console.error(chalk.red("Error: Not a git repository"));
    process.exit(1);
  }
}

/**
 * Maps a progress phase key to a user-facing label for error context (e.g. "Stopped after X").
 * @param step - Progress phase key (e.g. "session", "sending", "streaming")
 * @returns User-facing label string
 */
function progressStepToLabel(step: string): string {
  return PROGRESS_STEP_LABELS[step] ?? "generating message";
}

/**
 * Logs an error to stderr (Error message or generic text). Used before process exit.
 * @param error - Caught value (Error instance or other)
 */
function reportError(error: unknown): void {
  if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
  } else {
    console.error(chalk.red("An unexpected error occurred"));
  }
}

/**
 * Fetches branch name and recent commit messages for AI context.
 * @returns CommitContext with recentCommits and branch
 */
async function gatherContext(): Promise<CommitContext> {
  const context: CommitContext = {
    recentCommits: await getRecentCommits(),
    branch: await getCurrentBranch(),
  };
  return context;
}

/**
 * Non-interactive generation for --yes and --dry-run modes.
 * Uses runGenerateMessage with stdout callbacks; diff is expected to be pre-truncated.
 */
async function generateMessageNonInteractive(
  generator: CommitGenerator,
  diff: string,
  config: Config,
  context: CommitContext,
  progressRef: { current: string },
  diffStat?: string,
  alreadyTruncated?: boolean,
  wasTruncated?: boolean
): Promise<Awaited<ReturnType<typeof runGenerateMessage>>> {
  const message = await runGenerateMessage(generator, diff, config, context, {
    diffStat,
    onChunk: (chunk: string) => process.stdout.write(chunk),
    onProgress: (phase: GenerateProgressPhase) => {
      progressRef.current = phase;
    },
    alreadyTruncated,
    wasTruncated,
  });
  console.log(""); // New line after message
  return message;
}

/**
 * Performs the actual git commit and stops the generator. Logs success or rethrows on failure.
 * @param message - Full commit message to use
 * @param generator - CommitGenerator to stop after commit
 */
async function doCommit(message: string, generator: CommitGenerator): Promise<void> {
  try {
    await commit(message);
    console.log(chalk.green("✓ Committed successfully"));
  } catch (error) {
    console.error(chalk.red("✕ Commit failed"));
    throw error;
  } finally {
    await generator.stop();
  }
}

/**
 * Applies CLI option overrides to config. Exits with an error message on invalid values.
 */
function applyOptionOverrides(options: CliOptions, config: Config): void {
  if (options.style) {
    if (!["detailed", "minimal"].includes(options.style)) {
      console.error(chalk.red("Invalid style. Must be 'detailed' or 'minimal'"));
      process.exit(1);
    }
    config.verbosity = options.style as Config["verbosity"];
  }
  if (options.elevationThreshold !== undefined) {
    const n = Number(options.elevationThreshold);
    if (Number.isNaN(n) || n < 0 || n > 1) {
      console.error(chalk.red("Invalid elevation-threshold. Must be a number between 0 and 1."));
      process.exit(1);
    }
    config.elevationThreshold = n;
  }
  if (options.importCollapse === false) {
    config.importCollapse = false;
  }
  if (options.model !== undefined) {
    config.model = String(options.model).trim();
    if (!config.model) {
      console.error(chalk.red("Invalid model. Must be a non-empty string."));
      process.exit(1);
    }
  }
  if (options.maxDiffLength !== undefined) {
    const n = Number(options.maxDiffLength);
    if (Number.isNaN(n) || n < 1) {
      console.error(chalk.red("Invalid max-diff-length. Must be a positive number."));
      process.exit(1);
    }
    config.maxDiffLength = n;
  }
  if (options.maxDiffTokens !== undefined) {
    const n = Number(options.maxDiffTokens);
    if (Number.isNaN(n) || n < 1) {
      console.error(chalk.red("Invalid max-diff-tokens. Must be a positive number."));
      process.exit(1);
    }
    config.maxDiffTokens = n;
  }
}

/**
 * Stages changes if requested, loads diff and context, and computes truncated diff. Exits when no staged changes.
 */
async function prepareDiffAndContext(
  config: Config,
  options: Pick<CliOptions, "all" | "verbose">
): Promise<{
  diff: Awaited<ReturnType<typeof getGitDiff>>;
  context: CommitContext;
  truncatedDiff: string;
  wasTruncated: boolean;
}> {
  if (options.all) {
    await stageAllChanges();
    if (options.verbose) {
      console.log(chalk.gray("Staged all changes"));
    }
  }

  const diff = await getGitDiff({ ignoreWhitespace: config.ignoreWhitespaceInDiff });

  if (!diff.staged || diff.stagedFiles.length === 0) {
    console.log(chalk.yellow("No staged changes found."));
    console.log(chalk.gray("Stage changes with: git add <files>"));
    console.log(chalk.gray("Or use: commit-ai --all to stage and commit all changes"));
    process.exit(0);
  }

  const context = await gatherContext();
  const effectiveLimit = getEffectiveDiffLimit(config);
  const { content: truncatedDiff, wasTruncated } = getSmartDiff(
    diff.staged,
    diff.stat,
    config,
    effectiveLimit
  );

  return { diff, context, truncatedDiff, wasTruncated };
}

/**
 * Main CLI entry point: parses options, validates repo, loads config, and runs interactive or non-interactive flow.
 */
async function main(): Promise<void> {
  program
    .name("commit-ai")
    .description("AI-powered commit message generator using GitHub Copilot")
    .version(VERSION)
    .option("-a, --all", "Stage all changes before generating message")
    .option("-d, --dry-run", "Generate message without committing")
    .option("-e, --explain", "Show files being committed")
    .option("-v, --verbose", "Show verbose output")
    .option("-y, --yes", "Automatically commit with generated message without prompting")
    .option("-s, --style <style>", "Set message style: detailed or minimal")
    .option(
      "--elevation-threshold <n>",
      "Elevate low-priority files when fraction of changed lines in them exceeds this (0–1, default 0.8)"
    )
    .option("--no-import-collapse", "Disable collapsing of import lines in diffs")
    .option("--model <name>", "Override Copilot model (e.g. grok-code-fast-1)")
    .option(
      "--max-diff-length <n>",
      "Max diff length in characters before truncation (default from config)"
    )
    .option(
      "--max-diff-tokens <n>",
      "Max diff size in estimated tokens; caps diff with char limit derived from this"
    )
    .option("--init", "Show config file template")
    .parse();

  const options = program.opts() as CliOptions;

  if (options.init) {
    console.log(chalk.cyan("Config template for ~/.commit-ai.json:\n"));
    console.log(getConfigTemplate());
    console.log(chalk.gray("\nRequires GitHub Copilot CLI to be installed and authenticated."));
    process.exit(0);
  }

  await validateGitRepo();

  const config = loadConfig();
  applyOptionOverrides(options, config);

  const { diff, context, truncatedDiff, wasTruncated } = await prepareDiffAndContext(
    config,
    options
  );

  if (options.verbose) {
    console.log(chalk.gray(`Files to commit: ${diff.stagedFiles.join(", ")}\n`));
    console.log(
      chalk.gray(
        `Context: branch ${context.branch}, ${context.recentCommits?.length ?? 0} recent commit(s)\n`
      )
    );
  }

  const client = new CopilotClient({ logLevel: "error" });
  const generator = new CommitGenerator(client);
  const progressRef = { current: INITIAL_PROGRESS_PHASE };

  process.on("SIGINT", () => {
    generator.stop().then(() => process.exit(130));
  });

  const isNonInteractive = options.yes || options.dryRun;

  try {
    if (isNonInteractive) {
      try {
        const message = await generateMessageNonInteractive(
          generator,
          truncatedDiff,
          config,
          context,
          progressRef,
          diff.stat,
          true,
          wasTruncated
        );

        if (options.explain) {
          console.log(chalk.cyan("Files changed:"));
          diff.stagedFiles.forEach((file) => {
            console.log(chalk.gray(`  • ${file}`));
          });
          console.log("");
        }

        if (options.dryRun) {
          console.log(chalk.gray("(dry-run mode - no commit created)"));
          await generator.stop();
          process.exit(0);
        }

        if (options.yes) {
          await doCommit(message.fullMessage, generator);
          process.exit(0);
        }
      } catch (error) {
        console.error(chalk.gray(`Stopped after ${progressStepToLabel(progressRef.current)}.`));
        reportError(error);
        await generator.stop();
        process.exit(1);
      }
    } else {
      try {
        const { render } = await import("ink");
        const React = (await import("react")).default;
        const { Dashboard } = await import("@ui/features/dashboard");
        const { ErrorBoundary } = await import("@ui/components/ErrorBoundary");
        const { CommitProvider } = await import("@ui/context/CommitContext");

        const dashboardProps = {
          diff: truncatedDiff,
          diffStat: diff.stat,
          diffTruncated: wasTruncated,
          files: diff.stagedFiles,
          version: VERSION,
          showFiles: Boolean(options.explain),
          progressRef,
          onComplete: () => {
            process.exit(0);
          },
          onError: (error: Error) => {
            generator.stop().then(() => {
              console.error(
                chalk.gray(`Stopped after ${progressStepToLabel(progressRef.current)}.`)
              );
              reportError(error);
              process.exit(1);
            });
          },
        };
        const { waitUntilExit } = render(
          React.createElement(ErrorBoundary, {
            onError: (error: Error) => {
              generator.stop().then(() => {
                console.error(
                  chalk.gray(`Stopped after ${progressStepToLabel(progressRef.current)}.`)
                );
                reportError(error);
                process.exit(1);
              });
            },
            children: React.createElement(CommitProvider, {
              config,
              context,
              generator,
              children: React.createElement(Dashboard, dashboardProps),
            }),
          })
        );

        await waitUntilExit();
      } catch (error) {
        console.error(chalk.gray(`Stopped after ${progressStepToLabel(progressRef.current)}.`));
        reportError(error);
        await generator.stop();
        process.exit(1);
      }
    }
  } finally {
    await generator.stop();
  }
}

main().catch((error: unknown) => {
  reportError(error);
  process.exit(1);
});
