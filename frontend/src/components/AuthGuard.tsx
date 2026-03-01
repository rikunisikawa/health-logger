import { useEffect, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

interface Props {
  children: ReactNode
}

export default function AuthGuard({ children }: Props) {
  const { isAuthenticated, loading, signIn } = useAuth()

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      signIn()
    }
  }, [loading, isAuthenticated, signIn])

  if (loading || !isAuthenticated) return <LoadingSpinner />

  return <>{children}</>
}
