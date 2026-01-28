import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Config } from "./types.js";
import { CONFIG_FILENAME, MAX_SUBJECT_LENGTH } from "./constants.js";

/**
 * Default configuration values
 * Local and home directory configs override these values
 * Environment variable COMMIT_AI_MODEL overrides model setting
 */
const DEFAULT_CONFIG: Config = {
  model: "claude-3-5-haiku",
  conventionalCommit: true,
  includeScope: true,
  includeEmoji: false,
  maxSubjectLength: MAX_SUBJECT_LENGTH,
  verbosity: "normal",
};

/**
 * Resolves the first available config file path
 * Priority: project root > home directory > none
 */
function resolveConfigPath(): string | null {
  const paths = [
    join(process.cwd(), CONFIG_FILENAME),
    join(homedir(), CONFIG_FILENAME),
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Validates configuration object and returns list of warnings
 */
function validateConfig(config: Partial<Config>): string[] {
  const warnings: string[] = [];

  if (config.maxSubjectLength !== undefined && config.maxSubjectLength < 20) {
    warnings.push("maxSubjectLength is unusually short (< 20 characters)");
  }

  if (
    config.verbosity &&
    !["minimal", "normal", "detailed"].includes(config.verbosity)
  ) {
    warnings.push(`Invalid verbosity: ${config.verbosity}`);
  }

  return warnings;
}

/**
 * Loads configuration from files and environment variables
 * Merges in priority order: defaults < file config < env vars
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
        console.warn(`Failed to parse config at ${configPath}`);
      }
    }
  }

  if (process.env.COMMIT_AI_MODEL) {
    fileConfig.model = process.env.COMMIT_AI_MODEL;
  }

  return { ...DEFAULT_CONFIG, ...fileConfig };
}

/**
 * Returns a JSON template for creating a config file
 */
export function getConfigTemplate(): string {
  return JSON.stringify(
    {
      model: "grok-code-fast-1",
      conventionalCommit: true,
      includeScope: true,
      includeEmoji: false,
      maxSubjectLength: MAX_SUBJECT_LENGTH,
      verbosity: "normal",
    },
    null,
    2,
  );
}
