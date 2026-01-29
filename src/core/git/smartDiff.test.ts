import { describe, it, expect } from "vitest";
import type { Config } from "@core/config";
import {
  sanitizeDiff,
  getLanguageFromPath,
  isImportLine,
  collapseImportLines,
  parseStatForLineCounts,
  pathPriority,
  computeElevatedPaths,
  getSmartDiff,
} from "./smartDiff.js";

const baseConfig: Config = {
  model: "test",
  conventionalCommit: true,
  includeScope: true,
  includeEmoji: false,
  maxSubjectLength: 72,
  verbosity: "normal",
};

describe("sanitizeDiff", () => {
  it("strips conflict marker lines", () => {
    const diff = `diff --git a/foo b/foo
<<<<<<< HEAD
old
=======
new
>>>>>>> branch
+line
`;
    const out = sanitizeDiff(diff);
    expect(out).not.toContain("<<<<<<<");
    expect(out).not.toContain("=======");
    expect(out).not.toContain(">>>>>>>");
    expect(out).toContain("+line");
    expect(out).toContain("diff --git");
  });

  it("appends note when any conflict markers were removed", () => {
    const diff = "a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> x\n";
    const out = sanitizeDiff(diff);
    expect(out).toContain("[Conflict markers removed from diff.]");
    expect(out).toContain("a\nb\nc\n");
  });

  it("strips merge base marker and appends note when any marker removed", () => {
    const diff = "a\n||||||| base\nb";
    const out = sanitizeDiff(diff);
    expect(out).toContain("a\nb");
    expect(out).toContain("[Conflict markers removed from diff.]");
  });

  it("leaves normal diff unchanged", () => {
    const diff = "diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n+hello";
    expect(sanitizeDiff(diff)).toBe(diff);
  });
});

describe("getLanguageFromPath", () => {
  it("returns python for .py", () => {
    expect(getLanguageFromPath("src/foo.py")).toBe("python");
  });
  it("returns rust for .rs", () => {
    expect(getLanguageFromPath("lib/bar.rs")).toBe("rust");
  });
  it("returns go for .go", () => {
    expect(getLanguageFromPath("cmd/main.go")).toBe("go");
  });
  it("returns ts for .ts and .tsx", () => {
    expect(getLanguageFromPath("src/a.ts")).toBe("ts");
    expect(getLanguageFromPath("src/b.tsx")).toBe("ts");
  });
  it("returns js for .js and fallback", () => {
    expect(getLanguageFromPath("src/c.js")).toBe("js");
    expect(getLanguageFromPath("data.json")).toBe("js");
  });
  it("returns none for Makefile and yaml", () => {
    expect(getLanguageFromPath("Makefile")).toBe("none");
    expect(getLanguageFromPath("config.yml")).toBe("none");
  });
});

describe("isImportLine", () => {
  const patterns: Record<string, RegExp> = {
    python: /^(import\s|from\s+.*\s+import\s)/,
    rust: /^(pub\s+)?use\s+/,
    js: /^(\s*)(import\s|export\s+.*\s+from\s+)/,
  };

  it("detects Python import lines", () => {
    expect(isImportLine("+import os", "python", patterns)).toBe(true);
    expect(isImportLine("-from foo import bar", "python", patterns)).toBe(true);
    expect(isImportLine("+x = 1", "python", patterns)).toBe(false);
  });

  it("detects Rust use lines", () => {
    expect(isImportLine("+use std::io;", "rust", patterns)).toBe(true);
    expect(isImportLine("-  pub use crate::foo;", "rust", patterns)).toBe(true);
    expect(isImportLine("+fn main() {}", "rust", patterns)).toBe(false);
  });

  it("detects JS/TS import lines", () => {
    expect(isImportLine("+import x from 'y'", "js", patterns)).toBe(true);
    expect(isImportLine("-  export { a } from './a'", "js", patterns)).toBe(true);
    expect(isImportLine("+const x = 1", "js", patterns)).toBe(false);
  });
});

describe("collapseImportLines", () => {
  it("collapses consecutive + import lines in a chunk", () => {
    const chunk = `diff --git a/foo.py b/foo.py
--- a/foo.py
+++ b/foo.py
+import os
+import sys
+from bar import baz
+def main():
`;
    const config: Config = { ...baseConfig, importCollapse: true };
    const out = collapseImportLines(chunk, "foo.py", config);
    expect(out).toContain("+ ... 3 import lines ...");
    expect(out).not.toContain("import os");
    expect(out).toContain("+def main():");
  });

  it("respects importCollapse: false", () => {
    const chunk = "diff --git a/x b/x\n+import foo";
    const config: Config = { ...baseConfig, importCollapse: false };
    expect(collapseImportLines(chunk, "x.js", config)).toBe(chunk);
  });

  it("collapses Rust use lines", () => {
    const chunk = `diff --git a/main.rs b/main.rs
+use std::io;
+use std::fs;
+fn main() {}
`;
    const config: Config = { ...baseConfig, importCollapse: true };
    const out = collapseImportLines(chunk, "main.rs", config);
    expect(out).toContain("+ ... 2 import lines ...");
    expect(out).toContain("+fn main() {}");
  });
});

