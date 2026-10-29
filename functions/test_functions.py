"""Tests for both Lambda handlers. Standard library only:  cd functions && python3 -m unittest -v"""

import io
import json
import os
import unittest
import uuid
from contextlib import redirect_stdout
from pathlib import Path

import reminder_function
import specialist_notify_function
from events import BadMessage, mask
from sent_log import TTL_DAYS, SentLog

# The contract: the API's backend tests check it publishes exactly these fields.
EVENT = json.load(open(Path(__file__).parent / "fixtures" / "appointment-created.json"))


def sqs(*bodies):
    return {"Records": [{"messageId": f"m{i}", "body": b if isinstance(b, str) else json.dumps(b)} for i, b in enumerate(bodies)]}


def sns_envelope(event):
    return {"Type": "Notification", "TopicArn": "arn:aws:sns:af-south-1:1:appointment-events", "Message": json.dumps(event)}


def run(handler, event):
    out = io.StringIO()
    with redirect_stdout(out):
        result = handler(event, None)
    return result, [json.loads(line) for line in out.getvalue().splitlines()]


class FakeError(Exception):
    """Shaped like botocore's ClientError: the AWS error code is in .response."""

    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class FakeDynamo:
    """Just enough of the DynamoDB client: a conditional put_item and delete_item on one in-memory table."""

    def __init__(self, fail_with=None):
        self.items, self.fail_with = {}, fail_with

    def put_item(self, TableName, Item, ConditionExpression):
        if self.fail_with:
            raise FakeError(self.fail_with)
        assert ConditionExpression == "attribute_not_exists(appointment_id)"
        key = Item["appointment_id"]["S"]
        if key in self.items:
            raise FakeError("ConditionalCheckFailedException")
        self.items[key] = Item

    def delete_item(self, TableName, Key):
        self.items.pop(Key["appointment_id"]["S"], None)


def fresh_sent_log(**kwargs):
    reminder_function.sent = SentLog("test-reminders-sent", client=FakeDynamo(**kwargs))
    return reminder_function.sent.client


class Reminder(unittest.TestCase):
    def setUp(self):
        fresh_sent_log()

    def tearDown(self):
        reminder_function.sent = None

    def test_logs_a_reminder_with_the_phone_masked(self):
        result, logs = run(reminder_function.handler, sqs(EVENT))
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(logs[0]["outcome"], "reminder_logged")
        self.assertEqual(logs[0]["to"], "+233*****0001")
        self.assertNotIn("+233200000001", json.dumps(logs))  # never the full number

    def test_reads_an_sns_envelope_as_well_as_raw_json(self):
        _, logs = run(reminder_function.handler, sqs(sns_envelope(EVENT)))
        self.assertEqual(logs[0]["appointment_id"], EVENT["appointmentId"])

    def test_skips_without_error_when_there_is_no_consent(self):
        _, logs = run(reminder_function.handler, sqs({**EVENT, "patientPhone": None}))
        self.assertEqual(logs[0]["outcome"], "skipped")

    def test_ignores_other_event_types(self):
        _, logs = run(reminder_function.handler, sqs({**EVENT, "type": "appointment.cancelled"}))
        self.assertEqual(logs[0]["outcome"], "ignored")

    def test_handles_every_record_in_a_batch(self):
        _, logs = run(reminder_function.handler, sqs(EVENT, {**EVENT, "patientPhone": None}))
        self.assertEqual([l["outcome"] for l in logs], ["reminder_logged", "skipped"])

    def test_raises_on_malformed_messages_so_they_reach_the_dead_letter_queue(self):
        for bad in ("not json", "[1, 2]", {**EVENT, "appointmentId": "42"}, {k: v for k, v in EVENT.items() if k != "startsAt"},
                    {"Type": "Notification", "Message": "{broken"}):
            with self.subTest(bad=bad), self.assertRaises(BadMessage), redirect_stdout(io.StringIO()):
                reminder_function.handler(sqs(bad), None)

    def test_an_empty_batch_does_nothing(self):
        self.assertEqual(run(reminder_function.handler, {"Records": []}), ({"statusCode": 200}, []))


