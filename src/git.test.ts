import { describe, it, expect, afterEach } from "vitest";
import { getGitDiff, setGitExecutor } from "./git.js";

afterEach(() => {
  setGitExecutor(); // restore default
});

describe("getGitDiff", () => {
  it("returns staged diff and file list from mock executor", async () => {
    const fakeStaged = "diff --git a/foo.ts b/foo.ts\nindex 123..456\n--- a/foo.ts\n+++ b/foo.ts";
    const fakeNames = "foo.ts\0bar.ts\0baz.ts";

    setGitExecutor(async (command: string) => {
      if (command.includes("--name-only")) return fakeNames;
      return fakeStaged;
    });

    const result = await getGitDiff();
    expect(result.staged).toBe(fakeStaged);
    expect(result.stagedFiles).toEqual(["foo.ts", "bar.ts", "baz.ts"]);
  });

  it("returns empty stagedFiles when no files staged", async () => {
    setGitExecutor(async (command: string) => {
      if (command.includes("--name-only")) return "";
      return "";
    });

    const result = await getGitDiff();
    expect(result.staged).toBe("");
    expect(result.stagedFiles).toEqual([]);
  });

  it("splits on null byte for name-only output", async () => {
    setGitExecutor(async (command: string) => {
      if (command.includes("--name-only")) return "a.ts\0b.ts\0";
      return "diff content";
    });

    const result = await getGitDiff();
    expect(result.stagedFiles).toEqual(["a.ts", "b.ts"]);
  });
});
