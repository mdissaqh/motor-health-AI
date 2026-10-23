import React from 'react';

/**
 * Enterprise React Error Boundary.
 * Catches unhandled JavaScript render errors in child component trees,
 * logs the fault, and displays a clean, user-friendly recovery UI instead of a blank screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught render failure:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', margin: '2rem 0', border: '1px solid var(--rose-danger)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛡️</div>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--navy-primary)', marginBottom: '0.5rem' }}>
            {this.props.title || 'Screen Render Recovery Active'}
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto 1.5rem', fontSize: '0.85rem' }}>
            A rendering exception occurred in this component. The rest of the application remains fully functional.
          </p>

          {this.state.error && (
            <div style={{ background: 'rgba(244, 63, 94, 0.1)', padding: '0.75rem 1rem', borderRadius: '6px', maxWidth: '700px', margin: '0 auto 1.5rem', textAlign: 'left', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
              <span className="mono" style={{ fontSize: '0.78rem', color: '#fb7185' }}>
                {this.state.error.toString()}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={this.handleReset}
            >
              Reload Component ↺
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => window.location.reload()}
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
