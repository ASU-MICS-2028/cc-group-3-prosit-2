import type { Queryable } from './db.js'

/**
 * One row in `access_log` (FHIR AuditEvent): who tried to touch which patient's record, how, and what
 * happened. Successful access is logged in the same transaction as the work it describes; refused or
 * failed attempts in a transaction of their own (the work's transaction was rolled back). The table
 * itself is append-only (D-013).
 */
export interface AccessEntry {
  accessedBy: string | null
  patientId: string | null
  resourceType: 'Patient' | 'Observation' | 'Consent' | 'Appointment'
  action: 'read' | 'create' | 'update' | 'delete'
  outcome: 'success' | 'denied' | 'not_found' | 'error'
  sourceIp: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function logAccess(q: Queryable, e: AccessEntry) {
  return q.query(
    `INSERT INTO access_log (accessed_by, patient_id, resource_type, action, outcome, source_ip)
     VALUES ($1, $2, $3, $4, $5, $6::inet)`,
    // A patient id the client sent may not be a UUID; never let that break the audit row itself.
    [e.accessedBy, e.patientId && UUID.test(e.patientId) ? e.patientId : null, e.resourceType, e.action, e.outcome, e.sourceIp],
  )
}
