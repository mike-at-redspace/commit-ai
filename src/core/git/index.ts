export {
  setGitExecutor,
  isGitRepository,
  getGitDiff,
  stageAllChanges,
  commit,
  getRecentCommits,
  getCurrentBranch,
} from "./git.js";
export {
  sanitizeDiff,
  getLanguageFromPath,
  isImportLine,
  collapseImportLines,
  parseStatForLineCounts,
  pathPriority,
  computeElevatedPaths,
  getSmartDiff,
  prepareDiffForSummarization,
} from "./smartDiff.js";
