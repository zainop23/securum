import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface UserInfo {
  id: string;
  email: string;
  fullName: string;
  role: 'platform_admin' | 'org_admin' | 'analyst';
  orgId: string | null;
  orgName: string | null;
}

interface AuthContextType {
  token: string | null;
  user: UserInfo | null;
  login: (token: string, user: UserInfo) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('securum_token');
  });

  const [user, setUser] = useState<UserInfo | null>(() => {
    const stored = localStorage.getItem('securum_user');
    if (stored) {
      try {
        return JSON.parse(stored) as UserInfo;
      } catch {
        return null;
      }
    }
    return null;
  });

  const login = useCallback((newToken: string, newUser: UserInfo) => {
    localStorage.setItem('securum_token', newToken);
    localStorage.setItem('securum_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('securum_token');
    localStorage.removeItem('securum_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
