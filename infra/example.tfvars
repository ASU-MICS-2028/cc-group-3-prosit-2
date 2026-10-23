# Template for terraform.tfvars (which is gitignored).
# Copy to terraform.tfvars and fill in real values. Terraform loads
# terraform.tfvars automatically.

# Emails subscribed to the CloudWatch alarm SNS topic and AWS Budgets
# notifications. Each recipient must confirm the SNS subscription email
# before alarm notifications are delivered.
alarm_email_addresses = ["ops@example.com"]

# Set once the API domain is chosen (S5); empty keeps the ALB on plain HTTP.
# api_hostname = "api.example.com"
