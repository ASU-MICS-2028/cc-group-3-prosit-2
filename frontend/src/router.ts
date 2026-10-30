import { useSyncExternalStore } from "react";

/** A tiny History-API router: enough for /login, /app/<screen> and /dev/gallery. */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener("popstate", notify);

export function navigate(path: string, { replace = false } = {}) {
  if (path === location.pathname) return;
  (replace ? history.replaceState : history.pushState).call(history, null, "", path);
  notify();
}
export const back = () => history.back();

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => location.pathname,
  );
}
