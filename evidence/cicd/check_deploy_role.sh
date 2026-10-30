#!/bin/bash
P="--profile ashesi-dev --region af-south-1"
ROLE=arn:aws:iam::315224414532:role/healthconnect-dev-gha-deploy
A=315224414532; R=af-south-1
sim() { # expect action resource
  got=$(aws iam simulate-principal-policy $P --policy-source-arn $ROLE --action-names "$2" --resource-arns "$3" --query 'EvaluationResults[0].EvalDecision' --output text)
  [ "$got" = "$1" ] && m=PASS || m=FAIL; [ "$got" = allowed ] || got=denied
  printf "%s  %-8s %-34s %s\n" "$m" "$got" "$2" "${3##*:}"
}
sim allowed ecr:PutImage arn:aws:ecr:$R:$A:repository/healthconnect-dev-backend
sim allowed ecr:PutImage arn:aws:ecr:$R:$A:repository/healthconnect-dev-call
sim implicitDeny ecr:PutImage arn:aws:ecr:$R:$A:repository/some-other-repo
sim allowed autoscaling:StartInstanceRefresh "arn:aws:autoscaling:$R:$A:autoScalingGroup:00000000-0000-0000-0000-000000000000:autoScalingGroupName/healthconnect-dev-asg"
sim implicitDeny autoscaling:StartInstanceRefresh "arn:aws:autoscaling:$R:$A:autoScalingGroup:00000000-0000-0000-0000-000000000000:autoScalingGroupName/other-asg"
sim allowed ssm:PutParameter arn:aws:ssm:$R:$A:parameter/healthconnect-dev/app-image-tag
sim implicitDeny ssm:PutParameter arn:aws:ssm:$R:$A:parameter/anything-else
sim allowed ssm:SendCommand arn:aws:ec2:$R:$A:instance/i-0a5c1b13ee934a046
sim implicitDeny ssm:SendCommand arn:aws:ec2:$R:$A:instance/i-0000000000000000
sim implicitDeny secretsmanager:GetSecretValue "arn:aws:secretsmanager:$R:$A:secret:healthconnect-dev-jwt-secret-abc"
sim implicitDeny rds:DeleteDBInstance "arn:aws:rds:$R:$A:db:healthconnect-dev-db"
