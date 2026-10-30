import type { AuthApi, User } from "./types";

/** Synthetic people only: no real names, no phone numbers (decision D-004). */
const ACCOUNTS: User[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Ama Serwaa", role: "chv", facility: "Dodowa clinic area" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Akosua Boateng", role: "patient" },
  { id: "00000000-0000-4000-8000-000000000003", name: "Dr. Kofi Mensah", role: "clinician", facility: "Korle Bu (test)" },
  { id: "00000000-0000-4000-8000-000000000004", name: "Efua Darko", role: "pharmacist", facility: "Test pharmacy" },
  { id: "00000000-0000-4000-8000-000000000005", name: "Nana Yaw Asare", role: "healer", facility: "Kintampo area" },
  { id: "00000000-0000-4000-8000-000000000006", name: "Adwoa Frimpong", role: "ghs", facility: "Greater Accra region" },
  { id: "00000000-0000-4000-8000-000000000007", name: "Kwabena Ofori", role: "facility_admin", facility: "Dodowa clinic area" },
  { id: "00000000-0000-4000-8000-000000000008", name: "Team Admin", role: "platform_admin" },
];

/** Test mode: signing in succeeds for a listed account and hands out a clearly fake token. */
export const mockAuthApi: AuthApi = {
  demoAccounts: () => ACCOUNTS,
  async signIn(userId) {
    const user = ACCOUNTS.find((a) => a.id === userId);
    if (!user) throw new Error("Unknown account");
    return { token: `test.${user.role}.${userId}`, user, mode: "test" };
  },
  async signOut() {},
};
