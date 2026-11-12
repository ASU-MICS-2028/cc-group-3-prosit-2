# Admin guide

For the two admin roles in the HealthConnect app: the **health centre admin** (runs one facility) and the **platform admin** (runs the whole system). Open https://app-hc.agroconnect.space, sign in, and set your PIN the first time. All data in this deployment is made up (D-034).

## Health centre admin

You see your own facility only. The server enforces this, not just the screen (FB-10c).

| Tab | What you do there |
|---|---|
| **Home** | Low-stock card, and tiles for Reports, Emergencies and Quality review |
| **People** | Who works at your facility, and whether their account is on. To add someone, ask the platform admin |
| **Stock** | **Save count** after a stock take. **Add an item** with its unit and a reorder level. When an item drops to its reorder level it shows as low stock. **Move stock** to another facility; "Short elsewhere" lists facilities running low. Every move is listed with who made it |
| **Training** | Course progress for your staff. Sample content: the training library is not built yet |
| Reports (from Home) | The SDG 3 indicators for your facility. Download a FHIR-, DHIS2- or WHO-shaped file. These are sandbox formats, not checked against the official validators |
| Emergencies (from Home) | Emergencies escalated to the facility, most urgent first. Tap **I'm on it** to acknowledge one so it stops escalating |
| Quality review (from Home) | Consultations recorded with both sides' consent. Add a note and **Save review**. The recording itself stays on the doctor's phone |

## Platform admin

| Tab | What you do there |
|---|---|
| **Users** | Every account, its role, facility, and whether it is locked or switched off. **Switch off** an account to stop it signing in; **Switch on** to restore it. You can't switch yourself off |
| **Roles** | What each role should be able to reach. Read-only: roles are enforced by the API and the database |
| **Audit** | Who opened, added, changed or removed what, and whether it was allowed or refused. It holds no health data |
| **Settings** | Emergency escalation time, reminder language, Test mode (read-only in this version). Links to **Revenue** (successful payments only: fees and premiums) and **SDG 3 and exports** (every facility) |

**Adding accounts:** there is no "add user" screen yet. Test accounts are created by `backend/scripts/seed-test-users.ts` (Eugene runs it against RDS); real accounts would need a licence check first (GMDC for doctors).

## Everyone

- **Me** tab: language (English and Twi complete; Ewe, Dagbani and Hausa show English until filled), text size up to 200%, fingerprint unlock, sign out.
- **What's waiting to send** (from Me): records saved on this phone that haven't reached the server yet.

Something wrong? Note the time and what you tapped, and tell the team. The audit log will show what the server saw.
