variable "name_prefix" {
  type = string
}

variable "repo_suffix" {
  type        = string
  description = "Repository is named <name_prefix>-<repo_suffix>"
  default     = "backend"
}
