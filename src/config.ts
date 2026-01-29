import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Config } from "./types.js";
import {
  CONFIG_FILENAME,
  DEFAULT_COPILOT_MODEL,
  DEFAULT_PREMIUM_MODEL,
  MAX_DIFF_LENGTH,
  MAX_SUBJECT_LENGTH,
} from "./constants.js";

/**
 * Default configuration values
 * Local and home directory configs override these values
 * Environment variable COMMIT_AI_MODEL overrides model setting
 */
const DEFAULT_CONFIG: Config = {
  model: DEFAULT_COPILOT_MODEL,
  premiumModel: DEFAULT_PREMIUM_MODEL,
  conventionalCommit: true,
  includeScope: true,
  includeEmoji: false,
  maxSubjectLength: MAX_SUBJECT_LENGTH,
  verbosity: "normal",
};

/**
 * Resolves the first available config file path.
 * Priority: project root > home directory > none.
 * @returns Path to .commit-ai.json or null if not found
 */
function resolveConfigPath(): string | null {
  const paths = [join(process.cwd(), CONFIG_FILENAME), join(homedir(), CONFIG_FILENAME)];

  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Validates configuration object and returns a list of warning messages (no throw).
 * @param config - Partial config to validate
 * @returns Array of warning strings (empty if valid)
 */
function validateConfig(config: Partial<Config>): string[] {
  const warnings: string[] = [];

  if (config.maxSubjectLength !== undefined && config.maxSubjectLength < 20) {
    warnings.push("maxSubjectLength is unusually short (< 20 characters)");
  }

  if (config.verbosity && !["minimal", "normal", "detailed"].includes(config.verbosity)) {
    warnings.push(`Invalid verbosity: ${config.verbosity}`);
  }

  if (
    config.maxDiffLength !== undefined &&
    (config.maxDiffLength < 0 || config.maxDiffLength > 2 * 1024 * 1024)
  ) {
    warnings.push("maxDiffLength should be between 0 and 2MB");
  }
  if (
    config.maxDiffTokens !== undefined &&
    (config.maxDiffTokens < 0 || config.maxDiffTokens > 500_000)
  ) {
    warnings.push("maxDiffTokens should be between 0 and 500000");
  }

  if (
    config.elevationThreshold !== undefined &&
    (config.elevationThreshold < 0 || config.elevationThreshold > 1)
  ) {
    warnings.push("elevationThreshold should be between 0 and 1");
  }
  if (
    config.elevationMinLines !== undefined &&
    (config.elevationMinLines < 0 || !Number.isInteger(config.elevationMinLines))
  ) {
    warnings.push("elevationMinLines should be a non-negative integer");
  }

  return warnings;
}

/**
 * Loads configuration from files and environment variables.
 * Merges in priority order: defaults &lt; file config &lt; env vars (COMMIT_AI_MODEL).
 * @returns Merged Config object
 */
export function loadConfig(): Config {
  const configPath = resolveConfigPath();
  let fileConfig: Partial<Config> = {};

  if (configPath) {
    try {
      const content = readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(content);

      const warnings = validateConfig(fileConfig);
      if (warnings.length > 0 && process.env.DEBUG) {
        console.warn("Config warnings:", warnings.join(", "));
      }
    } catch (error) {
      if (process.env.DEBUG) {
        console.warn(
          `Failed to parse config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  if (process.env.COMMIT_AI_MODEL) {
    fileConfig.model = process.env.COMMIT_AI_MODEL;
  }

  return { ...DEFAULT_CONFIG, ...fileConfig };
}

/**
 * Returns a JSON template for creating a config file (e.g. for --init).
 * @returns Pretty-printed JSON string
 */
export function getConfigTemplate(): string {
  return JSON.stringify(
    {
      model: DEFAULT_COPILOT_MODEL,
      premiumModel: DEFAULT_PREMIUM_MODEL,
      conventionalCommit: true,
      includeScope: true,
      includeEmoji: false,
      maxSubjectLength: MAX_SUBJECT_LENGTH,
      verbosity: "normal",
      maxDiffLength: MAX_DIFF_LENGTH,
      ignoreWhitespaceInDiff: false,
      preferPremiumForLargeDiffs: false,
      elevationThreshold: 0.8,
      elevationMinLines: 0,
      importCollapse: true,
    },
    null,
    2
  );
}
