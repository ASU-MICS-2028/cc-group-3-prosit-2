import { clearPin } from "../auth/pin";
import { clearFingerprint } from "../auth/webauthn";
import { deleteDb } from "./db";
import { whenSyncIdle } from "./sync";
import { wipeVault } from "./vault";

/** After five wrong tries: the key, the PIN, the fingerprint and the local database are removed, so
 *  nothing can be read. Anything not yet sent is lost (decision of 30 Oct, until the real login service
 *  can bring a person's data back). */
export async function wipeLocalData(userId: string): Promise<void> {
  await whenSyncIdle();                  // a send still running must not write into data that is being removed
  clearPin(userId);
  clearFingerprint(userId);
  wipeVault(userId);
  await deleteDb(userId);
}
