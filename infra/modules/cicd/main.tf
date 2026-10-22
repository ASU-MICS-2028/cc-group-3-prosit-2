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
    # ASU-MICS-2028 org uses OIDC subject customization that appends numeric IDs
    # (e.g. `repo:ASU-MICS-2028@326597623/cc-group-3-prosit-1@1363910903:ref:...`),
    # so match both the standard and the ID-suffixed form.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:*",
        "repo:${split("/", var.github_repo)[0]}@*/${split("/", var.github_repo)[1]}@*:*",
      ]
    }
  }
}

resource "aws_iam_role" "gha_deploy" {
  name               = "${var.name_prefix}-gha-deploy"
  assume_role_policy = data.aws_iam_policy_document.gha_assume.json
}

data "aws_iam_policy_document" "gha_deploy" {
  statement {
    actions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = ["*"]
  }
  statement {
    actions = [
      "autoscaling:StartInstanceRefresh",
      "autoscaling:DescribeInstanceRefreshes",
      "autoscaling:DescribeAutoScalingGroups",
    ]
    resources = ["*"]
  }
  statement {
    # CI pins the deployed image tag here; a rollback rewrites it.
    actions   = ["ssm:PutParameter"]
    resources = [aws_ssm_parameter.app_image_tag.arn]
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
