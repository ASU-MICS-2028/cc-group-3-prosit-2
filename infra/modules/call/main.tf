# The Lab 7 WebRTC call page + signaling server (webrtc-spike/) on ONE instance behind the shared ALB.
#
# Exactly one, on purpose: the signaling server keeps rooms in memory, so two people in the same call must reach
# the same process. Behind the app's two-instance ASG they could land on different instances and never meet.
# The ALB sends https://<hostname> here by host header; WebSockets (wss://<hostname>/ws) pass through the ALB.

data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# ---------- its own role: pull its image, ship its logs, allow SSM sessions. Nothing else. ----------
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "call" {
  name               = "${var.name_prefix}-call-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.call.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr" {
  role       = aws_iam_role.call.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_cloudwatch_log_group" "call" {
  name              = "/${var.name_prefix}/call"
  retention_in_days = 14
}

data "aws_iam_policy_document" "logs" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = [aws_cloudwatch_log_group.call.arn, "${aws_cloudwatch_log_group.call.arn}:*"]
  }
}

resource "aws_iam_role_policy" "logs" {
  name   = "${var.name_prefix}-call-logs"
  role   = aws_iam_role.call.id
  policy = data.aws_iam_policy_document.logs.json
}

resource "aws_iam_instance_profile" "call" {
  name = "${var.name_prefix}-call-profile"
  role = aws_iam_role.call.name
}

# ---------- network: only the ALB may reach the app port ----------
resource "aws_security_group" "call" {
  name        = "${var.name_prefix}-call-sg"
  description = "Call server: app port in from ALB only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.port
    to_port         = var.port
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name_prefix}-call-sg" }
}

# ---------- the instance ----------
locals {
  # Amazon Linux 2023 ships the AWS CLI; Docker is one dnf install. The pull retries for ~10 minutes in case the
  # image is pushed after the instance boots.
  user_data = <<-EOT
    #!/bin/bash
    set -euxo pipefail
    dnf install -y docker
    systemctl enable --now docker

    REPO="${var.ecr_repository_url}"
    IMAGE="$REPO:latest"
    for i in $(seq 1 40); do
      aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin "$REPO" \
        && docker pull "$IMAGE" && break || sleep 15
    done

    TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
    INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)

    docker run -d --restart=always --name call \
      -p ${var.port}:${var.port} \
      -e PORT=${var.port} \
      --log-driver=awslogs \
      --log-opt awslogs-group="${aws_cloudwatch_log_group.call.name}" \
      --log-opt awslogs-region="${var.region}" \
      --log-opt awslogs-stream="$INSTANCE_ID" \
      "$IMAGE"
  EOT
}

resource "aws_instance" "call" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.call.id]
  iam_instance_profile   = aws_iam_instance_profile.call.name
  user_data              = local.user_data

  metadata_options {
    http_tokens = "required"
  }

  tags = { Name = "${var.name_prefix}-call" }

  # A new AMI release must not replace the server mid-lab; refresh it deliberately with -replace.
  lifecycle {
    ignore_changes = [ami]
  }
}

# ---------- load balancer wiring ----------
resource "aws_lb_target_group" "call" {
  name     = "${var.name_prefix}-call-tg"
  port     = var.port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group_attachment" "call" {
  target_group_arn = aws_lb_target_group.call.arn
  target_id        = aws_instance.call.id
  port             = var.port
}

resource "aws_lb_listener_rule" "call" {
  listener_arn = var.https_listener_arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.call.arn
  }

  condition {
    host_header {
      values = [var.hostname]
    }
  }
}
