variable "name_prefix" {
  type = string
}

variable "data_subnet_ids" {
  type        = list(string)
  description = "Isolated private-data subnet IDs — these have NO default route, so the DB cannot egress to the internet."
}

variable "app_security_group_id" {
  type        = string
  description = "App-tier SG. Only ingress source allowed on 5432."
}

variable "db_name" {
  type    = string
  default = "healthconnect"
}

variable "master_username" {
  type    = string
  default = "healthconnect_admin"
}

variable "instance_class" {
  type        = string
  default     = "db.t4g.micro"
  description = "Cheapest Postgres-capable class in af-south-1 (ARM Graviton, 2 vCPU, 1 GiB RAM). ~$12/mo."
}

variable "engine_version" {
  type    = string
  default = "16.15"
}

variable "allocated_storage_gb" {
  type        = number
  default     = 20
  description = "Minimum RDS allocation. gp3 pricing kicks in above 20."
}

variable "max_allocated_storage_gb" {
  type        = number
  default     = 100
  description = "Autoscale ceiling. No cost unless growth exceeds allocated_storage_gb."
}

variable "backup_retention_days" {
  type    = number
  default = 7
}
