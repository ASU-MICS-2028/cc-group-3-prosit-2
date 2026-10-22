variable "name_prefix" {
  type = string
}

variable "bucket_suffix" {
  type        = string
  default     = "media"
  description = "Suffix appended to name_prefix. Final bucket name: <name_prefix>-<bucket_suffix>."
}

variable "noncurrent_version_expiration_days" {
  type        = number
  default     = 30
  description = "Delete old versions this many days after they stop being current. Caps storage cost from overwrites/photo updates."
}
