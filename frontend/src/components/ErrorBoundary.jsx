import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Error boundary to catch crashes and show a graceful error UI instead of
 * a blank screen. In dev, React shows the full stack; in prod, users see
 * a friendly "Something went wrong" message with a reload button.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null, errorCount: 0 }
  }

  componentDidCatch(error, info) {
    this.setState(prev => ({ error, info, errorCount: prev.errorCount + 1 }))
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error && this.state.errorCount < 3) {
      // Show user-friendly error UI
      return (
        <div className="flex items-center justify-center h-screen bg-red-50 p-4">
          <div className="card p-8 max-w-md text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-600" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-red-900">Something went wrong</h1>
              <p className="text-sm text-red-700 mt-2 leading-relaxed">
                The app encountered an unexpected error. Try reloading the page or check your browser console for details.
              </p>
              {process.env.NODE_ENV === 'development' && (
                <pre className="bg-red-100 text-red-900 p-3 rounded-lg text-xs mt-3 overflow-auto max-h-40">
                  {this.state.error?.toString()}
                </pre>
              )}
            </div>
            <button
              onClick={() => {
                this.setState({ error: null, info: null })
                window.location.reload()
              }}
              className="btn btn-primary w-full justify-center"
            >
              <RefreshCw size={14} /> Reload page
            </button>
          </div>
        </div>
      )
    }

    // If error boundary itself fails repeatedly, show bare error
    if (this.state.errorCount >= 3) {
      return (
        <div style={{ padding: '20px', color: '#d32f2f', fontSize: '14px' }}>
          <strong>Critical error:</strong> The app is unable to recover. Please clear your browser cache and reload.
        </div>
      )
    }

    return this.props.children
  }
}
