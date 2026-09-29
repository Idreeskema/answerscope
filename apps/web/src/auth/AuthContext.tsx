import { createContext, useContext, useMemo, useState, ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem('accessToken'),
  );
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      login: (token, nextUser) => {
        localStorage.setItem('accessToken', token);
        localStorage.setItem('user', JSON.stringify(nextUser));
        setAccessToken(token);
        setUser(nextUser);
      },
      logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        setAccessToken(null);
        setUser(null);
      },
    }),
    [user, accessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
