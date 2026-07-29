import { DashboardShell } from './components/dashboard/DashboardShell'
import { AuthProvider } from './features/auth/AuthProvider'
import { LoginScreen } from './features/auth/LoginScreen'
import { useAuth } from './features/auth/useAuth'

function AuthGate() {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900">
        <div className="text-sm font-medium text-neutral-300">Loading…</div>
      </div>
    )
  }

  if (status === 'anon') {
    return <LoginScreen />
  }

  return <DashboardShell />
}

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

export default App
