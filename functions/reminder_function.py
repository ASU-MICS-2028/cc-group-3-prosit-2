"""Lab 7 Part A: sends (for now, logs) the patient's appointment reminder.

Triggered by the `reminders` SQS queue. It knows nothing about the specialist-notify function, and the
API knows nothing about either: that is the decoupling Lab 7 demonstrates. A real SMS (through the
Prosit 1 provider) can replace the log line later; the handout accepts a logged reminder.

Handler: reminder_function.handler · Runtime: Python 3.12
"""

from events import BadMessage, appointment, events, log, mask


def handler(event, context):
    for message_id, body in events(event):
        if body.get("type") != "appointment.created":
            log(function="reminder", message_id=message_id, outcome="ignored", reason=f"event type {body.get('type')!r}")
            continue
        appt = appointment(message_id, body)
        phone = appt.get("patientPhone")
        if not phone:
            # Not an error: the patient hasn't consented to reminders (D-014), so the API sent no phone.
            log(function="reminder", message_id=message_id, appointment_id=appt["appointmentId"],
                outcome="skipped", reason="no consent for appointment reminders")
            continue
        log(function="reminder", message_id=message_id, appointment_id=appt["appointmentId"], outcome="reminder_logged",
            to=mask(phone), starts_at=appt["startsAt"],
            message=f"Reminder queued for {mask(phone)} at {appt['startsAt']}")
    return {"statusCode": 200}


__all__ = ["handler", "BadMessage"]
