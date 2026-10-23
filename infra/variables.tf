variable "project" {
  type    = string
  default = "healthconnect"
}

variable "env" {
  type    = string
  default = "dev"
}

variable "region" {
  type    = string
  default = "af-south-1"
}

variable "azs" {
  type    = list(string)
  default = ["af-south-1a", "af-south-1b"]
}

# 10.30/16 doesn't overlap AgroConnect's 10.20/16, so the two could be peered later (D-003).
variable "vpc_cidr" {
  type    = string
  default = "10.30.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.30.1.0/24", "10.30.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.30.11.0/24", "10.30.12.0/24"]
}

variable "data_subnet_cidrs" {
  type    = list(string)
  default = ["10.30.21.0/24", "10.30.22.0/24"]
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "nat_instance_type" {
  type    = string
  default = "t4g.nano"
}

variable "app_port" {
  type    = number
  default = 8000
}

variable "github_repo" {
  description = "org/repo for GitHub Actions OIDC trust"
  type        = string
  default     = "ASU-MICS-2028/cc-group-3-prosit-2"
}

# S5: subdomains of agroconnect.space (ours, DNS at Hostinger). See docs/ for the ADR.
variable "api_hostname" {
  description = "FQDN for the API's TLS certificate. Empty = HTTP only on the ALB's own DNS name."
  type        = string
  default     = "api-hc.agroconnect.space"
}

variable "call_hostname" {
  description = "FQDN for the Lab 7 call page (webrtc-spike). Empty = no call server. Needs api_hostname (shares its certificate)."
  type        = string
  default     = "call-hc.agroconnect.space"
}

variable "alarm_email_addresses" {
  description = "Emails subscribed to the CloudWatch alarm SNS topic and the AWS Budgets notifications. Set these in terraform.tfvars (gitignored); each recipient must confirm the SNS email before alarms arrive."
  type        = list(string)
  default     = []
}

variable "monthly_budget_warn_usd" {
  description = "Forecasted monthly spend above this triggers a warning budget notification."
  type        = number
  default     = 50
}

variable "monthly_budget_critical_usd" {
  description = "Actual month-to-date spend above this triggers a critical budget notification (also the budget limit)."
  type        = number
  default     = 100
}
