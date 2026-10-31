import { createContext, createElement, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import { CallEngine, type CallApi, type CallState } from "./engine";

const Ctx = createContext<CallApi | null>(null);

/** Gives the call screens one engine. Tests pass a fake with the same shape. */
export function CallProvider({ engine, children }: { engine?: CallApi; children: ReactNode }) {
  const own = useRef<CallApi>(undefined);
  own.current ??= engine ?? new CallEngine();
  return createElement(Ctx.Provider, { value: engine ?? own.current }, children);
}

export function useCallEngine(): { api: CallApi; state: CallState } {
  const api = useContext(Ctx);
  if (!api) throw new Error("useCallEngine needs a CallProvider");
  const state = useSyncExternalStore(api.subscribe, api.getState);
  return { api, state };
}
