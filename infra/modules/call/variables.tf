variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_id" {
  type        = string
  description = "A private-app subnet (egress through fck-nat, no public IP)"
}

variable "alb_security_group_id" {
  type = string
}

variable "https_listener_arn" {
  type = string
}

variable "hostname" {
  type        = string
  description = "Host the ALB routes to this server, e.g. call-hc.agroconnect.space"
}

variable "ecr_repository_url" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "port" {
  type    = number
  default = 3000
}
