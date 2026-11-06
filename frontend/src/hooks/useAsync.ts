import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** Re-run the loader. `silent` keeps current data visible (no loading flag). */
  reload: (silent?: boolean) => Promise<T | undefined>;
  setData: (d: T | undefined) => void;
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const result = await loaderRef.current();
      if (id === seq.current) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e : new Error(String(e)));
      return undefined;
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload: run, setData };
}
