import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInstallStatus, getSession } from '../api';

export type AuthStatus = 'loading' | 'authed' | 'unauth' | 'setup';

export const useAuth = () => {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [authUser, setAuthUser] = useState<{ id: string; email?: string; role?: string; permissions?: string[] } | null>(null);

  const signOut = useCallback(() => {
    localStorage.removeItem('onfire.session');
    setAuthStatus('unauth');
    setAuthUser(null);
    navigate('/login');
  }, [navigate]);

  const ensureSession = useCallback(() => {
    getInstallStatus()
      .then((state) => {
        if (state.needsSetup) {
          setAuthStatus('setup');
          setAuthUser(null);
          navigate('/install');
          return;
        }
        return getSession()
          .then((res) => {
            setAuthUser(res ? { id: res.user?.id, email: res.user?.email, role: res.role, permissions: res.permissions } : null);
            setAuthStatus('authed');
          })
          .catch((err: any) => {
            if (err?.status === 428) {
              setAuthStatus('setup');
              setAuthUser(null);
              navigate('/install');
              return;
            }
            signOut();
          });
      })
      .catch((err: any) => {
        if (err?.status === 428) {
          setAuthStatus('setup');
          setAuthUser(null);
          navigate('/install');
          return;
        }
        signOut();
      });
  }, [navigate, signOut]);

  useEffect(() => {
    ensureSession();
  }, [ensureSession]);

  const hasPermission = useCallback(
    (perm: string) => {
      const perms = authUser?.permissions ?? [];
      return perms.includes(perm) || perms.includes('*');
    },
    [authUser]
  );

  return {
    authStatus,
    authUser,
    setAuthStatus,
    setAuthUser,
    ensureSession,
    signOut,
    hasPermission
  };
};

