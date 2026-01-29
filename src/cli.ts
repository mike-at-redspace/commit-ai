#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { render } from "ink";
import React from "react";
import { CopilotClient } from "@github/copilot-sdk";
import { loadConfig, getConfigTemplate } from "./config.js";
import {
  isGitRepository,
  getGitDiff,
  stageAllChanges,
  commit,
  getRecentCommits,
  getCurrentBranch,
} from "./git.js";
import { CommitGenerator } from "./ai.js";
import type { Config, CommitContext, GeneratedMessage, GenerateProgressPhase } from "./types.js";
import { Dashboard } from "./ui/Dashboard.js";
import { getEffectiveDiffLimit } from "./prompt.js";
import { PROGRESS_STEP_LABELS, VERSION } from "./constants.js";

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
 * Uses minimal console output instead of Ink UI; writes streamed chunks to stdout.
 * @param generator - CommitGenerator instance
 * @param diff - Staged diff content
 * @param config - Generation config
 * @param context - Branch and recent commits
 * @param progressRef - Mutable ref updated with current progress phase
 * @param diffStat - Optional output of `git diff --staged --stat`
 * @returns The generated commit message
 */
async function generateMessageNonInteractive(
  generator: CommitGenerator,
  diff: string,
  config: Config,
  context: CommitContext,
  progressRef: { current: string },
  diffStat?: string
): Promise<GeneratedMessage> {
  const onChunk = (chunk: string): void => {
    process.stdout.write(chunk);
  };

  const onProgress = (phase: GenerateProgressPhase): void => {
    progressRef.current = phase;
  };

  const message = await generator.generate(
    diff,
    config,
    context,
    undefined,
    onChunk,
    onProgress,
    undefined,
    diffStat
  );
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
    .option("--init", "Show config file template")
    .parse();

  const options = program.opts();

  if (options.init) {
    console.log(chalk.cyan("Config template for ~/.commit-ai.json:\n"));
    console.log(getConfigTemplate());
    console.log(chalk.gray("\nRequires GitHub Copilot CLI to be installed and authenticated."));
    process.exit(0);
  }

  await validateGitRepo();

  const config = loadConfig();

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
  const progressRef = { current: "connecting" };

  // Non-interactive modes: --yes or --dry-run
  const isNonInteractive = options.yes || options.dryRun;

  if (isNonInteractive) {
    try {
      const message = await generateMessageNonInteractive(
        generator,
        diff.staged,
        config,
        context,
        progressRef,
        diff.stat
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
    // Interactive mode: render Ink dashboard
    try {
      const { waitUntilExit } = render(
        React.createElement(Dashboard, {
          diff: diff.staged,
          diffStat: diff.stat,
          diffTruncated: diff.staged.length > getEffectiveDiffLimit(config),
          config,
          context,
          generator,
          files: diff.stagedFiles,
          version: VERSION,
          onComplete: () => {
            process.exit(0);
          },
          onError: (error: Error) => {
            console.error(chalk.gray(`Stopped after ${progressStepToLabel(progressRef.current)}.`));
            reportError(error);
            process.exit(1);
          },
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
}

main().catch((error: unknown) => {
  reportError(error);
  process.exit(1);
});
