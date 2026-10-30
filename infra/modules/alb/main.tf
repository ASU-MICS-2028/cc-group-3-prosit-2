data "aws_vpc" "this" {
  id = var.vpc_id
}

resource "aws_security_group" "alb" {
  name = "${var.name_prefix}-alb-sg"
  # NOTE: SG description is ForceNew — editing it replaces the SG (and the ALB
  # that depends on it). Leave as-is; 443 ingress is added via the rule below.
  description = "ALB: public 80 in"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # The ALB only talks to our own targets, so it may only send traffic inside the VPC (Trivy AVD-AWS-0104).
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [data.aws_vpc.this.cidr_block]
  }

  tags = { Name = "${var.name_prefix}-alb-sg" }
}

# App SG lives with the ALB module because its ingress rule references the ALB
# SG. Compute module consumes it via output.
resource "aws_security_group" "app" {
  name        = "${var.name_prefix}-app-sg"
  description = "App: app_port in from ALB only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name_prefix}-app-sg" }
}

resource "aws_lb" "app" {
  name               = "${var.name_prefix}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  # Reject malformed headers instead of forwarding them (request smuggling; Trivy AVD-AWS-0052).
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "app" {
  name     = "${var.name_prefix}-tg"
  port     = var.app_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }
}

locals {
  # HTTPS (certificate + :443 listener + :80 redirect) only once a hostname is chosen (S5).
  # Until then :80 forwards straight to the app on the ALB's own DNS name.
  https = var.api_hostname != ""
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = local.https ? "redirect" : "forward"
    target_group_arn = local.https ? null : aws_lb_target_group.app.arn

    dynamic "redirect" {
      for_each = local.https ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  # Redirect only once the HTTPS listener exists, so there is never a window
  # where :80 points at a :443 that isn't listening yet.
  depends_on = [aws_lb_listener.https]
}

# ---------- ACM cert for the API hostname ----------
resource "aws_acm_certificate" "api" {
  count                     = local.https ? 1 : 0
  domain_name               = var.api_hostname
  subject_alternative_names = var.extra_hostnames
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Blocks until the DNS validation CNAME (published at the DNS host) is visible and
# ACM flips the cert to ISSUED.
resource "aws_acm_certificate_validation" "api" {
  count           = local.https ? 1 : 0
  certificate_arn = aws_acm_certificate.api[0].arn
  validation_record_fqdns = [
    for record in aws_acm_certificate.api[0].domain_validation_options : record.resource_record_name
  ]
}

resource "aws_lb_listener" "https" {
  count             = local.https ? 1 : 0
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
