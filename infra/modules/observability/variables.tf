variable "name_prefix" {
  type = string
}

variable "alarm_email_addresses" {
  type        = list(string)
  description = "Each gets an SNS confirmation email and must click the link before alarms will reach them."
  default     = []
}

variable "alb_arn_suffix" {
  type        = string
  description = "e.g. app/<name>/<id> — used for ALB metric dimensions"
}

variable "target_group_arn_suffix" {
  type        = string
  description = "e.g. targetgroup/<name>/<id>"
}

variable "db_instance_identifier" {
  type        = string
  description = "RDS DBInstanceIdentifier (not the ARN)"
}

variable "asg_name" {
  type        = string
  description = "Auto Scaling group name — for aggregate StatusCheck across app instances"
}

variable "nat_instance_id" {
  type        = string
  description = "fck-nat EC2 instance ID"
}

variable "monthly_budget_warn_usd" {
  type        = number
  default     = 50
  description = "Forecasted monthly spend above this → warning email"
}

variable "monthly_budget_critical_usd" {
  type        = number
  default     = 100
  description = "Actual month-to-date spend above this → critical email"
}

variable "budget_tag_key" {
  type        = string
  default     = "Project"
  description = "Cost-allocation tag key the budget filters on"
}

variable "budget_cost_filter_value" {
  type        = string
  default     = "user:Project$healthconnect"
  description = "Budget cost filter (TagKeyValue form: user:<Key>$<Value>)"
}
