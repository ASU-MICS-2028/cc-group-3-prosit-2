import { API_URL, NetworkError, busy, reach } from "../data/sync";
import type { Session } from "./types";

/** A refusal in words the sign-in screen can show. */
export class SignInRefused extends Error { constructor(message: string) { super(message); this.name = "SignInRefused"; } }

/** `POST /auth/login`, `/auth/refresh` and `/auth/logout` (learnings/patient-record-service.md). */
export interface LiveAuthApi {
  signIn(username: string, password: string): Promise<Session>;
  /** The new pair, or null if this refresh token is finished. No signal or a server fault throws NetworkError. */
  refresh(refreshToken: string): Promise<Session | null>;
  signOut(refreshToken: string): Promise<void>;
}

export function httpAuthApi(baseUrl = API_URL): LiveAuthApi {
  const post = (path: string, body: unknown) => reach(baseUrl + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const session = async (res: Response): Promise<Session> => {
    const { token, refreshToken, user } = await res.json() as Session;
    return { token, refreshToken, user, mode: "live" };
  };
  return {
    async signIn(username, password) {
      const res = await post("/auth/login", { username, password }).catch(() => { throw new SignInRefused("We can't reach the server. Check your signal and try again."); });
      if (res.ok) return session(res);
      const { message } = await res.json().catch(() => ({})) as { message?: string };
      throw new SignInRefused(res.status === 503 ? "The server is briefly unavailable. Please try again soon." : message ?? "We couldn't sign you in. Please try again.");
    },
    async refresh(refreshToken) {
      const res = await post("/auth/refresh", { refreshToken });
      if (res.status === 401) return null;
      if (!res.ok) throw busy(res);
      return session(res).catch(() => { throw new NetworkError("Unexpected reply"); });
    },
    async signOut(refreshToken) { await post("/auth/logout", { refreshToken }).catch(() => undefined); },
  };
}
