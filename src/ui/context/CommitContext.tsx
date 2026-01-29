import React, { createContext, useContext, type ReactNode } from "react";
import type { Config, CommitContext as CommitContextType } from "@core/config";
import type { CommitGenerator } from "@core/ai";

export interface CommitContextValue {
  config: Config;
  context: CommitContextType;
  generator: CommitGenerator;
}

const CommitContext = createContext<CommitContextValue | null>(null);

export interface CommitProviderProps {
  config: Config;
  context: CommitContextType;
  generator: CommitGenerator;
  children: ReactNode;
}

/**
 * Provides config, context, and generator to the Dashboard tree.
 * Use useCommitContext() in children to read them.
 */
export function CommitProvider({
  config,
  context,
  generator,
  children,
}: CommitProviderProps): React.ReactElement {
  const value: CommitContextValue = { config, context, generator };
  return <CommitContext.Provider value={value}>{children}</CommitContext.Provider>;
}

export function useCommitContext(): CommitContextValue {
  const value = useContext(CommitContext);
  if (value === null) {
    throw new Error("useCommitContext must be used within CommitProvider");
  }
  return value;
}
