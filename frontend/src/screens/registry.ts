import { common } from "./common";
import { chv } from "./chv";
import { clinician, facility, ghs, healer, patient, pharmacist, platform } from "./others";
import { surveillanceScreens } from "./surveillance";
import { chvData } from "./chvData";
import { syncScreens } from "./syncScreens";
import { callScreens } from "./call";
import { visitScreens } from "./visits";
import { careScreens } from "./referrals";
import type { ScreenDef } from "./kit";

/** Every screen of the app, by id ("<role family>.<name>"). Access is decided in auth/roles.ts. */
export const SCREENS: Record<string, ScreenDef> = { ...common, ...chv, ...patient, ...clinician, ...pharmacist, ...healer, ...ghs, ...surveillanceScreens, ...facility, ...platform, ...chvData, ...syncScreens, ...callScreens, ...visitScreens, ...careScreens };
