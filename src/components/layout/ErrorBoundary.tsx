import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
          <AlertTriangle className="h-7 w-7 text-red-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            This page encountered an unexpected error. You can try again or reload the app.
          </p>
          <p className="text-xs font-mono text-red-400/80 mt-2 max-w-md break-words">
            {error.message}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:text-foreground hover:bg-secondary transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
