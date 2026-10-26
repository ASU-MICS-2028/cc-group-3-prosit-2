"""Shared by both Lambda functions: read `appointment.created` events out of an SQS batch.

The API publishes once to an SNS topic; SNS copies the event into one SQS queue per function (ADR D-010).
Depending on how a subscription is set up, an SQS message body is either our event JSON itself
("raw message delivery") or SNS's wrapper with the event inside `Message`. We accept both, so the
infrastructure setting can't silently break the functions.
"""

import json
import re

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


class BadMessage(Exception):
    """The message can't be processed. Raising lets SQS retry it, then move it to the dead-letter queue."""


def events(sqs_event):
    """Yields (message_id, event) for every record. Raises BadMessage on anything malformed."""
    for record in sqs_event.get("Records", []):
        message_id = record.get("messageId", "?")
        try:
            body = json.loads(record["body"])
            if isinstance(body, dict) and body.get("Type") == "Notification" and "Message" in body:
                body = json.loads(body["Message"])  # SNS envelope (raw message delivery off)
        except (KeyError, TypeError, json.JSONDecodeError) as error:
            raise BadMessage(f"message {message_id}: body is not JSON ({error})") from error
        if not isinstance(body, dict):
            raise BadMessage(f"message {message_id}: body is not a JSON object")
        yield message_id, body


def appointment(message_id, event):
    """Checks the fields both functions rely on."""
    for field in ("appointmentId", "specialistId"):
        if not UUID.match(str(event.get(field, ""))):
            raise BadMessage(f"message {message_id}: {field} missing or not a UUID")
    if not isinstance(event.get("startsAt"), str):
        raise BadMessage(f"message {message_id}: startsAt missing")
    return event


def mask(phone):
    """Phones never go into logs in full: +233200000001 -> +233******0001."""
    return phone[:4] + "*" * max(len(phone) - 8, 0) + phone[-4:] if phone and len(phone) > 8 else "****"


def log(**fields):
    """One JSON line per event, so CloudWatch Logs Insights can query it."""
    print(json.dumps(fields))
