# Single fck-nat instance in af-south-1a; no HA.
# If this host or its AZ fails, egress breaks until recovery.
# Upgrade path: per-AZ fck-nat (~$6/mo) or back to Managed NAT GW (~$32/mo).
data "aws_ami" "fck_nat" {
  most_recent = true
  owners      = ["568608671756"] # fck-nat publisher

  filter {
    name   = "name"
    values = ["fck-nat-al2023-hvm-1.4.0-*-arm64-ebs"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_security_group" "nat" {
  name        = "${var.name_prefix}-nat-sg"
  description = "fck-nat: all egress; ingress only from VPC CIDR"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name_prefix}-nat-sg" }
}

resource "aws_network_interface" "nat" {
  subnet_id         = var.public_subnet_id
  security_groups   = [aws_security_group.nat.id]
  source_dest_check = false
  tags              = { Name = "${var.name_prefix}-nat-eni" }
}

resource "aws_instance" "nat" {
  ami                  = data.aws_ami.fck_nat.id
  instance_type        = var.instance_type
  iam_instance_profile = var.instance_profile_name

  network_interface {
    network_interface_id = aws_network_interface.nat.id
    device_index         = 0
  }

  metadata_options {
    http_tokens = "required"
  }

  tags = { Name = "${var.name_prefix}-fck-nat" }
}
