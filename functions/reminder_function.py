"""Lab 7 Part A: sends (for now, logs) the patient's appointment reminder.

Triggered by the `reminders` SQS queue. It knows nothing about the specialist-notify function, and the
API knows nothing about either: that is the decoupling Lab 7 demonstrates. A real SMS (through the
Prosit 1 provider) can replace the log line later; the handout accepts a logged reminder.

One reminder per appointment (L7-H2, D-027): the same event can arrive twice, so each appointment id is
claimed in the DynamoDB table named by SENT_TABLE before sending (see sent_log.py).

Handler: reminder_function.handler · Runtime: Python 3.12
"""

import os

from events import BadMessage, appointment, events, log, mask
from sent_log import SentLog

sent = None  # created on first use; the tests put a fake here


def sent_log():
    global sent
    if sent is None:
        table = os.environ.get("SENT_TABLE")
        if not table:
            # Fail loudly: without the table we can't tell repeats apart, and would send duplicates.
            raise RuntimeError("SENT_TABLE is not set: the reminders-sent DynamoDB table name")
        sent = SentLog(table)
    return sent


def send(appt, phone, message_id):
    log(function="reminder", message_id=message_id, appointment_id=appt["appointmentId"], outcome="reminder_logged",
        to=mask(phone), starts_at=appt["startsAt"],
        message=f"Reminder queued for {mask(phone)} at {appt['startsAt']}")


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
        if not sent_log().claim(appt["appointmentId"]):
            log(function="reminder", message_id=message_id, appointment_id=appt["appointmentId"],
                outcome="duplicate_skipped", reason="a reminder for this appointment was already sent")
            continue
        try:
            send(appt, phone, message_id)
        except Exception:
            sent_log().release(appt["appointmentId"])  # so SQS's retry can send it
            raise
    return {"statusCode": 200}


__all__ = ["handler", "BadMessage"]
