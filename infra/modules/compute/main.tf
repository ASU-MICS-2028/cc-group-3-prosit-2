# ---------- EC2 instance role (shared by app ASG + fck-nat) ----------
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${var.name_prefix}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ec2_ecr" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# S3 photo bucket access — scoped to the specific bucket by the storage module.
resource "aws_iam_role_policy" "ec2_media_bucket" {
  name   = "${var.name_prefix}-ec2-media-bucket"
  role   = aws_iam_role.ec2.id
  policy = var.media_bucket_policy_json
}

# Secrets Manager read for exactly the app's secrets (today only the RDS-managed master secret). The app
# reads them at runtime (cached 5 minutes), so no secret value is ever written into user data or the
# container environment.
data "aws_iam_policy_document" "app_secrets_read" {
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.db_master_user_secret_arn]
  }
}

resource "aws_iam_role_policy" "ec2_app_secrets" {
  name   = "${var.name_prefix}-ec2-app-secrets"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.app_secrets_read.json
}

# ---------- app logs → CloudWatch Logs ----------
# The container ships stdout/stderr here via Docker's awslogs driver.
resource "aws_cloudwatch_log_group" "app" {
  name              = "/${var.name_prefix}/app"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "log_write" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [
      aws_cloudwatch_log_group.app.arn,
      "${aws_cloudwatch_log_group.app.arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "ec2_logs" {
  name   = "${var.name_prefix}-ec2-logs"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.log_write.json
}

# Read the image tag CI pins (used to pick which image to run on boot).
data "aws_iam_policy_document" "image_tag_read" {
  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [var.image_tag_param_arn]
  }
}

resource "aws_iam_role_policy" "ec2_image_tag" {
  name   = "${var.name_prefix}-ec2-image-tag"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.image_tag_read.json
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.name_prefix}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ---------- Launch Template + ASG ----------
# `:latest` tag + instance refresh is the simplest working CI loop.
# Swap to immutable SHA tags + SSM parameter when a rollback story is needed.
locals {
  user_data = <<-EOT
    #!/bin/bash
    set -euxo pipefail
    export DEBIAN_FRONTEND=noninteractive

    apt-get update -y
    apt-get install -y ca-certificates curl gnupg unzip

    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    CODENAME=$(. /etc/os-release; echo $VERSION_CODENAME)
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $CODENAME stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io
    systemctl enable --now docker

    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
    unzip -q /tmp/awscliv2.zip -d /tmp
    /tmp/aws/install

    REGION="${var.region}"
    REPO="${var.ecr_repository_url}"

    # Image tag comes from SSM, so a rollback is: put an earlier SHA + refresh.
    TAG=$(aws ssm get-parameter --name "${var.image_tag_param_name}" --region "$REGION" --query Parameter.Value --output text 2>/dev/null || true)
    [ -z "$TAG" ] && TAG=latest
    IMAGE="$REPO:$TAG"

    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REPO"

    # Retry pull in case the first CI build is still in flight.
    for i in 1 2 3 4 5 6; do
      docker pull "$IMAGE" && break || sleep 15
    done

    docker rm -f app 2>/dev/null || true

    # Instance id -> log stream name (IMDSv2).
    TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
    INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)

    docker run -d --restart=always --name app \
      -p ${var.app_port}:${var.app_port} \
      --log-driver=awslogs \
      --log-opt awslogs-group="${aws_cloudwatch_log_group.app.name}" \
      --log-opt awslogs-region="$REGION" \
      --log-opt awslogs-stream="$INSTANCE_ID" \
      -e AWS_REGION="$REGION" \
      -e INSTANCE_ID="$INSTANCE_ID" \
      -e DB_HOST="${var.db_endpoint}" \
      -e DB_NAME="${var.db_name}" \
      -e DB_SECRET_ARN="${var.db_master_user_secret_arn}" \
      "$IMAGE"
  EOT
}

resource "aws_launch_template" "app" {
  name_prefix   = "${var.name_prefix}-lt-"
  image_id      = var.ami_id
  instance_type = var.instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2.name
  }

  vpc_security_group_ids = [var.app_security_group_id]

  metadata_options {
    # The app runs in a Docker bridge network, one network hop beyond the instance. With the default
    # limit of 1 the IMDSv2 token never reaches the container, so the AWS SDK there gets no credentials
    # (S3 photos, Secrets Manager). 2 is the AWS-recommended value for containers on EC2.
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  user_data = base64encode(local.user_data)

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name_prefix}-app" }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "app" {
  name                      = "${var.name_prefix}-asg"
  min_size                  = var.min_size
  max_size                  = var.max_size
  desired_capacity          = var.desired_capacity
  vpc_zone_identifier       = var.private_subnet_ids
  target_group_arns         = [var.target_group_arn]
  health_check_type         = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    # Launch the replacement before terminating the old instance. With desired capacity 1, a minimum of
    # 50% rounds down to zero, so every refresh used to take the API offline for several minutes.
    preferences {
      min_healthy_percentage = 100
      max_healthy_percentage = 200
      instance_warmup        = 180
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.name_prefix}-app"
    propagate_at_launch = true
  }
}

# Target-tracking on ALBRequestCountPerTarget — scales out when sustained
# request volume per instance exceeds target_value (requests per target per
# minute). Better fit than CPU for an IO-bound API: a slow DB call blocks the
# worker without ever burning CPU.
#
# AWS auto-manages the two CloudWatch alarms backing this policy — don't try
# to own them in Terraform.
resource "aws_autoscaling_policy" "request_count" {
  name                   = "${var.name_prefix}-requests-per-target"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${var.alb_arn_suffix}/${var.target_group_arn_suffix}"
    }
    target_value = var.requests_per_target_target_value
  }
}
