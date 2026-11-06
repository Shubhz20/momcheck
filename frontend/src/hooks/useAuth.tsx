import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SIGNED_OUT_EVENT, api } from "../api/client";
import type { Me } from "../api/types";

interface AuthState {
  me: Me | null;
  checking: boolean;
  signedIn: (me: Me) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setChecking(false));
    const onSignedOut = () => setMe(null);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setMe(null);
    }
  }, []);

  return <AuthContext.Provider value={{ me, checking, signedIn: setMe, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** The signed-in ASHA. Only use inside pages that render after sign-in. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error("Not signed in");
  return me;
}
