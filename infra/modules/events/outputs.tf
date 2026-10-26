output "topic_arn" {
  value = aws_sns_topic.appointment_events.arn
}

output "function_names" {
  value = { for k, f in aws_lambda_function.function : k => f.function_name }
}

output "log_groups" {
  value = { for k, g in aws_cloudwatch_log_group.function : k => g.name }
}

output "queue_urls" {
  value = { for k, q in aws_sqs_queue.main : k => q.url }
}

output "dlq_urls" {
  value = { for k, q in aws_sqs_queue.dlq : k => q.url }
}
