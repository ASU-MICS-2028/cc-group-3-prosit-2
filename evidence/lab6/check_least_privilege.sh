#!/usr/bin/env bash
# Run from the repo root: bash evidence/lab6/check_least_privilege.sh   (needs the ashesi-dev AWS profile)
set -euo pipefail
export AWS_PROFILE=ashesi-dev AWS_REGION=af-south-1
ACCT=315224414532
ROLE="arn:aws:iam::${ACCT}:role"
ECR="arn:aws:ecr:af-south-1:${ACCT}:repository"
DB=$(terraform -chdir=infra output -raw db_master_user_secret_arn)
JWT=$(terraform -chdir=infra output -raw jwt_secret_arn)
TOPIC=$(terraform -chdir=infra output -raw appointment_topic_arn)
RDS="arn:aws:rds:af-south-1:${ACCT}:db:healthconnect-dev-postgres"
sim() { # who action resource-label resource role expect
  local got; got=$(aws iam simulate-principal-policy --policy-source-arn "${ROLE}/$5" --action-names "$2" --resource-arns "$4" \
    --query 'EvaluationResults[0].EvalDecision' --output text)
  printf "%-4s %-30s %-28s -> %-13s %s\n" "$1" "$2" "$3" "$got" "$([ "$got" = "$6" ] && echo PASS || echo "FAIL (expected $6)")"
}
echo "# L6-A1b: least-privilege check with the IAM policy simulator, $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "# Evaluates each role's real attached policies; nothing is actually read, pulled or deleted."
echo
sim API ecr:BatchGetImage            "backend image repo"    "${ECR}/healthconnect-dev-backend" healthconnect-dev-ec2-role allowed
sim API ecr:BatchGetImage            "call image repo"       "${ECR}/healthconnect-dev-call"    healthconnect-dev-ec2-role implicitDeny
sim API secretsmanager:GetSecretValue "DB password secret"   "$DB"                              healthconnect-dev-ec2-role allowed
sim API secretsmanager:GetSecretValue "JWT key secret"       "$JWT"                             healthconnect-dev-ec2-role allowed
sim API sns:Publish                  "appointment topic"     "$TOPIC"                           healthconnect-dev-ec2-role allowed
sim API rds:DeleteDBInstance         "the database"          "$RDS"                             healthconnect-dev-ec2-role implicitDeny
sim NAT secretsmanager:GetSecretValue "DB password secret"   "$DB"                              healthconnect-dev-nat-role implicitDeny
sim NAT secretsmanager:GetSecretValue "JWT key secret"       "$JWT"                             healthconnect-dev-nat-role implicitDeny
sim NAT ecr:BatchGetImage            "backend image repo"    "${ECR}/healthconnect-dev-backend" healthconnect-dev-nat-role implicitDeny
sim NAT sns:Publish                  "appointment topic"     "$TOPIC"                           healthconnect-dev-nat-role implicitDeny
