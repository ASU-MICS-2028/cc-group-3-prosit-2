variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "public_subnet_id" {
  type        = string
  description = "Public subnet (one AZ) where the fck-nat instance lives"
}

variable "instance_type" {
  type    = string
  default = "t4g.nano"
}

variable "instance_profile_name" {
  type        = string
  description = "Shared EC2 instance profile (so we can SSM-shell into the NAT box)"
}
