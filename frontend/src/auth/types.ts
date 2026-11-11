import type { Role } from "./roles";

export type User = { id: string; name: string; role: Role; facility?: string; patientId?: string };
export type Session = { token: string; refreshToken?: string; user: User; mode: "test" | "live" };

/** Test mode's sign-in. The real one takes a password, so it is `LiveAuthApi` in liveApi.ts. */
export interface AuthApi {
  /** Test accounts for the demo; a live service returns none. */
  demoAccounts(): User[];
  signIn(userId: string): Promise<Session>;
  signOut(): Promise<void>;
}
