import type { Config } from "./types.js";

/** Conflict marker line prefixes (git merge conflict) */
const CONFLICT_MARKERS = /^(<<<<<<<|=======|>>>>>>>|\|\|\|\|\|\|\|)/;

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
]);
/** Dirs deprioritized for truncation; compared case-insensitively via path.toLowerCase() */
const DEPRIORITIZED_DIRS = ["dist/", "build/", ".cache/", "out/", "coverage/"];
const PREFERRED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".cpp",
  ".c",
  ".h",
  ".rb",
  ".php",
  ".sh",
]);
/** Manifest-like files treated as high priority (tier 2) */
const MANIFEST_BASES = new Set([
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "requirements.txt",
]);

/** Default import-detection regex strings by language (content after + or - in diff line, trimmed) */
const DEFAULT_IMPORT_PATTERNS: Record<string, string> = {
  js: "^(\\s*)(import\\s|export\\s+.*\\s+from\\s+|import\\s*\\()",
  ts: "^(\\s*)(import\\s|export\\s+.*\\s+from\\s+|import\\s+type\\s+|import\\s*\\()",
  python: "^(import\\s|from\\s+.*\\s+import\\s)",
  rust: "^(pub\\s+)?use\\s+",
  go: '^import\\s*\\(|^import\\s+"',
  java: "^import\\s+",
  kt: "^import\\s+",
};

/**
 * Strips conflict marker lines from a raw diff so the rest of the pipeline parses cleanly.
 * If any markers were removed, appends a single note so the model knows.
 * (Markers inside string literals are rare; we trim and test line start to reduce false positives.)
 * @param diff - Raw git diff string
 * @returns Diff with <<<<<<<, =======, >>>>>>>, ||||||| lines removed
 */
export function sanitizeDiff(diff: string): string {
  const lines = diff.split("\n");
  const kept = lines.filter((line) => !CONFLICT_MARKERS.test(line.trim()));
  const removedAny = kept.length < lines.length;
  const result = kept.join("\n");
  return removedAny ? result + "\n[Conflict markers removed from diff.]\n" : result;
}

/**
 * Derives language id from file path for import-pattern lookup.
 * Extensionless / Makefile / YAML etc. fall back to "none" (no import collapse).
 * @param path - File path (e.g. "src/foo.ts" or "lib/bar.py")
 * @returns Language key (js, ts, python, rust, go, java, kt, cpp, rb, php, shell, or "none")
 */
export function getLanguageFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")).toLowerCase() : "";
  const map: Record<string, string> = {
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".ts": "ts",
    ".tsx": "ts",
    ".js": "js",
    ".jsx": "js",
    ".mjs": "js",
    ".cjs": "js",
    ".java": "java",
    ".kt": "kt",
    ".cpp": "cpp",
    ".c": "cpp",
    ".h": "cpp",
    ".rb": "rb",
    ".php": "php",
    ".sh": "shell",
    ".yml": "none",
    ".yaml": "none",
  };
  if (base === "Makefile" || base === "makefile") return "none";
  return map[ext] ?? "js";
}

/** Regex that never matches (used for unknown languages so no line is treated as import) */
const NEVER_MATCH = /(?!)/;

/**
 * Builds the effective import-pattern map from config and defaults.
 * Unknown languages get a never-matching pattern so import collapse is skipped for them.
 * @param config - Config with optional languageImportPatterns
 * @returns Map of language id to RegExp (compiled from config or defaults)
 */
function getImportPatterns(config: Config): Record<string, RegExp> {
  const defaults: Record<string, string> = {
    ...DEFAULT_IMPORT_PATTERNS,
    none: "(?!)",
  } as Record<string, string>;
  const custom = config.languageImportPatterns ?? {};
  const combined: Record<string, RegExp> = {};
  for (const lang of new Set([...Object.keys(defaults), ...Object.keys(custom)])) {
    const pattern = custom[lang] ?? defaults[lang];
    if (pattern) {
      try {
        combined[lang] = new RegExp(pattern);
      } catch {
        combined[lang] = NEVER_MATCH;
      }
    }
  }
  return Object.keys(combined).length > 0
    ? combined
    : { js: new RegExp(DEFAULT_IMPORT_PATTERNS.js) };
}

/**
 * Returns true if a diff line (with leading + or -) is an import line for the given language.
 * Content after the +/- is trimmed so patterns like ^use\s+ match consistently.
 * @param line - Full diff line (e.g. "+import foo" or "-  use std::io;")
 * @param language - Language id from getLanguageFromPath
 * @param patterns - Map of language to compiled RegExp
 */
export function isImportLine(
  line: string,
  language: string,
  patterns: Record<string, RegExp>
): boolean {
  const trimmed = line.trim();
  if ((trimmed.startsWith("+") || trimmed.startsWith("-")) && trimmed.length > 1) {
    const content = trimmed.slice(1).trim();
    const re = patterns[language] ?? patterns["js"] ?? NEVER_MATCH;
    return re.test(content);
  }
  return false;
}

