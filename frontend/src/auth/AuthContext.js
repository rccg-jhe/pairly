import { createContext, useContext } from 'react'

// A "context" shares one value with EVERY component inside its provider,
// without passing it down as props through each layer.
// Here the value is: is the presenter logged in, and the login/logout actions.
export const AuthContext = createContext(null)

// Any component can call useAuth() to get { status, username, expired, login, logout }.
//   status: 'checking' (asking the server) | 'in' | 'out'
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
