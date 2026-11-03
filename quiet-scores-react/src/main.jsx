import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles.css'
import './details.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught:', error, errorInfo)
    this.setState({ errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '40px', 
          color: 'white', 
          background: '#000',
          minHeight: '100vh',
          fontFamily: 'system-ui'
        }}>
          <h1>⚠️ Application Error</h1>
          <p>Something went wrong. Check the console for details.</p>
          <details style={{ marginTop: '20px' }}>
            <summary>Error Details</summary>
            <pre style={{ 
              background: '#1a1a1a', 
              padding: '10px', 
              overflow: 'auto',
              marginTop: '10px'
            }}>
              {this.state.error?.toString()}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
