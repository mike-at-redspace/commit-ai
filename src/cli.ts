#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { select, confirm } from "@inquirer/prompts";
import { loadConfig, getConfigTemplate } from "./config.js";
import {
  isGitRepository,
  getGitDiff,
  stageAllChanges,
  commit,
  getRecentCommits,
  getCurrentBranch,
} from "./git.js";
import { generateCommitMessage, stopClient } from "./ai.js";
import type { Config, GeneratedMessage } from "./types.js";

/**
 * Validates that we're in a git repository
 */
function validateGitRepo(): void {
  if (!isGitRepository()) {
    console.error(chalk.red("Error: Not a git repository"));
    process.exit(1);
  }
}

/**
 * Displays a formatted commit message to the console
 */
function displayMessage(message: GeneratedMessage): void {
  console.log("\n" + chalk.cyan("Suggested commit message:") + "\n");
  console.log(chalk.white.bold(message.subject));
  if (message.body) {
    console.log(chalk.gray("\n" + message.body));
  }
  console.log("");
}

/**
 * Displays the list of files being committed
 */
function displayFiles(files: string[]): void {
  console.log(chalk.cyan("Files changed:"));
  files.forEach((file) => {
    console.log(chalk.gray(`  • ${file}`));
  });
  console.log("");
}

/**
 * Performs the actual git commit and handles cleanup
 */
async function doCommit(message: string): Promise<void> {
  const spinner = ora("Committing...").start();
  try {
    commit(message);
    spinner.succeed(chalk.green("Committed successfully!"));
  } catch (error) {
    spinner.fail(chalk.red("Commit failed"));
    throw error;
  } finally {
    await stopClient();
  }
}

/**
 * Interactive prompt loop for commit actions
 * Handles commit, edit, regenerate, and cancel actions
 */
async function handleInteraction(
  currentMessage: string,
  diff: string,
  config: Config,
): Promise<void> {
  const action = await select({
    message: "What would you like to do?",
    choices: [
      { name: "Commit with this message", value: "commit" },
      { name: "Edit message before committing", value: "edit" },
      { name: "Regenerate message", value: "regenerate" },
      { name: "Cancel", value: "cancel" },
    ],
  });

  switch (action) {
    case "commit":
      await doCommit(currentMessage);
      break;

    case "edit":
      const shouldEdit = await confirm({
        message: "Edit the commit message?",
        default: true,
      });

      if (shouldEdit) {
        // For now, just show the message and let user confirm as-is or cancel
        console.log(
          chalk.cyan("\nCurrent message:") + "\n" + chalk.white(currentMessage)
        );
        const editConfirmed = await confirm({
          message: "Proceed with this message?",
          default: true,
        });
        if (editConfirmed) {
          await doCommit(currentMessage);
        } else {
          console.log(chalk.gray("Commit cancelled"));
          await stopClient();
        }
      } else {
        console.log(chalk.gray("Commit cancelled"));
        await stopClient();
      }
      break;

    case "regenerate":
      await handleRegenerate(diff, config);
      break;

    case "cancel":
      console.log(chalk.gray("Commit cancelled"));
      await stopClient();
      break;
  }
}

/**
 * Handles the regenerate flow with style options
 */
async function handleRegenerate(
  diff: string,
  currentConfig: Config,
): Promise<void> {
  const { style } = await inquirer.prompt([
    {
      type: "list",
      name: "style",
      message: "Regenerate with different style?",
      choices: [
        { name: "Same style", value: "same" },
        { name: "More detailed", value: "detailed" },
        { name: "More concise", value: "minimal" },
      ],
    },
  ]);

  const newConfig = { ...currentConfig };
  if (style !== "same") {
    newConfig.verbosity = style as Config["verbosity"];
  }

  const spinner = ora("Regenerating...").start();
  try {
    const context = {
      recentCommits: getRecentCommits(),
      branch: getCurrentBranch(),
    };
    const newMessage = await generateCommitMessage(diff, newConfig, context);
    spinner.stop();

    displayMessage(newMessage);
    await handleInteraction(newMessage.fullMessage, diff, newConfig);
  } catch (error) {
    spinner.fail(chalk.red("Regeneration failed"));
    throw error;
  } finally {
    await stopClient();
  }
}

/**
 * Main CLI entry point
 * Orchestrates the entire commit flow from arg parsing to final commit
 */
async function main() {
  program
    .name("commit-ai")
    .description("AI-powered commit message generator using GitHub Copilot")
    .version("1.0.0")
    .option("-a, --all", "Stage all changes before generating message")
    .option("-d, --dry-run", "Generate message without committing")
    .option("-e, --explain", "Show files being committed")
    .option("-v, --verbose", "Show verbose output")
    .option(
      "-y, --yes",
      "Automatically commit with generated message without prompting",
    )
    .option("-s, --style <style>", "Set message style: detailed or minimal")
    .option("--init", "Show config file template")
    .parse();

  const options = program.opts();

  if (options.init) {
    console.log(chalk.cyan("Config template for ~/.commit-ai.json:\n"));
    console.log(getConfigTemplate());
    console.log(
      chalk.gray(
        "\nRequires GitHub Copilot CLI to be installed and authenticated.",
      ),
    );
    process.exit(0);
  }

  validateGitRepo();

  let config = loadConfig();

  if (options.style) {
    if (!["detailed", "minimal"].includes(options.style)) {
      console.error(
        chalk.red("Invalid style. Must be 'detailed' or 'minimal'"),
      );
      process.exit(1);
    }
    config.verbosity = options.style as Config["verbosity"];
  }

  if (options.all) {
    stageAllChanges();
    console.log(chalk.gray("Staged all changes"));
  }

  const diff = getGitDiff();

  if (!diff.staged || diff.stagedFiles.length === 0) {
    console.log(chalk.yellow("No staged changes found."));
    console.log(chalk.gray("Stage changes with: git add <files>"));
    console.log(
      chalk.gray("Or use: commit-ai --all to stage and commit all changes"),
    );
    process.exit(0);
  }

  if (options.verbose) {
    console.log(chalk.gray(`Files to commit: ${diff.stagedFiles.join(", ")}`));
  }

  const spinner = ora("Analyzing changes with Copilot...").start();

  try {
    const context = {
      recentCommits: getRecentCommits(),
      branch: getCurrentBranch(),
    };

    const message = await generateCommitMessage(diff.staged, config, context);
    spinner.stop();

    displayMessage(message);

    if (options.explain) {
      displayFiles(diff.stagedFiles);
    }

    if (options.dryRun) {
      console.log(chalk.gray("(dry-run mode - no commit created)"));
      await stopClient();
      process.exit(0);
    }

    // Stop the Copilot client before interactive prompts
    await stopClient();

    if (options.yes) {
      await doCommit(message.fullMessage);
    } else {
      await handleInteraction(message.fullMessage, diff.staged, config);
    }

    // Exit cleanly after completing the action
    process.exit(0);
  } catch (error) {
    spinner.stop();
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
    } else {
      console.error(chalk.red("An unexpected error occurred"));
    }
    await stopClient();
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(chalk.red(error.message || "An error occurred"));
  await stopClient();
  process.exit(1);
});
