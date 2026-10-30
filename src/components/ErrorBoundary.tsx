import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        this.props.fallback ?? (
          <div className="recovery">
            <h1>Let’s get your web back.</h1>
            <p>
              FriendWeb stopped safely. Your saved data is still on this device.
            </p>
            <pre>{this.state.error.message}</pre>
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              Reload FriendWeb
            </button>
          </div>
        )
      );
    return this.props.children;
  }
}
