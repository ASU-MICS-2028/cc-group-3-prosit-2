variable "name_prefix" {
  type = string
}

variable "github_repo" {
  type        = string
  description = "org/repo (e.g. ASU-MICS-2028/cc-group-3-prosit-1)"
}

variable "initial_image_tag" {
  type        = string
  description = "Initial value of the app-image-tag parameter, before the first CI deploy overwrites it."
  default     = "latest"
}
