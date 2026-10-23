variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "instance_type" {
  type = string
}

variable "app_port" {
  type = number
}

variable "ami_id" {
  type        = string
  description = "Ubuntu AMI resolved from SSM at the root"
}

variable "app_security_group_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "target_group_arn" {
  type = string
}

variable "ecr_repository_url" {
  type = string
}

variable "min_size" {
  type    = number
  default = 1
}

variable "max_size" {
  type    = number
  default = 3
}

variable "desired_capacity" {
  type    = number
  default = 1
}

variable "alb_arn_suffix" {
  type        = string
  description = "ALB arn_suffix (e.g. app/<name>/<id>) — used to build the policy's resource_label"
}

variable "target_group_arn_suffix" {
  type        = string
  description = "Target group arn_suffix (e.g. targetgroup/<name>/<id>)"
}

variable "requests_per_target_target_value" {
  type        = number
  default     = 500
  description = "Target requests per target per minute. ~8 req/s per instance; keeps a t3.micro comfortable."
}

variable "db_endpoint" {
  type        = string
  description = "Postgres host:port — passed to the container as DB_HOST"
  default     = ""
}

variable "db_name" {
  type    = string
  default = ""
}

variable "db_master_user_secret_arn" {
  type        = string
  description = "Secrets Manager ARN with the DB master credentials. EC2 role gets GetSecretValue on just this ARN."
  default     = ""
}


variable "media_bucket_policy_json" {
  type        = string
  description = "Inline IAM policy JSON from the storage module, attached to the EC2 role for S3 read/write"
  default     = ""
}


variable "log_retention_days" {
  type        = number
  description = "Retention for the app's CloudWatch log group."
  default     = 14
}








variable "image_tag_param_name" {
  type        = string
  description = "SSM parameter holding the image tag the container pulls."
  default     = ""
}

variable "image_tag_param_arn" {
  type        = string
  description = "ARN of the image-tag parameter (EC2 role gets ssm:GetParameter on just this one)."
  default     = ""
}


