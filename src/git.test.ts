import { describe, it, expect, afterEach } from "vitest";
import { getGitDiff, setGitExecutor } from "./git.js";

afterEach(() => {
  setGitExecutor(); // restore default
});

describe("getGitDiff", () => {
  it("returns staged diff and file list from mock executor", async () => {
    const fakeStaged = "diff --git a/foo.ts b/foo.ts\nindex 123..456\n--- a/foo.ts\n+++ b/foo.ts";
    const fakeNames = "foo.ts\0bar.ts\0baz.ts";
    const fakeStat = "foo.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)";

    setGitExecutor(async (command: string) => {
      if (command.includes("--name-only")) return fakeNames;
      if (command.includes("--stat")) return fakeStat;
      return fakeStaged;
    });

    const result = await getGitDiff();
    expect(result.staged).toBe(fakeStaged);
    expect(result.stagedFiles).toEqual(["foo.ts", "bar.ts", "baz.ts"]);
    expect(result.stat).toBe(fakeStat);
  });

  it("returns empty stagedFiles when no files staged", async () => {
    setGitExecutor(async (command: string) => {
      if (command.includes("--name-only")) return "";
      if (command.includes("--stat")) return "";
      return "";
    });

    const result = await getGitDiff();
    expect(result.staged).toBe("");
    expect(result.stagedFiles).toEqual([]);
    expect(result.stat).toBeUndefined();
  });

  it("splits on null byte for name-only output", async () => {
    setGitExecutor(async (command: string) => {
      if (command.includes("--name-only")) return "a.ts\0b.ts\0";
      if (command.includes("--stat")) return "";
      return "diff content";
    });

    const result = await getGitDiff();
    expect(result.stagedFiles).toEqual(["a.ts", "b.ts"]);
  });

  it("uses -w when ignoreWhitespace is true", async () => {
    setGitExecutor(async (command: string) => {
      if (command.includes("--name-only")) return "x.ts";
      if (command.includes("--stat")) return " x.ts | 1 +";
      expect(command).toContain(" -w");
      return "diff with -w";
    });

    const result = await getGitDiff({ ignoreWhitespace: true });
    expect(result.staged).toBe("diff with -w");
  });
});
