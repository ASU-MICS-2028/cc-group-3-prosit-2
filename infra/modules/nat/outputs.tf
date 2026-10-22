output "eni_id" {
  value = aws_network_interface.nat.id
}

output "instance_id" {
  value = aws_instance.nat.id
}

output "security_group_id" {
  value = aws_security_group.nat.id
}
