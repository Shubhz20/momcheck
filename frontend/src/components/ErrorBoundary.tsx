import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** When this changes (e.g. the page path), a crashed page gets another try. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Shows a message instead of a blank screen when a page fails to render. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto my-10 max-w-md rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-line">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="size-6" />
        </div>
        <p className="mt-4 font-semibold text-ink">This page couldn't be shown</p>
        <p className="mt-1 text-sm text-muted">Something went wrong while drawing it. Your data is safe.</p>
        <p className="mt-3 break-words rounded-lg bg-stone-50 px-3 py-2 text-left font-mono text-xs text-muted">{this.state.error.message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
          >
            <RotateCcw className="size-4" /> Reload
          </button>
          <a href="/" className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-stone-50">
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }
}
