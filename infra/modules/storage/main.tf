# S3 bucket for patient photos (wounds, skin conditions). Synthetic images only (D-004).
# Per API-CONTRACT.md: the backend uploads server-side (not a presigned URL
# from the browser), so no CORS is needed and the phone never holds bucket
# credentials.

resource "aws_s3_bucket" "media" {
  bucket = "${var.name_prefix}-${var.bucket_suffix}"
  tags   = { Name = "${var.name_prefix}-${var.bucket_suffix}" }
}

# All four blocks required for the bucket to be truly private — AWS deprecated
# the shortcut "acl=private" in favor of this split in 2023.
resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-S3 (AES256). Free. Switch to SSE-KMS later if you want per-request KMS
# auditing in CloudTrail; it costs ~$0.03 per 10k ops.
resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "delete-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }

    # Clean up multipart uploads that stall out and would otherwise accrue cost.
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# IAM policy document the compute module attaches to the EC2 instance role.
# Scoped to this bucket only — no wildcard.
data "aws_iam_policy_document" "app_access" {
  statement {
    sid    = "ReadWriteOwnBucket"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.media.arn}/*"]
  }

  statement {
    sid       = "ListOwnBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn]
  }
}
