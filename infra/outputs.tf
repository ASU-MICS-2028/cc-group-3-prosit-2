output "alb_dns" {
  value = module.alb.alb_dns
}

output "api_url" {
  value = var.api_hostname != "" ? "https://${var.api_hostname}" : "http://${module.alb.alb_dns}"
}

output "cert_validation_records" {
  description = "Publish these CNAMEs at the DNS host so the API certificate issues (S5)"
  value       = module.alb.cert_validation_records
}

output "ecr_repo_url" {
  value = module.ecr.repository_url
}

output "asg_name" {
  value = module.compute.asg_name
}

output "gha_role_arn" {
  value = module.cicd.gha_role_arn
}

output "aws_region" {
  value = var.region
}

output "data_subnet_ids" {
  value = module.network.data_subnet_ids
}

output "nat_instance_id" {
  value = module.nat.instance_id
}

output "aws_account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "db_endpoint" {
  value = module.database.endpoint
}

output "db_name" {
  value = module.database.db_name
}

output "db_master_user_secret_arn" {
  description = "Secrets Manager ARN with JSON {username, password}. Rotated by RDS."
  value       = module.database.master_user_secret_arn
}

output "media_bucket_name" {
  value = module.storage.bucket_name
}

output "alarm_topic_arn" {
  description = "SNS topic for CloudWatch alarms. Add email/Slack subscriptions here."
  value       = module.observability.alarm_topic_arn
}

output "observability_dashboard_url" {
  value = module.observability.dashboard_url
}

output "app_log_group_name" {
  value = module.compute.app_log_group_name
}
