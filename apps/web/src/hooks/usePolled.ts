import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort } from "../api";

interface PollState<T> {
  key: string;
  data: T | null;
  error: string | null;
  ready: boolean;
}

function failure(error: unknown): string | null {
  if (isAbort(error)) return null;
  return error instanceof Error ? error.message : "The desk could not reach the API.";
}

export function usePolled<T>(key: string, load: (signal: AbortSignal) => Promise<T>, ms: number) {
  const [state, setState] = useState<PollState<T>>({ key, data: null, error: null, ready: false });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const data = await loadRef.current(controller.signal);
        if (!stopped) setState({ key, data, error: null, ready: true });
      } catch (error) {
        const message = failure(error);
        if (!stopped && message) {
          setState((prev) => ({
            key,
            data: prev.key === key ? prev.data : null,
            error: message,
            ready: true,
          }));
        }
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), ms);
    };

    void tick();
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key, ms]);

  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current(new AbortController().signal);
      setState({ key, data, error: null, ready: true });
    } catch (error) {
      const message = failure(error);
      if (!message) return;
      setState((prev) => ({
        key,
        data: prev.key === key ? prev.data : null,
        error: message,
        ready: true,
      }));
    }
  }, [key]);

  if (state.key !== key) return { data: null, error: null, ready: false, reload };
  return { data: state.data, error: state.error, ready: state.ready, reload };
}
