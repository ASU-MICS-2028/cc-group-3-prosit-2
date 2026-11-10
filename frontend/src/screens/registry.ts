import { common } from "./common";
import { chv } from "./chv";
import { clinician, facility, ghs, patient, pharmacist, platform } from "./others";
import { healerScreens } from "./healersStock";
import { surveillanceScreens } from "./surveillance";
import { chvData } from "./chvData";
import { syncScreens } from "./syncScreens";
import { callScreens } from "./call";
import { visitScreens } from "./visits";
import { communityScreens } from "./community";
import type { ScreenDef } from "./kit";

/** Every screen of the app, by id ("<role family>.<name>"). Access is decided in auth/roles.ts. */
export const SCREENS: Record<string, ScreenDef> = { ...common, ...chv, ...patient, ...clinician, ...pharmacist, ...healerScreens, ...ghs, ...surveillanceScreens, ...facility, ...platform, ...chvData, ...syncScreens, ...callScreens, ...visitScreens, ...communityScreens };
