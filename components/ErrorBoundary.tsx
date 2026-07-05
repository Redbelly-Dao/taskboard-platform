"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="card p-6 m-4 border-l-4 border-[#E63329]">
          <p className="font-bold text-[#1A1A2E] mb-2">Something went wrong.</p>
          <p className="text-sm text-[#888888]">Please refresh or try again later.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
