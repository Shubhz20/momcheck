import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { Language } from "../api/types";
import { LANGUAGES } from "../lib/format";

interface LanguagesCtx {
  languages: Language[];
  loaded: boolean;
  refresh: () => void;
}

const Ctx = createContext<LanguagesCtx>({ languages: LANGUAGES, loaded: false, refresh: () => {} });
// All 10 languages are supported end to end (Prisma STT + Timbre TTS); the API list overrides this when loaded.

export function LanguagesProvider({ children }: { children: ReactNode }) {
  const [languages, setLanguages] = useState<Language[]>(LANGUAGES);
  const [loaded, setLoaded] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .languages()
      .then((l) => {
        if (alive && Array.isArray(l) && l.length) {
          setLanguages(l);
          setLoaded(true);
        }
      })
      .catch(() => {
        /* keep fallback list */
      });
    return () => {
      alive = false;
    };
  }, [n]);

  return <Ctx.Provider value={{ languages, loaded, refresh: () => setN((x) => x + 1) }}>{children}</Ctx.Provider>;
}

export function useLanguages() {
  return useContext(Ctx);
}
