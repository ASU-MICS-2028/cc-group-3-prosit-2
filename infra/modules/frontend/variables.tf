variable "name_prefix" {
  type = string
}

variable "hostname" {
  type        = string
  description = "FQDN the PWA is served at (CNAME at Hostinger to the distribution)"
}
