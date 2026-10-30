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

variable "github_oidc_sub_prefix" {
  type        = string
  description = "The org's immutable OIDC subject prefix: gh api repos/<org>/<repo>/actions/oidc/customization/sub"
}

variable "ecr_repository_arns" {
  type        = list(string)
  description = "Image repositories CI may push to"
}

variable "asg_name" {
  type        = string
  description = "The one auto scaling group CI may refresh"
}

variable "call_instance_id" {
  type        = string
  description = "Call server CI may redeploy through SSM; empty when the call server is off"
  default     = ""
}
