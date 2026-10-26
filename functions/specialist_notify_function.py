"""Lab 7 Part B: tells the specialist about a new appointment (for now, logs it).

Triggered by its own `specialist-notify` SQS queue, a second copy of the same `appointment.created`
event. Neither function knows the other exists.

Handler: specialist_notify_function.handler · Runtime: Python 3.12
"""

from events import BadMessage, appointment, events, log


def handler(event, context):
    for message_id, body in events(event):
        if body.get("type") != "appointment.created":
            log(function="specialist_notify", message_id=message_id, outcome="ignored", reason=f"event type {body.get('type')!r}")
            continue
        appt = appointment(message_id, body)
        log(function="specialist_notify", message_id=message_id, appointment_id=appt["appointmentId"],
            specialist_id=appt["specialistId"], outcome="specialist_notified", starts_at=appt["startsAt"],
            message=f"Notifying specialist of new appointment #{appt['appointmentId']} at {appt['startsAt']}")
    return {"statusCode": 200}


__all__ = ["handler", "BadMessage"]
