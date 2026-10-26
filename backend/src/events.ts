import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'
import { logger } from './logging.js'

/**
 * Publishes domain events (Lab 7: `appointment.created`) without knowing who listens. The API never
 * calls the reminder or specialist-notify functions directly; it publishes once and SNS fans the event
 * out to one SQS queue per function (ADR D-010).
 */
export interface EventPublisher {
  publish(type: string, payload: Record<string, unknown>): Promise<void>
}

/** SNS topic publisher. The message body is the event JSON; `type` is also a message attribute for filtering. */
export function snsPublisher(topicArn: string, region: string): EventPublisher {
  const client = new SNSClient({ region })
  return {
    async publish(type, payload) {
      await client.send(new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify({ type, ...payload }),
        MessageAttributes: { type: { DataType: 'String', StringValue: type } },
      }))
    },
  }
}

/** Used when no topic is configured: nothing is sent, and the log says so. */
export const noPublisher: EventPublisher = {
  async publish(type) {
    logger.warn({ type }, 'event not published: APPOINTMENT_TOPIC_ARN is not set')
    throw new Error('No event topic configured')
  },
}
