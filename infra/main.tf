terraform {
  required_version = ">= 1.10" # S3 native state locking (use_lockfile) needs 1.10
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
    tls = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

provider "aws" {
  region  = var.region
  profile = "ashesi-dev"
  default_tags {
    tags = {
      Project   = var.project
      Env       = var.env
      ManagedBy = "terraform"
      Team      = "highlanders"
    }
  }
}

locals {
  name = "${var.project}-${var.env}"
}

data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

data "aws_caller_identity" "current" {}

# ---------- compute (IAM + ASG + launch template + scaling policy) ----------
# Comes first because `nat` needs the shared instance profile, and `network`
# needs the NAT ENI id.
module "compute" {
  source = "./modules/compute"

  name_prefix             = local.name
  region                  = var.region
  instance_type           = var.instance_type
  app_port                = var.app_port
  ami_id                  = data.aws_ssm_parameter.ubuntu.value
  app_security_group_id   = module.alb.app_security_group_id
  private_subnet_ids      = module.network.private_subnet_ids
  target_group_arn        = module.alb.target_group_arn
  alb_arn_suffix          = module.alb.alb_arn_suffix
  target_group_arn_suffix = module.alb.target_group_arn_suffix
  ecr_repository_url      = module.ecr.repository_url

  # Two instances from the start: the Lab 5 failover demo stops one and the other keeps answering.
  min_size         = 2
  desired_capacity = 2
  max_size         = 4

  # Runtime wiring. The container gets ARNs and settings only; it reads secret values itself.
  db_endpoint               = module.database.endpoint
  db_name                   = module.database.db_name
  db_master_user_secret_arn = module.database.master_user_secret_arn
  media_bucket_policy_json  = module.storage.app_access_policy_json
  image_tag_param_name      = module.cicd.image_tag_param_name
  image_tag_param_arn       = module.cicd.image_tag_param_arn
}

# ---------- nat (fck-nat instance for private-tier egress) ----------
module "nat" {
  source = "./modules/nat"

  name_prefix           = local.name
  vpc_id                = module.network.vpc_id
  vpc_cidr              = module.network.vpc_cidr
  public_subnet_id      = module.network.public_subnet_ids[0]
  instance_type         = var.nat_instance_type
  instance_profile_name = module.compute.instance_profile_name
}

# ---------- network (VPC + subnets + route tables) ----------
module "network" {
  source = "./modules/network"

  name_prefix          = local.name
  vpc_cidr             = var.vpc_cidr
  azs                  = var.azs
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  data_subnet_cidrs    = var.data_subnet_cidrs
  nat_eni_id           = module.nat.eni_id
}

# ---------- ecr (container registry) ----------
module "ecr" {
  source      = "./modules/ecr"
  name_prefix = local.name
}

# ---------- database (RDS Postgres in the isolated data subnets) ----------
module "database" {
  source = "./modules/database"

  name_prefix           = local.name
  data_subnet_ids       = module.network.data_subnet_ids
  app_security_group_id = module.alb.app_security_group_id
}

# ---------- storage (S3 bucket for patient photos: wounds, skin conditions) ----------
module "storage" {
  source = "./modules/storage"

  name_prefix = local.name
}

# ---------- alb (ALB + SGs + target group + listeners; ACM cert once api_hostname is set) ----------
module "alb" {
  source = "./modules/alb"

  name_prefix       = local.name
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  app_port          = var.app_port
  api_hostname      = var.api_hostname
  extra_hostnames   = compact([var.call_hostname])
}

# ---------- call (Lab 7 WebRTC call page + signaling on one instance; torn down after Lab 7) ----------
locals {
  call_enabled = var.call_hostname != "" && var.api_hostname != ""
}

module "ecr_call" {
  source      = "./modules/ecr"
  count       = local.call_enabled ? 1 : 0
  name_prefix = local.name
  repo_suffix = "call"
}

module "call" {
  source = "./modules/call"
  count  = local.call_enabled ? 1 : 0

  name_prefix           = local.name
  region                = var.region
  vpc_id                = module.network.vpc_id
  subnet_id             = module.network.private_subnet_ids[0]
  alb_security_group_id = module.alb.alb_security_group_id
  https_listener_arn    = module.alb.https_listener_arn
  hostname              = var.call_hostname
  ecr_repository_url    = module.ecr_call[0].repository_url
}

# ---------- cicd (GitHub Actions OIDC + deploy role) ----------
module "cicd" {
  source      = "./modules/cicd"
  name_prefix = local.name
  github_repo = var.github_repo
}

# ---------- observability (SNS topic + CloudWatch alarms + monthly budget) ----------
module "observability" {
  source = "./modules/observability"

  name_prefix                 = local.name
  alarm_email_addresses       = var.alarm_email_addresses
  monthly_budget_warn_usd     = var.monthly_budget_warn_usd
  monthly_budget_critical_usd = var.monthly_budget_critical_usd
  budget_cost_filter_value    = "user:Project$${var.project}"

  alb_arn_suffix          = module.alb.alb_arn_suffix
  target_group_arn_suffix = module.alb.target_group_arn_suffix
  db_instance_identifier  = module.database.identifier
  asg_name                = module.compute.asg_name
  nat_instance_id         = module.nat.instance_id
}
