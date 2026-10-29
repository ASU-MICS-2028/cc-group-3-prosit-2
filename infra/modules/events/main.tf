# Lab 7 Parts A and B (D-010): one `appointment.created` event, two independent consumers.
#
#   API --sns:Publish--> topic appointment-events --+--> SQS reminders          --> Lambda reminder
#                                                   +--> SQS specialist-notify  --> Lambda specialist-notify
#
# SNS gives every queue its own copy; each queue keeps messages safe while its function is down, retries a failing
# message 3 times, then parks it in that queue's dead-letter queue (DLQ) for someone to inspect.

terraform {
  required_providers {
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

locals {
  # queue name => Python module holding `handler` (functions/<module>.py)
  consumers = {
    "reminders"         = "reminder_function"
    "specialist-notify" = "specialist_notify_function"
  }
  lambda_timeout_s = 10
}

resource "aws_sns_topic" "appointment_events" {
  name = "${var.name_prefix}-appointment-events"
}

# ---------- one queue + dead-letter queue per consumer ----------
resource "aws_sqs_queue" "dlq" {
  for_each                  = local.consumers
  name                      = "${var.name_prefix}-${each.key}-dlq"
  message_retention_seconds = 1209600 # 14 days to look at what failed
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "main" {
  for_each                = local.consumers
  name                    = "${var.name_prefix}-${each.key}"
  sqs_managed_sse_enabled = true
  # AWS's rule of thumb: at least 6x the function timeout, so a message isn't handed out again while still running.
  visibility_timeout_seconds = local.lambda_timeout_s * 6
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = 3
  })
}

# Only our topic may put messages into the queue.
data "aws_iam_policy_document" "queue" {
  for_each = local.consumers
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.main[each.key].arn]
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.appointment_events.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "main" {
  for_each  = local.consumers
  queue_url = aws_sqs_queue.main[each.key].id
  policy    = data.aws_iam_policy_document.queue[each.key].json
}

# Raw delivery: the queue gets our event JSON as-is, not wrapped in SNS's envelope (functions/events.py accepts both).
resource "aws_sns_topic_subscription" "queue" {
  for_each             = local.consumers
  topic_arn            = aws_sns_topic.appointment_events.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.main[each.key].arn
  raw_message_delivery = true
  depends_on           = [aws_sqs_queue_policy.main]
}

# ---------- L7-H2 (D-027): one reminder per appointment ----------
# The same event can arrive twice (an offline retry, or SQS redelivering after a timeout). The reminder function
# claims each appointment id here with a conditional write before sending, and skips ids already claimed.
# Pay per request: a few writes a day cost fractions of a cent. Entries delete themselves after 30 days (TTL).
resource "aws_dynamodb_table" "reminders_sent" {
  name         = "${var.name_prefix}-reminders-sent"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "appointment_id"

  attribute {
    name = "appointment_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  server_side_encryption {
    enabled = true # AWS-managed KMS key
  }
}

# ---------- one function per consumer, each with its own role ----------
data "archive_file" "function" {
  for_each    = local.consumers
  type        = "zip"
  output_path = "${path.module}/.build/${each.value}.zip"

  source {
    content  = file("${var.functions_dir}/${each.value}.py")
    filename = "${each.value}.py"
  }
  source {
    content  = file("${var.functions_dir}/events.py")
    filename = "events.py"
  }
  source {
    content  = file("${var.functions_dir}/sent_log.py") # used by the reminder function only; harmless in the other zip
    filename = "sent_log.py"
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "function" {
  for_each           = local.consumers
  name               = "${var.name_prefix}-${each.key}-fn"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_cloudwatch_log_group" "function" {
  for_each          = local.consumers
  name              = "/aws/lambda/${var.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days
}

# Least privilege: read and delete from its own queue, write its own logs. It can't publish, can't see the other
# queue, can't touch the database. Only the reminder function may claim and release ids in reminders-sent.
data "aws_iam_policy_document" "function" {
  for_each = local.consumers
  statement {
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.main[each.key].arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.function[each.key].arn}:*"]
  }
  dynamic "statement" {
    for_each = each.key == "reminders" ? [1] : []
    content {
      actions   = ["dynamodb:PutItem", "dynamodb:DeleteItem"]
      resources = [aws_dynamodb_table.reminders_sent.arn]
    }
  }
}

resource "aws_iam_role_policy" "function" {
  for_each = local.consumers
  name     = "${var.name_prefix}-${each.key}-fn"
  role     = aws_iam_role.function[each.key].id
  policy   = data.aws_iam_policy_document.function[each.key].json
}

resource "aws_lambda_function" "function" {
  for_each         = local.consumers
  function_name    = "${var.name_prefix}-${each.key}"
  role             = aws_iam_role.function[each.key].arn
  runtime          = "python3.12"
  handler          = "${each.value}.handler"
  architectures    = ["arm64"] # Graviton: ~20% cheaper per second; pure Python needs nothing else
  filename         = data.archive_file.function[each.key].output_path
  source_code_hash = data.archive_file.function[each.key].output_base64sha256
  timeout          = local.lambda_timeout_s
  memory_size      = 128

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.function[each.key].name
  }

  dynamic "environment" {
    for_each = each.key == "reminders" ? [1] : []
    content {
      variables = { SENT_TABLE = aws_dynamodb_table.reminders_sent.name }
    }
  }

  depends_on = [aws_iam_role_policy.function]
}

# Batch size 1: a bad message fails (and retries, then goes to the DLQ) alone, without dragging good ones with it.
resource "aws_lambda_event_source_mapping" "queue" {
  for_each         = local.consumers
  event_source_arn = aws_sqs_queue.main[each.key].arn
  function_name    = aws_lambda_function.function[each.key].arn
  batch_size       = 1
}
