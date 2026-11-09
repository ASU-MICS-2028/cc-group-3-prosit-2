#!/usr/bin/env bash
# Lab 9 Parts D and E: read-only evidence. Changes nothing in AWS.
# Run from the repo root with the HealthConnect account's AWS credentials and infra/terraform.tfvars.
# Before committing: check the outputs for email addresses or account details you don't want public.
set -u
R=af-south-1; O=$PWD/evidence/lab9
(cd infra && terraform init -input=false -no-color && terraform plan -input=false -lock=false -no-color) > "$O/D-terraform-plan.txt" 2>&1
{
  echo "== EC2 running"; aws ec2 describe-instances --region $R --filters Name=instance-state-name,Values=running --query "Reservations[].Instances[].[InstanceId,Tags[?Key=='Name']|[0].Value,InstanceType]" --output table
  echo "== RDS"; aws rds describe-db-instances --region $R --query "DBInstances[].[DBInstanceIdentifier,DBInstanceClass,DBInstanceStatus]" --output table
  echo "== Load balancers"; aws elbv2 describe-load-balancers --region $R --query "LoadBalancers[].[LoadBalancerName,State.Code]" --output table
  echo "== NAT gateways (expect none: we use a NAT instance)"; aws ec2 describe-nat-gateways --region $R --filter Name=state,Values=available --query "NatGateways[].NatGatewayId" --output table
} > "$O/E-running-resources.txt" 2>&1
aws ce get-cost-and-usage --region us-east-1 --time-period Start=$(date +%Y-%m-01),End=$(date +%F) --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE --query "ResultsByTime[].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]" --output table > "$O/E-month-to-date-spend.txt" 2>&1
tail -3 "$O/D-terraform-plan.txt"; cat "$O/E-running-resources.txt" "$O/E-month-to-date-spend.txt"
