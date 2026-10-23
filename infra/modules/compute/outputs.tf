output "asg_name" {
  value = aws_autoscaling_group.app.name
}

output "launch_template_id" {
  value = aws_launch_template.app.id
}

output "instance_profile_name" {
  value = aws_iam_instance_profile.ec2.name
}

output "ec2_role_arn" {
  value = aws_iam_role.ec2.arn
}

output "scaling_policy_arn" {
  value = aws_autoscaling_policy.request_count.arn
}

output "app_log_group_name" {
  description = "CloudWatch log group the app container ships logs to"
  value       = aws_cloudwatch_log_group.app.name
}
