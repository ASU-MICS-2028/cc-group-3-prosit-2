// Creates the eight test sign-ins, one per role in the brief, with the same ids and names as the app's
// demo accounts. Synthetic people only (D-004). Safe to run again; it resets their password and unlocks them.
//   DATABASE_URL=... TEST_USER_PASSWORD=<12+ characters, kept out of the repo> npm run seed:test-users
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { dbFromPool, type Queryable, type Db } from '../src/db.js'
import { hashPassword } from '../src/passwords.js'

const SYSTEM_ID = '00000000-0000-0000-0000-000000000000'
const PATIENT_ID = '00000000-0000-4000-8000-000000000002'
const PHARMACY_ID = '00000000-0000-4000-8000-000000000021'
const CLINIC_ID = '00000000-0000-4000-8000-000000000022'

/** username (the app's role name) → database role, id and name */
export const TEST_USERS = [
  { username: 'chv', role: 'chv', id: '00000000-0000-4000-8000-000000000001', name: 'Ama Serwaa', facility: 'Dodowa clinic area' },
  { username: 'patient', role: 'patient', id: '00000000-0000-4000-8000-000000000012', name: 'Akosua Boateng', facility: null, patientId: PATIENT_ID },
  { username: 'clinician', role: 'doctor', id: '00000000-0000-4000-8000-000000000003', name: 'Dr. Kofi Mensah', facility: 'Korle Bu (test)' },
  { username: 'pharmacist', role: 'pharmacist', id: '00000000-0000-4000-8000-000000000004', name: 'Efua Darko', facility: 'Test pharmacy' },
  { username: 'healer', role: 'traditional_healer', id: '00000000-0000-4000-8000-000000000005', name: 'Nana Yaw Asare', facility: 'Kintampo area' },
  { username: 'ghs', role: 'ghs_official', id: '00000000-0000-4000-8000-000000000006', name: 'Adwoa Frimpong', facility: 'Greater Accra region' },
  { username: 'facility_admin', role: 'health_centre_admin', id: '00000000-0000-4000-8000-000000000007', name: 'Kwabena Ofori', facility: 'Dodowa clinic area' },
  { username: 'platform_admin', role: 'admin', id: '00000000-0000-4000-8000-000000000008', name: 'Team Admin', facility: null },
]

export async function seedTestUsers(db: Db, password: string) {
  if (password.length < 12) throw new Error('TEST_USER_PASSWORD must be at least 12 characters')
  const hash = await hashPassword(password)
  await db.withTransaction(SYSTEM_ID, async (q: Queryable) => {
    await q.query(`INSERT INTO patients (id, full_name) VALUES ($1, 'Akosua Boateng') ON CONFLICT (id) DO NOTHING`, [PATIENT_ID])
    await q.query(`INSERT INTO facilities (id, name, type, region, district) VALUES ($1, 'Test pharmacy', 'pharmacy', 'Greater Accra', 'Shai Osudoku') ON CONFLICT (id) DO NOTHING`, [PHARMACY_ID])
    await q.query(`INSERT INTO facilities (id, name, type, region, district) VALUES ($1, 'Dodowa clinic area', 'clinic', 'Greater Accra', 'Shai Osudoku') ON CONFLICT (id) DO NOTHING`, [CLINIC_ID])
    for (const u of TEST_USERS) {
      await q.query(
        `INSERT INTO practitioners (id, full_name, role, facility, patient_id) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, facility = EXCLUDED.facility, active = true`,
        [u.id, u.name, u.role, u.facility, u.patientId ?? null],
      )
      await q.query(
        `INSERT INTO practitioner_credentials (practitioner_id, username, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (practitioner_id) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL`,
        [u.id, u.username, hash],
      )
    }
    await q.query(`UPDATE practitioners SET facility_id = $1 WHERE id = $2`, [PHARMACY_ID, TEST_USERS.find((u) => u.username === 'pharmacist')!.id])
    await q.query(`UPDATE practitioners SET facility_id = $1 WHERE id = ANY($2::uuid[])`, [CLINIC_ID, TEST_USERS.filter((u) => u.facility === 'Dodowa clinic area').map((u) => u.id)])
    // The sandbox licence register (D-038): not the real GMDC list.
    await q.query(
      `INSERT INTO prescriber_licences (practitioner_id, licence_number, valid_until) VALUES ($1, 'MDC-TEST-0001', '2030-12-31') ON CONFLICT (practitioner_id) DO NOTHING`,
      [TEST_USERS.find((u) => u.username === 'clinician')!.id],
    )
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { DATABASE_URL: url, TEST_USER_PASSWORD: password } = process.env
  if (!url || !password) {
    console.error('Usage: DATABASE_URL=... TEST_USER_PASSWORD=<12+ characters> npm run seed:test-users')
    process.exit(1)
  }
  const pool = new pg.Pool({ connectionString: url })
  await seedTestUsers(dbFromPool(pool), password)
  await pool.end()
  console.log(`Ready: ${TEST_USERS.map((u) => u.username).join(', ')}`)
}
