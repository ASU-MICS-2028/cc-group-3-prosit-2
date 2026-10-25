// Signs a sign-in token for a practitioner, for demos and manual tests (there is no login screen yet).
//   JWT_SECRET=<the same secret the API uses> npm run token -- <practitioner uuid> [expiry, default 8h]
import { signToken, signingKey } from '../src/auth.js'

const [id, expiry = '8h'] = process.argv.slice(2)
const key = signingKey(process.env.JWT_SECRET ?? null)
if (!id || !key) {
  console.error('Usage: JWT_SECRET=<secret, 32+ chars> npm run token -- <practitioner uuid> [expiry]')
  process.exit(1)
}
console.log(await signToken(key, id, expiry))
