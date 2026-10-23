output "instance_id" {
  value = aws_instance.call.id
}

output "target_group_arn" {
  value = aws_lb_target_group.call.arn
}
