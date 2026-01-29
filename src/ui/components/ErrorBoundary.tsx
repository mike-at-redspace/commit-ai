import React, { Component, type ReactNode } from "react";
import { Box, Text } from "ink";

interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches React render errors and reports them via onError; renders a simple message.
 * Use to wrap the Dashboard so TUI errors are handled gracefully.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red">Something went wrong: {this.state.error.message}</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
