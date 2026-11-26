import { useEffect, useState } from 'react'

interface HealthPayload {
  status: string
  service: string
}

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: HealthPayload }
  | { kind: 'error'; message: string }

async function fetchApiHealth(signal: AbortSignal): Promise<HealthPayload> {
  const response = await fetch('/api/health', { signal })
  if (!response.ok) {
    throw new Error(`API health check failed (${response.status})`)
  }
  return (await response.json()) as HealthPayload
}

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchApiHealth(controller.signal)
      .then((payload) => setHealth({ kind: 'ready', payload }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Unknown API error'
        setHealth({ kind: 'error', message })
      })
    return () => controller.abort()
  }, [])

  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a111a',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: '420px',
          borderRadius: '16px',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          backgroundColor: '#111c2b',
          padding: '24px',
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: '1.5rem', color: '#f8fafc' }}>
          Odysseus
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: '0.95rem', color: '#94a3b8' }}>
          Local-first travel planner bootstrap shell
        </p>
        {health.kind === 'loading' && (
          <p role="status" style={{ margin: 0, color: '#38bdf8' }}>
            Checking API health...
          </p>
        )}
        {health.kind === 'ready' && (
          <p role="status" style={{ margin: 0, color: '#34d399' }}>
            API connected: {health.payload.service} ({health.payload.status})
          </p>
        )}
        {health.kind === 'error' && (
          <p role="alert" style={{ margin: 0, color: '#f87171' }}>
            {health.message}
          </p>
        )}
      </section>
    </main>
  )
}
