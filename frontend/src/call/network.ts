/** Before joining we look at what the phone says about its connection, so a CHV on a weak signal is
 *  offered audio only before the call starts. The browser's numbers are rough guesses. */
export type NetworkInfo = { effectiveType?: string; downlink?: number; saveData?: boolean };
export type NetworkAdvice = { level: "good" | "weak" | "unknown"; recommendAudioOnly: boolean; text: string };

export function adviseNetwork(info: NetworkInfo | undefined, online: boolean): NetworkAdvice {
  if (!online) return { level: "weak", recommendAudioOnly: true, text: "No signal. A call needs a connection." };
  if (!info || (info.effectiveType === undefined && info.downlink === undefined)) return { level: "unknown", recommendAudioOnly: false, text: "We can't measure the connection. Video will switch to audio if it gets weak." };
  const slow = info.effectiveType === "slow-2g" || info.effectiveType === "2g" || (info.downlink !== undefined && info.downlink < 0.4) || info.saveData === true;
  if (slow) return { level: "weak", recommendAudioOnly: true, text: "The connection is weak. Audio only works best." };
  if (info.effectiveType === "3g") return { level: "weak", recommendAudioOnly: false, text: "The connection is slow. Video may switch to audio." };
  return { level: "good", recommendAudioOnly: false, text: "The connection looks good." };
}

export const currentNetwork = (): NetworkInfo | undefined => (navigator as Navigator & { connection?: NetworkInfo }).connection;

/** Opens and closes the signaling socket, to learn whether the call server can be reached. */
export function canReachServer(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => { if (!done) { done = true; clearTimeout(timer); try { ws.close(); } catch { /* already closed */ } resolve(ok); } };
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return resolve(false); }
    const timer = setTimeout(() => finish(false), timeoutMs);
    ws.onopen = () => finish(true);
    ws.onerror = () => finish(false);
  });
}

/** Normalises "Clinic 1 " and "clinic1" to the same code, so a typo in case or spacing can't keep two people apart. */
export const normaliseCode = (input: string): string => input.trim().toLowerCase().replace(/\s+/g, "-");

export function generateCode(random: (max: number) => number = (max) => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0]! % max; }): string {
  return `hc-${String(random(10000)).padStart(4, "0")}`;
}
