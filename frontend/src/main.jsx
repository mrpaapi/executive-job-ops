import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './index.css'

// Most data on this app is small, slow-changing, and read many times per
// session (profile catalog, resume list, STAR stories, portal company
// catalog). A long staleTime avoids re-fetching the same payload every time
// the user switches tabs. Mutations explicitly invalidate the keys they own.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60_000,           // 5 min — treat data as fresh
      gcTime: 30 * 60_000,              // keep in cache for 30 min after unmount
      refetchOnWindowFocus: false,      // don't re-hit the API on every tab focus
      refetchOnMount: 'stale',          // only refetch on mount if stale
      refetchOnReconnect: 'stale',      // only refetch on reconnect if stale
    },
    mutations: {
      retry: 1,
      networkMode: 'online',           // fail fast if offline
    },
  },
})

// Detect network quality — if slow, increase timeouts and reduce retries
if (navigator.connection?.effectiveType === 'slow-2g' || navigator.connection?.effectiveType === '2g') {
  queryClient.setDefaultOptions(old => ({
    ...old,
    queries: { ...old.queries, staleTime: 10 * 60_000 },  // be more forgiving on slow networks
  }))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster position="top-right" toastOptions={{
            style: { borderRadius: '10px', fontSize: '14px' }
          }} />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
