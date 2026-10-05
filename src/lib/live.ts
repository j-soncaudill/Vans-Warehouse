import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sb } from "@/lib/supabase";

/** Bumps whenever packages change: realtime event, local write, or the phone waking up. */
let version = 0;
const listeners = new Set<() => void>();

export function notifyChanged() {
  version += 1;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useChangeVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

export type Query<T> = { data: T | undefined; error: string | null; loading: boolean; reload: () => void };

export function useLiveQuery<T>(key: string, fetcher: () => Promise<T>): Query<T> {
  const v = useChangeVersion();
  const [state, setState] = useState<{ key: string; data: T | undefined; error: string | null; loading: boolean }>({
    key,
    data: undefined,
    error: null,
    loading: true,
  });
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    let alive = true;
    setState((s) => (s.key === key ? { ...s, loading: true } : { key, data: undefined, error: null, loading: true }));
    fetchRef
      .current()
      .then((data) => alive && setState({ key, data, error: null, loading: false }))
      .catch((err: unknown) =>
        alive &&
        setState((s) => ({ ...s, key, error: err instanceof Error ? err.message : "Could not load.", loading: false })),
      );
    return () => {
      alive = false;
    };
  }, [key, v]);

  const reload = useCallback(() => notifyChanged(), []);
  const fresh = state.key === key;
  return { data: fresh ? state.data : undefined, error: fresh ? state.error : null, loading: !fresh || state.loading, reload };
}

export type LiveStatus = "connecting" | "live" | "offline";

/** One realtime channel for the whole app. */
export function useRealtime(): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  useEffect(() => {
    const client = sb();
    let timer = 0;
    const bump = () => {
      // Coalesce bursts (receive = insert + update) into one refetch.
      window.clearTimeout(timer);
      timer = window.setTimeout(notifyChanged, 120);
    };
    const channel = client
      .channel("vw-packages")
      .on("postgres_changes", { event: "*", schema: "public", table: "packages" }, bump)
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus("live");
          bump();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("offline");
      });
    const wake = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", bump);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", bump);
      void client.removeChannel(channel);
    };
  }, []);
  return status;
}
