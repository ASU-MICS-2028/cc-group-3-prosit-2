output "alarm_topic_arn" {
  description = "SNS topic that every alarm and the budget publish to. Subscribe additional endpoints here."
  value       = aws_sns_topic.alarms.arn
}

output "budget_name" {
  value = aws_budgets_budget.monthly.name
}

output "dashboard_name" {
  value = aws_cloudwatch_dashboard.main.dashboard_name
}

output "dashboard_url" {
  value = "https://${data.aws_region.current.name}.console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}
