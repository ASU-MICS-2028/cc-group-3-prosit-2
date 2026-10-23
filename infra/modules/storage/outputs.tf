output "bucket_name" {
  value = aws_s3_bucket.media.id
}

output "bucket_arn" {
  value = aws_s3_bucket.media.arn
}

output "bucket_domain_name" {
  value = aws_s3_bucket.media.bucket_regional_domain_name
}

output "app_access_policy_json" {
  description = "Inline policy JSON to attach to the EC2 app role for bucket read/write."
  value       = data.aws_iam_policy_document.app_access.json
}