class ReminderSentOnce(unittest.TestCase):
    """L7-H2 (D-027): one reminder per appointment, however many times the event arrives."""

    def setUp(self):
        self.table = fresh_sent_log()

    def tearDown(self):
        reminder_function.sent = None

    def test_a_repeated_event_is_skipped_not_sent_twice(self):
        # Abena, 26 Oct: an offline retry published the same appointment twice.
        _, logs = run(reminder_function.handler, sqs(EVENT, EVENT))
        self.assertEqual([l["outcome"] for l in logs], ["reminder_logged", "duplicate_skipped"])

    def test_the_repeat_can_come_much_later_in_another_batch(self):
        run(reminder_function.handler, sqs(EVENT))
        _, logs = run(reminder_function.handler, sqs(sns_envelope(EVENT)))
        self.assertEqual(logs[0]["outcome"], "duplicate_skipped")

    def test_different_appointments_each_get_a_reminder(self):
        other = {**EVENT, "appointmentId": str(uuid.uuid4())}
        _, logs = run(reminder_function.handler, sqs(EVENT, other))
        self.assertEqual([l["outcome"] for l in logs], ["reminder_logged", "reminder_logged"])

    def test_no_consent_claims_nothing(self):
        run(reminder_function.handler, sqs({**EVENT, "patientPhone": None}))
        self.assertEqual(self.table.items, {})

    def test_a_failed_send_releases_the_claim_so_the_retry_sends(self):
        real_send = reminder_function.send
        reminder_function.send = lambda *args: (_ for _ in ()).throw(ConnectionError("SMS provider down"))
        try:
            with self.assertRaises(ConnectionError), redirect_stdout(io.StringIO()):
                reminder_function.handler(sqs(EVENT), None)
        finally:
            reminder_function.send = real_send
        self.assertEqual(self.table.items, {})  # released
        _, logs = run(reminder_function.handler, sqs(EVENT))  # SQS's retry
        self.assertEqual(logs[0]["outcome"], "reminder_logged")

    def test_a_dynamodb_failure_raises_so_sqs_retries(self):
        fresh_sent_log(fail_with="ProvisionedThroughputExceededException")
        with self.assertRaises(FakeError), redirect_stdout(io.StringIO()):
            reminder_function.handler(sqs(EVENT), None)

    def test_without_the_table_setting_it_refuses_instead_of_risking_duplicates(self):
        reminder_function.sent = None
        os.environ.pop("SENT_TABLE", None)
        with self.assertRaisesRegex(RuntimeError, "SENT_TABLE"), redirect_stdout(io.StringIO()):
            reminder_function.handler(sqs(EVENT), None)

    def test_the_claim_expires_after_30_days(self):
        run(reminder_function.handler, sqs(EVENT))
        item = self.table.items[EVENT["appointmentId"]]
        self.assertEqual(int(item["expires_at"]["N"]) - int(item["claimed_at"]["N"]), TTL_DAYS * 86400)


class SpecialistNotify(unittest.TestCase):
    def test_notifies_from_the_same_event_independently(self):
        _, logs = run(specialist_notify_function.handler, sqs(sns_envelope(EVENT)))
        self.assertEqual(logs[0]["outcome"], "specialist_notified")
        self.assertEqual(logs[0]["specialist_id"], EVENT["specialistId"])
        self.assertNotIn("patientPhone", json.dumps(logs))  # the specialist side has no use for the phone

    def test_raises_on_a_missing_specialist(self):
        with self.assertRaises(BadMessage), redirect_stdout(io.StringIO()):
            specialist_notify_function.handler(sqs({**EVENT, "specialistId": None}), None)


class Mask(unittest.TestCase):
    def test_masks_short_and_empty_values_too(self):
        self.assertEqual(mask("+233200000001"), "+233*****0001")
        self.assertEqual(mask("12345"), "****")
        self.assertEqual(mask(None), "****")


if __name__ == "__main__":
    unittest.main()
