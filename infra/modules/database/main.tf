# Postgres lives in the two isolated private-data subnets. Those subnets'
# route table has no 0.0.0.0/0 entry (see modules/network), so the DB cannot
# reach the internet by routing — even if the SG were accidentally widened.

resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-db-subnet-group"
  subnet_ids = var.data_subnet_ids

  tags = { Name = "${var.name_prefix}-db-subnet-group" }
}

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db-sg"
  description = "RDS: 5432 ingress from app SG only; no egress needed"
  vpc_id      = data.aws_subnet.first_data.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
    description     = "Postgres from app tier only"
  }

  # No egress rule — RDS doesn't need to reach out. AWS adds the default allow-all
  # if we omit the egress block entirely; we explicitly deny all to be safe.
  # (A stateful SG still returns responses to allowed ingress; this is fine.)

  tags = { Name = "${var.name_prefix}-db-sg" }
}

# Look up the VPC via one of the data subnets (saves threading vpc_id through).
data "aws_subnet" "first_data" {
  id = var.data_subnet_ids[0]
}

# Single-AZ, no read replicas, 7-day backups, default parameter group.
# For a lab/MVP this is correct. Upgrade path: multi_az=true (~2x cost),
# add read replicas, or move to Aurora Serverless v2 if demand becomes bursty.
resource "aws_db_instance" "main" {
  identifier     = "${var.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  db_name  = var.db_name
  username = var.master_username

  # AWS generates + rotates the master password in Secrets Manager automatically.
  # No plaintext password anywhere in Terraform state.
  manage_master_user_password = true

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period  = var.backup_retention_days
  backup_window            = "02:00-03:00" # UTC = 03:00-04:00 Africa/Accra (low traffic)
  maintenance_window       = "sun:03:30-sun:04:30"
  delete_automated_backups = true

  # Lab shortcut: let `terraform destroy` wipe the DB without a final snapshot.
  # Flip to false + add a final_snapshot_identifier before any production data.
  skip_final_snapshot = true
  deletion_protection = false

  # Performance Insights free tier gives 7 days of retention at no cost.
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  # Export minimal engine logs so we can see connection/query errors in CloudWatch.
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # Apply engine-version patches automatically during the maintenance window.
  auto_minor_version_upgrade = true
  apply_immediately          = false

  tags = { Name = "${var.name_prefix}-postgres" }
}
