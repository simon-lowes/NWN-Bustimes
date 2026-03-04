import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-8">
          <div className="font-mono text-[#ff3300] text-center space-y-4">
            <div className="text-4xl font-bold">SYSTEM_FAULT</div>
            <div className="text-lg text-[#f4f4f0]/60">
              An unexpected error occurred. Reload the page to try again.
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2 bg-[#eaff00] text-[#0a0a0a] font-bold hover:bg-[#f4f4f0] transition-colors"
            >
              [RELOAD]
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
