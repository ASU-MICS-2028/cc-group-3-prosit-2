import { pino } from 'pino'

/**
 * JSON logs for CloudWatch. Silent under test so the test output stays readable.
 * Authorization headers and cookies never belong in a log line.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'patient-record-service' },
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
})
