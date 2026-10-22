output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "backend_config" {
  description = "Copy these into the backend \"s3\" block in ../backend.tf"
  value       = <<-EOT
    bucket       = "${aws_s3_bucket.state.bucket}"
    key          = "agroconnect/dev/terraform.tfstate"
    region       = "${var.region}"
    encrypt      = true
    use_lockfile = true
  EOT
}
