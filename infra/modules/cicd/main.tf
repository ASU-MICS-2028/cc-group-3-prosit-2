terraform {
  required_providers {
    tls = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "gha_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only a workflow run on main may deploy (D-030); a PR or any other branch gets no AWS credentials.
    # The org issues immutable subjects (`repo:ORG@<id>/REPO@<id>:...`); the plain form is kept in case it
    # is ever switched back to the default.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "${var.github_oidc_sub_prefix}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "gha_deploy" {
  name               = "${var.name_prefix}-gha-deploy"
  assume_role_policy = data.aws_iam_policy_document.gha_assume.json
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account = data.aws_caller_identity.current.account_id
  region  = data.aws_region.current.name
}

# Least privilege: push to our image repositories, pin the image tag, refresh our one auto scaling group,
# and restart the container on the call server. Every action names its resource except the ones AWS only
# allows on "*" (the ECR login token and the Describe calls).
data "aws_iam_policy_document" "gha_deploy" {
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = var.ecr_repository_arns
  }
  statement {
    actions   = ["autoscaling:StartInstanceRefresh"]
    resources = ["arn:aws:autoscaling:${local.region}:${local.account}:autoScalingGroup:*:autoScalingGroupName/${var.asg_name}"]
  }
  statement {
    actions   = ["autoscaling:DescribeInstanceRefreshes", "autoscaling:DescribeAutoScalingGroups"]
    resources = ["*"]
  }
  statement {
    # CI pins the deployed image tag here; a rollback rewrites it.
    actions   = ["ssm:PutParameter"]
    resources = [aws_ssm_parameter.app_image_tag.arn]
  }
  dynamic "statement" {
    # Redeploy the call server: re-run its boot script (pull the new image, restart the container) through SSM.
    for_each = var.call_instance_id == "" ? [] : [1]
    content {
      actions = ["ssm:SendCommand"]
      resources = [
        "arn:aws:ec2:${local.region}:${local.account}:instance/${var.call_instance_id}",
        "arn:aws:ssm:${local.region}::document/AWS-RunShellScript",
      ]
    }
  }
  dynamic "statement" {
    for_each = var.call_instance_id == "" ? [] : [1]
    content {
      actions   = ["ssm:GetCommandInvocation", "ec2:DescribeInstances"] # AWS allows these only on "*"
      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "gha_deploy" {
  name   = "${var.name_prefix}-gha-deploy"
  role   = aws_iam_role.gha_deploy.id
  policy = data.aws_iam_policy_document.gha_deploy.json
}

# The single source of truth for which image the app instances pull. Normally
# pinned to a git SHA by CI; roll back by setting an earlier SHA and starting an
# instance refresh (see infra/README.md).
resource "aws_ssm_parameter" "app_image_tag" {
  name        = "/${var.name_prefix}/app-image-tag"
  description = "Image tag (git SHA) the app instances pull. Rollback = set an earlier SHA + refresh the ASG."
  type        = "String"
  value       = var.initial_image_tag

  # CI (and manual rollbacks) rewrite this after creation; don't fight them on
  # later applies. Terraform only seeds the first value.
  lifecycle {
    ignore_changes = [value]
  }
}