/**
 * Collapses consecutive import lines in a single file chunk to one placeholder line per run.
 * Only processes added/removed lines (+/-); context and hunk headers are left as-is.
 * @param chunk - One file's diff chunk (starts with "diff --git ")
 * @param path - File path for language detection
 * @param config - Config for importCollapse and languageImportPatterns
 * @returns Chunk with import runs replaced by "... N import lines..."
 */
export function collapseImportLines(chunk: string, path: string, config: Config): string {
  if (config.importCollapse === false) return chunk;
  const patterns = getImportPatterns(config);
  const lang = getLanguageFromPath(path);
  const lines = chunk.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isImportLine(line, lang, patterns)) {
      out.push(line);
      i++;
      continue;
    }
    const prefix = line.trimStart().startsWith("+") ? "+" : "-";
    let count = 0;
    while (
      i < lines.length &&
      isImportLine(lines[i], lang, patterns) &&
      (lines[i].trimStart().startsWith("+") ? "+" : "-") === prefix
    ) {
      count++;
      i++;
    }
    out.push(`${prefix} ... ${count} import line${count !== 1 ? "s" : ""} ...`);
  }
  return out.join("\n");
}

/**
 * Parses output of `git diff --staged --stat` into per-file line change counts.
 * Counts '+' and '-' in the stat bar (e.g. " 5 +++--" => added 3, removed 2).
 * If no bars, uses total as added and 0 as removed (legacy stat format).
 * @param stat - Raw stat output (e.g. " path | 2 +-\n file2 | 10 +++---")
 * @returns Map of file path to { added, removed }
 */
export function parseStatForLineCounts(
  stat: string
): Map<string, { added: number; removed: number }> {
  const map = new Map<string, { added: number; removed: number }>();
  const lines = stat.trim().split("\n").filter(Boolean);
  for (const line of lines) {
    if (/^\s*\d+\s+files? changed/.test(line)) continue;
    const pipe = line.indexOf("|");
    if (pipe === -1) continue;
    const path = line.slice(0, pipe).trim();
    const rest = line.slice(pipe + 1).trim();
    const numMatch = rest.match(/^\s*(\d+)(.*)$/);
    const total = numMatch ? Number(numMatch[1]) : 0;
    const bar = numMatch ? numMatch[2].trim() : "";
    const plusCount = (bar.match(/\+/g) ?? []).length;
    const minusCount = (bar.match(/-/g) ?? []).length;
    let added: number;
    let removed: number;
    if (plusCount > 0 || minusCount > 0) {
      if (plusCount > 0 && minusCount > 0) {
        added = plusCount;
        removed = minusCount;
      } else if (plusCount > 0) {
        added = total;
        removed = 0;
      } else {
        added = 0;
        removed = total;
      }
    } else {
      added = total;
      removed = 0;
    }
    map.set(path, { added, removed });
  }
  return map;
}

/**
 * Numeric priority for file-aware truncation: 0 = lockfiles/deprioritized, 1 = other, 2 = preferred.
 * @param path - File path
 * @returns Priority 0, 1, or 2
 */
export function pathPriority(path: string): number {
  const base = path.split("/").pop() ?? path;
  if (LOCKFILE_NAMES.has(base)) return 0;
  const lower = path.toLowerCase();
  if (DEPRIORITIZED_DIRS.some((d) => lower.startsWith(d))) return 0;
  if (MANIFEST_BASES.has(base)) return 2;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")).toLowerCase() : "";
  if (PREFERRED_EXTENSIONS.has(ext)) return 2;
  return 1;
}

/**
 * Computes which low-tier (0–1) paths should be elevated to tier 3 for this diff.
 * @param stat - Output of git diff --staged --stat
 * @param threshold - Elevate when fraction of changed lines in low-tier files > this (e.g. 0.8)
 * @param minLines - Only consider elevation when total changed lines >= this (0 = always)
 * @param pathPriorityFn - Function to get base priority for a path
 * @returns Set of paths that are elevated for this diff
 */
export function computeElevatedPaths(
  stat: string,
  threshold: number,
  minLines: number,
  pathPriorityFn: (path: string) => number
): Set<string> {
  const counts = parseStatForLineCounts(stat);
  let total = 0;
  let lowTierLines = 0;
  const lowTierPaths: string[] = [];
  for (const [path, { added, removed }] of counts) {
    const n = added + removed;
    total += n;
    if (pathPriorityFn(path) <= 1) {
      lowTierLines += n;
      lowTierPaths.push(path);
    }
  }
  if (total < minLines || total === 0) return new Set();
  if (lowTierLines / total <= threshold) return new Set();
  return new Set(lowTierPaths);
}

