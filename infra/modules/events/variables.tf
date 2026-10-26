variable "name_prefix" {
  type = string
}

variable "functions_dir" {
  type        = string
  description = "Path to functions/ (the Python handlers and their shared events.py)"
}

variable "log_retention_days" {
  type    = number
  default = 14
}
