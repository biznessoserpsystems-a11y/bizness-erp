import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { setAccessToken, clearAccessToken } from '../services/tokenStore';
import { clearCompanyDrafts } from '../services/offlineDrafts';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The access token no longer persists across a reload (it lives in
    // memory only), so there's nothing to check locally on first load —
    // instead, attempt a silent refresh using the httpOnly cookie. If a
    // valid session cookie exists, this transparently signs the person
    // back in without re-entering a password; if not, it fails quietly
    // and they land on the login page, the same end result as the old
    // "no token in localStorage" check used to produce.
    api
      .post('/auth/refresh', {})
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        // Fetched once here, at the top-level provider, rather than by
        // every individual page that needs the company's name/address/
        // logo (a print letterhead, among other things) — this provider
        // persists across navigation, so this is one fetch for the whole
        // session instead of one per page visited.
        return Promise.all([api.get('/me'), api.get('/company')]);
      })
      .then(([me, companyRes]) => {
        setUser(me.data);
        setCompany(companyRes.data);
      })
      .catch(() => {
        clearAccessToken();
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password, mfaToken, rememberMe) {
    const { data } = await api.post('/auth/login', { email, password, mfaToken, rememberMe });
    if (data.mfaRequired) return { mfaRequired: true };

    setAccessToken(data.accessToken);
    const [me, companyRes] = await Promise.all([api.get('/me'), api.get('/company')]);
    setUser(me.data);
    setCompany(companyRes.data);
    return { success: true };
  }

  async function registerCompany(payload) {
    const { data } = await api.post('/auth/register-company', payload);
    return data;
  }

  async function logout() {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // ignore network errors on logout
    }
    if (company?.id) {
      try {
        await clearCompanyDrafts(company.id);
      } catch {
        // IndexedDB unavailable or blocked shouldn't prevent logout itself
      }
    }
    clearAccessToken();
    setUser(null);
    setCompany(null);
  }

  function hasPermission(code) {
    return user?.permissions?.includes(code);
  }

  return (
    <AuthContext.Provider value={{ user, company, setCompany, loading, login, registerCompany, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
