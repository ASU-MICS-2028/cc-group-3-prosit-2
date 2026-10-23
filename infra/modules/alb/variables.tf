variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "app_port" {
  type = number
}

variable "api_hostname" {
  type        = string
  description = "FQDN the ACM cert is issued for (e.g. api.example.com). Empty = no certificate; HTTP only."
}

variable "extra_hostnames" {
  type        = list(string)
  description = "More names on the same certificate (e.g. the call page). Each needs its own listener rule."
  default     = []
}
