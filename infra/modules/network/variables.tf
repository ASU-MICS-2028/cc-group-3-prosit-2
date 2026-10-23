variable "name_prefix" {
  type        = string
  description = "e.g. healthconnect-dev — used in Name tags"
}

variable "vpc_cidr" {
  type = string
}

variable "azs" {
  type = list(string)
}

variable "public_subnet_cidrs" {
  type = list(string)
}

variable "private_subnet_cidrs" {
  type = list(string)
}

variable "data_subnet_cidrs" {
  type = list(string)
}

variable "nat_eni_id" {
  type        = string
  description = "ENI from the nat module; the private route table targets this for 0.0.0.0/0"
}
