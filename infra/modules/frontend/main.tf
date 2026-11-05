# The PWA (frontend/) as static files: a private S3 bucket behind CloudFront, at https://<hostname> (D-033).
# No servers: the build is plain files, so this costs about $0 at our traffic (CloudFront's
# always-free tier is 1 TB and 10 million requests a month) and deploys in seconds.
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1] # CloudFront only accepts certificates from us-east-1
    }
  }
}

# ---------- bucket: private, CloudFront is the only reader ----------
resource "aws_s3_bucket" "site" {
  bucket        = "${var.name_prefix}-frontend"
  force_destroy = true # holds only build output, rebuilt from git on every deploy
  tags          = { Name = "${var.name_prefix}-frontend" }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name_prefix}-frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "site" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json
}

# ---------- certificate (us-east-1), validated by a CNAME at Hostinger ----------
resource "aws_acm_certificate" "site" {
  provider          = aws.us_east_1
  domain_name       = var.hostname
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

# Blocks until the validation CNAME (output `frontend_cert_validation_records`) is published at Hostinger.
resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for o in aws_acm_certificate.site.domain_validation_options : o.resource_record_name]
}

# ---------- routing: app pages are client-side routes ----------
# /login, /app/<screen> have no file of their own; send them index.html. Paths with a dot (files) pass through,
# so a missing script is a real 404, never index.html served as JavaScript.
resource "aws_cloudfront_function" "spa" {
  name    = "${var.name_prefix}-frontend-spa"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var req = event.request;
      if (req.uri.indexOf(".") === -1) req.uri = "/index.html";
      return req;
    }
  JS
}

# ---------- CDN ----------
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized" # honours the Cache-Control the deploy sets on each file
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy" # HSTS, nosniff, frame-options, referrer-policy
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name_prefix} PWA"
  aliases             = [var.hostname]
  default_root_object = "index.html"
  http_version        = "http2and3"
  # Includes the African edges (Lagos, Nairobi, Johannesburg); PriceClass_100 would serve Ghana from Europe.
  price_class = "PriceClass_200"

  origin {
    origin_id                = "s3"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id           = "s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
