/**
 * The database's role names and the phone app's differ (migration 004). The API checks database names
 * everywhere and translates only what goes out to the app, here and nowhere else.
 * `system` isn't listed: it owns migration rows and can never sign in.
 */
const APP_ROLE: Record<string, string> = {
  chv: 'chv',
  patient: 'patient',
  nurse: 'clinician',
  doctor: 'clinician',
  specialist: 'clinician',
  pharmacist: 'pharmacist',
  traditional_healer: 'healer',
  ghs_official: 'ghs',
  health_centre_admin: 'facility_admin',
  admin: 'platform_admin',
}

export const appRole = (databaseRole: string): string | null => APP_ROLE[databaseRole] ?? null
