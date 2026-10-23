# Remote state. Reuses the S3 state bucket bootstrapped for Prosit 1 (infra/bootstrap/), under a new key,
# so HealthConnect's state never mixes with AgroConnect's.
#
# After changing this block: terraform init -migrate-state

terraform {
  backend "s3" {
    bucket       = "agroconnect-tfstate-315224414532"
    key          = "healthconnect/dev/terraform.tfstate"
    region       = "af-south-1"
    encrypt      = true
    use_lockfile = true
    profile      = "ashesi-dev"
  }
}
