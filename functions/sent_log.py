"""L7-H2: remembers which appointments already got a reminder, so a repeated event sends nothing (D-027).

SQS and the API both deliver at least once: an offline phone retries, and SQS hands a message out again if a
function times out. So the same `appointment.created` can arrive twice (Abena's booking on 26 Oct did). The
reminder function claims the appointment id in a DynamoDB table before sending:

    claim(id)  -> True   first time: go ahead and send
               -> False  already claimed: a duplicate, skip it
    release(id)          sending failed: undo the claim so SQS's retry can send

The claim is one conditional write ("only if this id isn't there yet"), which DynamoDB applies atomically, so
two copies arriving at the same moment can't both win. Entries delete themselves after 30 days (TTL).

Known gap: if the function dies after claiming but before sending (e.g. a timeout), the retry sees the claim
and skips, so that reminder is never sent. We chose "at most one reminder" over "maybe two" for that case.
"""

import time

TTL_DAYS = 30


class SentLog:
    def __init__(self, table, client=None):
        self.table = table
        if client is None:
            import boto3  # in the Lambda runtime; imported here so the tests need no AWS libraries

            client = boto3.client("dynamodb")
        self.client = client

    def claim(self, appointment_id):
        now = int(time.time())
        try:
            self.client.put_item(
                TableName=self.table,
                Item={
                    "appointment_id": {"S": appointment_id},
                    "claimed_at": {"N": str(now)},
                    "expires_at": {"N": str(now + TTL_DAYS * 86400)},
                },
                ConditionExpression="attribute_not_exists(appointment_id)",
            )
            return True
        except Exception as error:
            if error_code(error) == "ConditionalCheckFailedException":
                return False
            raise  # anything else (throttling, permissions, wrong table): let SQS retry, then the DLQ

    def release(self, appointment_id):
        self.client.delete_item(TableName=self.table, Key={"appointment_id": {"S": appointment_id}})


def error_code(error):
    """The AWS error code of a botocore ClientError, without importing botocore."""
    return getattr(error, "response", {}).get("Error", {}).get("Code")
