output "bucket_name" {
  value = aws_s3_bucket.site.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.site.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.site.arn
}

output "distribution_domain" {
  description = "Point the hostname's CNAME here"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "cert_validation_records" {
  value = [
    for o in aws_acm_certificate.site.domain_validation_options : { name = o.resource_record_name, type = o.resource_record_type, value = o.resource_record_value }
  ]
}
