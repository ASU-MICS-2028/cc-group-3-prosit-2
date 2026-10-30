/** FHIR R4-shaped records (decision D-016), kept to what this app needs. Codes and plausible ranges
 *  are the same as db/migrations/002_loinc_reference.sql: the phone catches typing errors early,
 *  the database stays the authority. */

export const LOINC_SYSTEM = "http://loinc.org";
export const UCUM_SYSTEM = "http://unitsofmeasure.org";
export const PURPOSE_SYSTEM = "https://healthconnect.example/consent-purpose";
export const EXT_CONSENT = "https://healthconnect.example/observation-consent";
export const EXT_GROUP = "https://healthconnect.example/observation-group";
export const EXT_WITHDRAWN = "https://healthconnect.example/consent-withdrawn-at";

export type Vital = "temperature" | "systolic" | "diastolic" | "weight" | "height";
export const LOINC: Record<Vital, { code: string; label: string; ucum: string; display: string; min: number; max: number }> = {
  temperature: { code: "8310-5", label: "Body temperature", ucum: "Cel", display: "°C", min: 25, max: 45 },
  systolic: { code: "8480-6", label: "Systolic blood pressure", ucum: "mm[Hg]", display: "mmHg", min: 40, max: 300 },
  diastolic: { code: "8462-4", label: "Diastolic blood pressure", ucum: "mm[Hg]", display: "mmHg", min: 20, max: 200 },
  weight: { code: "29463-7", label: "Body weight", ucum: "kg", display: "kg", min: 0.3, max: 350 },
  height: { code: "8302-2", label: "Body height", ucum: "cm", display: "cm", min: 20, max: 250 },
};
export const VITAL_BY_CODE = Object.fromEntries(Object.entries(LOINC).map(([k, v]) => [v.code, k as Vital])) as Record<string, Vital>;

export type Purpose = "clinical_care" | "appointment_reminders" | "health_advisory";
export const PURPOSES: readonly Purpose[] = ["clinical_care", "appointment_reminders", "health_advisory"];
export type GivenBy = "patient" | "guardian" | "chv_on_behalf";
export type Gender = "male" | "female" | "other" | "unknown";

export type Ref = { reference: string };
type Coding = { system: string; code: string; display?: string };

export type Patient = {
  resourceType: "Patient";
  id: string;
  name: [{ text: string }];
  gender?: Gender;
  birthDate?: string;
  address?: [{ city: string }];
  telecom?: [{ system: "phone"; value: string }];
  communication?: [{ language: { text: string } }];
};

export type Consent = {
  resourceType: "Consent";
  id: string;
  status: "active" | "inactive";
  scope: { coding: [Coding] };
  category: [{ coding: [Coding] }];
  patient: Ref;
  dateTime: string;
  performer: [{ display: GivenBy }];
  extension?: { url: string; valueDateTime: string }[];
};

export type Observation = {
  resourceType: "Observation";
  id: string;
  status: "final" | "amended" | "entered-in-error";
  category: [{ coding: [Coding] }];
  code: { coding: [Coding] };
  subject: Ref;
  effectiveDateTime: string;
  performer?: Ref[];
  valueQuantity: { value: number; unit: string; system: string; code: string };
  extension: ({ url: string; valueReference: Ref } | { url: string; valueString: string })[];
};

export type MediaKind = "photo" | "voice";
export type Media = {
  resourceType: "Media";
  id: string;
  status: "completed" | "entered-in-error";
  type: { coding: [{ system: string; code: "image" | "audio" }] };
  subject: Ref;
  createdDateTime: string;
  content: { contentType: string; size: number; data: string };
};

export type Resource = Patient | Consent | Observation | Media;

export const newId = (): string =>
  crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/[x]/g, () => (crypto.getRandomValues(new Uint8Array(1))[0] & 15).toString(16));

export const consentPurpose = (c: Consent): Purpose => c.category[0].coding[0].code as Purpose;
export const consentWithdrawnAt = (c: Consent): string | undefined => c.extension?.find((e) => e.url === EXT_WITHDRAWN)?.valueDateTime;
export const observationConsentId = (o: Observation): string | undefined => {
  const e = o.extension.find((x) => x.url === EXT_CONSENT);
  return e && "valueReference" in e ? e.valueReference.reference.replace("Consent/", "") : undefined;
};
export const observationGroup = (o: Observation): string | undefined => {
  const e = o.extension.find((x) => x.url === EXT_GROUP);
  return e && "valueString" in e ? e.valueString : undefined;
};

export const toBase64 = (b: Uint8Array): string => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export const fromBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
