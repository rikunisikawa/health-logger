import { fetchAuthSession, signInWithRedirect, signOut as amplifySignOut } from 'aws-amplify/auth'
import { useCallback, useEffect, useState } from 'react'

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    loading: true,
  })

  const checkSession = useCallback(async () => {
    try {
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString() ?? null
      setState({ isAuthenticated: !!token, token, loading: false })
    } catch {
      setState({ isAuthenticated: false, token: null, loading: false })
    }
  }, [])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const signIn = useCallback(() => {
    signInWithRedirect().catch(() => {})
  }, [])

  const signOut = useCallback(async () => {
    await amplifySignOut()
    setState({ isAuthenticated: false, token: null, loading: false })
  }, [])

  return { ...state, signIn, signOut, checkSession }
}
