import type { IconName } from "../components/icons";

/** The eight roles of the brief (p.6-7). The server enforces them; this table only shapes the UI. */
export const ROLES = ["chv", "patient", "clinician", "pharmacist", "healer", "ghs", "facility_admin", "platform_admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  chv: "Community health volunteer",
  patient: "Patient",
  clinician: "Doctor, nurse or specialist",
  pharmacist: "Pharmacist",
  healer: "Traditional healer",
  ghs: "Ghana Health Service official",
  facility_admin: "Health centre admin",
  platform_admin: "Platform admin",
};

/** Patients sign in with a PIN only; every other role can also use a fingerprint (WebAuthn). */
export const FINGERPRINT_ROLES: readonly Role[] = ROLES.filter((r) => r !== "patient");

export type TabDef = { screen: string; label: string; icon: IconName };

/** At most five tabs per role (design system 7.13). Every `screen` must be allowed for that role. */
export const TABS: Record<Role, TabDef[]> = {
  chv: [
    { screen: "chv.today", label: "Today", icon: "house" },
    { screen: "chv.patients", label: "Patients", icon: "users" },
    { screen: "chv.care", label: "Care", icon: "calendar-blank" },
    { screen: "chv.learn", label: "Learn", icon: "file-text" },
    { screen: "me", label: "Me", icon: "user" },
  ],
  patient: [
    { screen: "patient.home", label: "Home", icon: "house" },
    { screen: "patient.visits", label: "Visits", icon: "calendar-blank" },
    { screen: "patient.pay", label: "Pay", icon: "scales" },
    { screen: "patient.learn", label: "Learn", icon: "file-text" },
    { screen: "me", label: "Me", icon: "user" },
  ],
  clinician: [
    { screen: "clinician.today", label: "Today", icon: "house" },
    { screen: "clinician.patients", label: "Patients", icon: "users" },
    { screen: "clinician.inbox", label: "Inbox", icon: "chat-circle-text" },
    { screen: "clinician.prescribe", label: "Prescribe", icon: "pill" },
    { screen: "me", label: "Me", icon: "user" },
  ],
  pharmacist: [
    { screen: "pharmacist.verify", label: "Verify", icon: "qr-code" },
    { screen: "pharmacist.queue", label: "Queue", icon: "file-text" },
    { screen: "pharmacist.stock", label: "Stock", icon: "pill" },
    { screen: "me", label: "Me", icon: "user" },
  ],
  healer: [
    { screen: "healer.home", label: "Home", icon: "house" },
    { screen: "healer.patients", label: "Patients", icon: "users" },
    { screen: "healer.remedies", label: "Remedies", icon: "pill" },
    { screen: "me", label: "Me", icon: "user" },
  ],
  ghs: [
    { screen: "ghs.dashboard", label: "Dashboard", icon: "house" },
    { screen: "ghs.map", label: "Map", icon: "translate" },
    { screen: "ghs.alerts", label: "Alerts", icon: "bell" },
    { screen: "ghs.policy", label: "Policy", icon: "file-text" },
    { screen: "me", label: "Me", icon: "user" },
  ],
  facility_admin: [
    { screen: "facility.home", label: "Home", icon: "house" },
    { screen: "facility.users", label: "People", icon: "users" },
    { screen: "facility.stock", label: "Stock", icon: "pill" },
    { screen: "facility.training", label: "Training", icon: "file-text" },
    { screen: "me", label: "Me", icon: "user" },
  ],
  platform_admin: [
    { screen: "platform.users", label: "Users", icon: "users" },
    { screen: "platform.roles", label: "Roles", icon: "lock" },
    { screen: "platform.audit", label: "Audit", icon: "eye" },
    { screen: "platform.settings", label: "Settings", icon: "translate" },
    { screen: "me", label: "Me", icon: "user" },
  ],
};

/** Screens every signed-in role may open. */
export const SHARED_SCREENS = ["me", "sync", "conflict"];

/** A screen id is "<role prefix>.<name>"; the prefix names the role family that owns it. */
const PREFIX: Record<Role, string[]> = {
  chv: ["chv"], patient: ["patient"], clinician: ["clinician"], pharmacist: ["pharmacist"],
  healer: ["healer"], ghs: ["ghs"], facility_admin: ["facility"], platform_admin: ["platform"],
};

/** Client-side guard. A hidden screen is not a protected screen: the API checks the role again. */
export function canOpen(role: Role, screen: string): boolean {
  if (SHARED_SCREENS.includes(screen)) return true;
  const prefix = screen.split(".")[0];
  return PREFIX[role].includes(prefix);
}

export const homeScreen = (role: Role) => TABS[role][0].screen;
