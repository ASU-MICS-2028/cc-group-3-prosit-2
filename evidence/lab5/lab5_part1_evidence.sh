#!/usr/bin/env bash
# Lab 5 evidence, part 1: READ-ONLY. Changes nothing. Safe to run any time.
# Run in AWS CloudShell (signed in to the ashesi-dev account):
#   bash lab5_part1_evidence.sh 2>&1 | tee outputs_part1.txt
set -uo pipefail
export AWS_REGION=${AWS_REGION:-af-south-1} AWS_PAGER=""   # Joseph's copy: AWS_REGION=eu-north-1
P=healthconnect-dev

echo "### Lab 5 evidence (part 1), captured $(date -u +%Y-%m-%dT%H:%MZ) in $AWS_REGION"

echo; echo "=== PART A: the VPC and its subnets ==="
VPC=$(aws ec2 describe-vpcs --filters Name=tag:Name,Values=$P-vpc --query 'Vpcs[0].VpcId' --output text)
aws ec2 describe-vpcs --vpc-ids "$VPC" --query 'Vpcs[].[VpcId,CidrBlock,Tags[?Key==`Name`]|[0].Value]' --output table
aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" \
  --query 'sort_by(Subnets,&CidrBlock)[].[Tags[?Key==`Name`]|[0].Value,CidrBlock,AvailabilityZone,MapPublicIpOnLaunch]' --output table

echo; echo "=== PART A: route tables (public -> igw; private app -> NAT instance ENI; data -> local ONLY) ==="
for rt in public private data; do
  echo "--- $P-rt-$rt"
  aws ec2 describe-route-tables --filters Name=tag:Name,Values=$P-rt-$rt \
    --query 'RouteTables[].Routes[].[DestinationCidrBlock,GatewayId||NetworkInterfaceId||`-`,State]' --output table
done

echo; echo "=== PART B: the database is private (PubliclyAccessible=False, data subnets only) ==="
aws rds describe-db-instances --db-instance-identifier $P-postgres \
  --query 'DBInstances[].{Id:DBInstanceIdentifier,Status:DBInstanceStatus,Engine:join(` `,[Engine,EngineVersion]),PubliclyAccessible:PubliclyAccessible,Encrypted:StorageEncrypted,SubnetGroup:DBSubnetGroup.DBSubnetGroupName,SecurityGroups:join(`,`,VpcSecurityGroups[].VpcSecurityGroupId)}' --output table
aws rds describe-db-instances --db-instance-identifier $P-postgres \
  --query 'DBInstances[0].DBSubnetGroup.Subnets[].SubnetIdentifier' --output text | tr '\t' '\n' | while read -r s; do
  aws ec2 describe-subnets --subnet-ids "$s" --query 'Subnets[].[SubnetId,Tags[?Key==`Name`]|[0].Value,CidrBlock]' --output text; done
echo "--- DB security group: who may connect on 5432 (expect: only the app security group)"
aws ec2 describe-security-groups --filters Name=group-name,Values=$P-db-sg \
  --query 'SecurityGroups[].IpPermissions[].{Port:FromPort,FromSecurityGroups:join(`,`,UserIdGroupPairs[].GroupId),FromCidrs:join(`,`,IpRanges[].CidrIp)}' --output table
aws ec2 describe-security-groups --filters Name=group-name,Values=$P-app-sg --query 'SecurityGroups[].[GroupName,GroupId]' --output text

echo; echo "=== PART B: load balancer, target group, both targets ==="
aws elbv2 describe-load-balancers --names $P-alb --query 'LoadBalancers[].[LoadBalancerName,DNSName,Scheme,State.Code]' --output table
TG=$(aws elbv2 describe-target-groups --names $P-tg --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 describe-target-groups --target-group-arns "$TG" --query 'TargetGroups[].{HealthPath:HealthCheckPath,Interval:HealthCheckIntervalSeconds,Healthy:HealthyThresholdCount,Unhealthy:UnhealthyThresholdCount}' --output table
aws elbv2 describe-target-health --target-group-arn "$TG" --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' --output table

echo; echo "=== Container registry (ECR) ==="
aws ecr describe-images --repository-name $P-backend --query 'imageDetails[].[join(`,`,imageTags||[`untagged`]),imagePushedAt,imageSizeInBytes]' --output table

echo; echo "=== PART D: what is still running (all of it is HealthConnect; AgroConnect was destroyed 2026-10-15) ==="
aws ec2 describe-instances --filters Name=instance-state-name,Values=running,stopped \
  --query 'Reservations[].Instances[].[Tags[?Key==`Name`]|[0].Value,InstanceId,InstanceType,State.Name]' --output table
aws rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceClass,DBInstanceStatus]' --output table
aws ec2 describe-nat-gateways --filter Name=state,Values=available --query 'NatGateways[].NatGatewayId' --output text | sed 's/^$/(no NAT Gateways: we use the fck-nat instance instead)/'
echo "--- Any AgroConnect leftovers? (expect only the shared Terraform state bucket)"
aws resourcegroupstaggingapi get-resources --tag-filters Key=Project,Values=agroconnect --query 'ResourceTagMappingList[].ResourceARN' --output text | tr '\t' '\n' | sed 's/^$/(none tagged Project=agroconnect)/'
aws s3 ls | grep -i agroconnect || true

echo; echo "=== PART D: month-to-date spend ==="
START=$(date -u +%Y-%m-01); END=$(date -u -d tomorrow +%Y-%m-%d 2>/dev/null || date -u -v+1d +%Y-%m-%d)
aws ce get-cost-and-usage --region us-east-1 --time-period Start=$START,End=$END --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query 'ResultsByTime[0].Groups[?Metrics.UnblendedCost.Amount>`0.01`].[Keys[0],Metrics.UnblendedCost.Amount]' --output table \
  || echo "(Cost Explorer not allowed for this user: take the Billing/Budgets screenshot instead)"
aws ce get-cost-and-usage --region us-east-1 --time-period Start=$START,End=$END --granularity MONTHLY --metrics UnblendedCost \
  --query 'ResultsByTime[0].Total.UnblendedCost' --output table 2>/dev/null || true

echo; echo "### done"
