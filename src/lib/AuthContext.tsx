// ── Auth Context ────────────────────────────────────────────────────────
// React Context 기반 인증 상태 관리
// useAuth() 훅으로 컴포넌트에서 userId, isReady 접근

import { createContext, useContext, useEffect, useState } from 'react'
import { initAuthListener } from './auth'

interface AuthState {
  userId: string | null
  isReady: boolean
}

const AuthContext = createContext<AuthState>({ userId: null, isReady: false })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, isReady: false })

  useEffect(() => {
    const { unsubscribe } = initAuthListener((userId) => {
      setState({ userId, isReady: true })
    })
    return unsubscribe
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
