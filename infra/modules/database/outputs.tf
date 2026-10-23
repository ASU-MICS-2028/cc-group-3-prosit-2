output "endpoint" {
  description = "host:port — use directly in DATABASE_URL"
  value       = aws_db_instance.main.endpoint
}

output "address" {
  description = "DNS host without port"
  value       = aws_db_instance.main.address
}

output "port" {
  value = aws_db_instance.main.port
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "username" {
  value = aws_db_instance.main.username
}

output "master_user_secret_arn" {
  description = "Secrets Manager ARN holding the auto-generated master password as JSON {username, password}"
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

output "security_group_id" {
  value = aws_security_group.db.id
}

output "identifier" {
  description = "RDS DBInstanceIdentifier — used for CloudWatch metric dimensions"
  value       = aws_db_instance.main.identifier
}

output "arn" {
  value = aws_db_instance.main.arn
}