/**
 * Splits a raw git diff into one chunk per file.
 * Uses the b/ (current) path for priority and language so renames are handled by destination.
 * @param diff - Raw git diff string
 * @returns Array of { path, chunk } for each file
 */
function splitDiffIntoFileChunks(diff: string): { path: string; chunk: string }[] {
  const parts = diff.split(/(?=^diff --git )/m).filter(Boolean);
  const chunks: { path: string; chunk: string }[] = [];
  for (const chunk of parts) {
    const match = chunk.match(/^diff --git a\/(.+?) b\/(.+?)(?:\s|$)/m);
    const path = match ? (match[2] ?? match[1]) : "unknown";
    chunks.push({ path, chunk });
  }
  if (chunks.length === 0 && diff.trim()) {
    chunks.push({ path: "unknown", chunk: diff });
  }
  return chunks;
}

/**
 * Truncates diff with file-aware priority; supports elevated (tier 3) paths.
 * @param diff - Raw diff (already sanitized and optionally import-collapsed)
 * @param effectiveLimit - Max character length
 * @param elevatedPaths - Paths to treat as tier 3 for this diff
 */
function truncateDiff(
  diff: string,
  effectiveLimit: number,
  elevatedPaths: Set<string>
): { content: string; wasTruncated: boolean } {
  if (diff.length <= effectiveLimit) {
    return { content: diff, wasTruncated: false };
  }

  const fileChunks = splitDiffIntoFileChunks(diff);
  const getEffectivePriority = (path: string) => (elevatedPaths.has(path) ? 3 : pathPriority(path));

  if (fileChunks.length <= 1) {
    const lines = diff.split("\n");
    const truncatedLines: string[] = [];
    let currentLength = 0;
    for (const line of lines) {
      if (currentLength + line.length + 1 > effectiveLimit) break;
      truncatedLines.push(line);
      currentLength += line.length + 1;
    }
    return {
      content: truncatedLines.join("\n"),
      wasTruncated: true,
    };
  }

  const sorted = [...fileChunks].sort(
    (a, b) =>
      getEffectivePriority(b.path) - getEffectivePriority(a.path) ||
      fileChunks.indexOf(a) - fileChunks.indexOf(b)
  );
  const result: string[] = [];
  let currentLength = 0;

  for (const { path, chunk } of sorted) {
    const effectivePrio = getEffectivePriority(path);
    const chunkLen = chunk.length + (result.length ? 1 : 0);
    if (currentLength + chunkLen <= effectiveLimit) {
      result.push(chunk);
      currentLength += chunkLen;
    } else if (currentLength < effectiveLimit && effectivePrio >= 1) {
      const budget = effectiveLimit - currentLength - (result.length ? 1 : 0) - 50;
      if (budget > 100) {
        const lines = chunk.split("\n");
        let tailLength = 0;
        const tailLines: string[] = [];
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (tailLength + line.length + 1 > budget) break;
          tailLines.unshift(line);
          tailLength += line.length + 1;
        }
        const omitted = lines.length - 1 - tailLines.length;
        const truncatedChunk =
          lines[0] +
          "\n...[truncated, " +
          omitted +
          " line" +
          (omitted !== 1 ? "s" : "") +
          " omitted]...\n" +
          tailLines.join("\n");
        result.push(truncatedChunk);
        currentLength += truncatedChunk.length + (result.length > 1 ? 1 : 0);
      }
      break;
    }
  }

  const content = result.join("\n");
  return {
    content: content || diff.slice(0, effectiveLimit),
    wasTruncated: true,
  };
}

/**
 * Runs the smart-diff pipeline: sanitize → optional import collapse → truncate with dynamic priority.
 * Token budget is enforced in the truncation step.
 * @param diff - Raw staged diff
 * @param stat - Optional output of git diff --staged --stat (for elevation)
 * @param config - Generation config (elevationThreshold, importCollapse, etc.)
 * @param effectiveLimit - Character limit from getEffectiveDiffLimit(config)
 * @returns { content, wasTruncated }
 */
export function getSmartDiff(
  diff: string,
  stat: string | undefined,
  config: Config,
  effectiveLimit: number
): { content: string; wasTruncated: boolean } {
  const sanitized = sanitizeDiff(diff);
  const elevatedPaths = stat
    ? computeElevatedPaths(
        stat,
        config.elevationThreshold ?? 0.8,
        config.elevationMinLines ?? 0,
        pathPriority
      )
    : new Set<string>();

  const chunks = splitDiffIntoFileChunks(sanitized);
  const collapsedChunks = chunks.map(({ path, chunk }) => ({
    path,
    chunk: collapseImportLines(chunk, path, config),
  }));
  const collapsedDiff =
    collapsedChunks.length === 0 ? sanitized : collapsedChunks.map((c) => c.chunk).join("\n");

  return truncateDiff(collapsedDiff, effectiveLimit, elevatedPaths);
}
