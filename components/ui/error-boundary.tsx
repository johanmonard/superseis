"use client";

import * as React from "react";

import { Button } from "./button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center gap-[var(--space-4)] p-[var(--space-6)] text-center">
          <p className="text-[length:var(--font-size-sm)] font-[number:var(--font-weight-medium)] text-[var(--color-text-primary)]">
            Something went wrong
          </p>
          <p className="max-w-md text-[length:var(--font-size-xs)] text-[var(--color-text-muted)]">
            {this.state.error.message}
          </p>
          <Button variant="secondary" size="sm" onClick={this.handleReset}>
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
