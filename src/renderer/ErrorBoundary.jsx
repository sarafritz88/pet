import React from 'react';

/**
 * Catches render errors in the tree and shows a fallback UI instead of crashing.
 * Wrap the app root so unhandled errors allow graceful recovery.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            color: '#333',
            maxWidth: 400,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
          <p>The app hit an error and recovered here. You can try refreshing or closing and reopening the window.</p>
          {this.state.error && (
            <pre
              style={{
                fontSize: 12,
                overflow: 'auto',
                background: '#f5f5f5',
                padding: 12,
                borderRadius: 4,
              }}
            >
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