describe("parseStatForLineCounts", () => {
  it("parses git diff --stat output and counts +/− bars", () => {
    const stat = ` src/foo.ts | 10 +++++-----
 data/x.json | 2 +-
 2 files changed, 11 insertions(+), 6 deletions(-)`;
    const map = parseStatForLineCounts(stat);
    expect(map.get("src/foo.ts")).toEqual({ added: 5, removed: 5 });
    expect(map.get("data/x.json")).toEqual({ added: 1, removed: 1 });
    expect(map.has("2 files changed")).toBe(false);
  });

  it("falls back to total when no bars (legacy stat)", () => {
    const stat = " file.txt | 3 ";
    const map = parseStatForLineCounts(stat);
    expect(map.get("file.txt")).toEqual({ added: 3, removed: 0 });
  });

  it("returns empty map for empty or weird input", () => {
    expect(parseStatForLineCounts("").size).toBe(0);
    expect(parseStatForLineCounts("no pipe here").size).toBe(0);
  });
});

describe("pathPriority", () => {
  it("returns 0 for lockfiles and deprioritized dirs", () => {
    expect(pathPriority("package-lock.json")).toBe(0);
    expect(pathPriority("pnpm-lock.yaml")).toBe(0);
    expect(pathPriority("dist/out.js")).toBe(0);
    expect(pathPriority("build/foo.js")).toBe(0);
  });

  it("returns 2 for preferred extensions and manifest files", () => {
    expect(pathPriority("src/foo.ts")).toBe(2);
    expect(pathPriority("package.json")).toBe(2);
    expect(pathPriority("lib/bar.py")).toBe(2);
    expect(pathPriority("main.go")).toBe(2);
    expect(pathPriority("pyproject.toml")).toBe(2);
    expect(pathPriority("Gemfile")).toBe(2);
    expect(pathPriority("src/main.cpp")).toBe(2);
  });

  it("returns 1 for other files", () => {
    expect(pathPriority("data/config.json")).toBe(1);
    expect(pathPriority("README.md")).toBe(1);
  });
});

describe("computeElevatedPaths", () => {
  it("elevates when most changes are in low-tier files", () => {
    const stat = ` data/big.json | 200 ++++++++++
 src/foo.ts    | 10 +++++-----
 2 files changed`;
    const elevated = computeElevatedPaths(stat, 0.8, 50, pathPriority);
    expect(elevated.has("data/big.json")).toBe(true);
    expect(elevated.has("src/foo.ts")).toBe(false);
  });

  it("uses added+removed for total changed lines", () => {
    const stat = ` data/x.json | 10 ++--
 src/foo.ts  | 90 +++++
 2 files changed`;
    const elevated = computeElevatedPaths(stat, 0.8, 0, pathPriority);
    expect(elevated.size).toBe(0);
  });

  it("returns empty when total lines below minLines", () => {
    const stat = ` data/x.json | 5 +
 src/foo.ts  | 5 +
 2 files changed`;
    const elevated = computeElevatedPaths(stat, 0.8, 50, pathPriority);
    expect(elevated.size).toBe(0);
  });
});

describe("getSmartDiff", () => {
  it("returns full diff when under limit", () => {
    const diff = "diff --git a/x b/x\n--- a/x\n+++ b/x\n+hello";
    const config = { ...baseConfig };
    const { content, wasTruncated } = getSmartDiff(diff, undefined, config, 10_000);
    expect(wasTruncated).toBe(false);
    expect(content).toContain("+hello");
  });

  it("sanitizes conflict markers before processing", () => {
    const diff = `diff --git a/x b/x
<<<<<<< HEAD
=======
+new
>>>>>>> branch
`;
    const { content } = getSmartDiff(diff, undefined, baseConfig, 5000);
    expect(content).not.toContain("<<<<<<<");
    expect(content).toContain("+new");
  });

  it("respects effectiveLimit and reports wasTruncated", () => {
    const diff =
      "diff --git a/a b/a\n--- a/a\n+++ b/a\n" +
      "x\n".repeat(500) +
      "diff --git a/b b/b\n--- a/b\n+++ b/b\ny\n";
    const { content, wasTruncated } = getSmartDiff(diff, undefined, baseConfig, 200);
    expect(wasTruncated).toBe(true);
    expect(content.length).toBeLessThanOrEqual(250);
  });

  it("elevates low-tier file when stat shows majority of changes there", () => {
    const bigChunk =
      "diff --git a/data.json b/data.json\n--- a/data.json\n+++ b/data.json\n" +
      Array(100).fill("+{}").join("\n");
    const smallChunk =
      "diff --git a/src/foo.ts b/src/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n+const x = 1;\n";
    const diff = bigChunk + "\n" + smallChunk;
    const stat = ` data.json    | 100 ++++++++++
 src/foo.ts   | 1 +
 2 files changed`;
    const limit = 500;
    const { content, wasTruncated } = getSmartDiff(
      diff,
      stat,
      { ...baseConfig, elevationThreshold: 0.8 },
      limit
    );
    expect(wasTruncated).toBe(true);
    expect(content).toContain("data.json");
  });

  it("handles empty diff", () => {
    const { content, wasTruncated } = getSmartDiff("", undefined, baseConfig, 1000);
    expect(content).toBe("");
    expect(wasTruncated).toBe(false);
  });

  it("handles diff with no diff --git (single blob)", () => {
    const diff = "some raw content\nwithout file headers";
    const { content } = getSmartDiff(diff, undefined, baseConfig, 1000);
    expect(content).toContain("some raw content");
  });
});
