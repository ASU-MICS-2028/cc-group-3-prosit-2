import type { Role } from "./roles";

export type User = { id: string; name: string; role: Role; facility?: string };
export type Session = { token: string; user: User; mode: "test" | "live" };

/** The real auth-service (SVC-1) will implement this same interface. */
export interface AuthApi {
  /** Test accounts for the demo; a live service returns none. */
  demoAccounts(): User[];
  signIn(userId: string): Promise<Session>;
  signOut(): Promise<void>;
}
