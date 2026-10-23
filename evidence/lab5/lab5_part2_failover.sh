#!/usr/bin/env bash
# Lab 5 evidence, part 2: the load-balancer FAILOVER demo. This one CHANGES things, then puts them back:
#   1. 10 requests through the load balancer (both instances answer)
#   2. pause the auto scaling group's self-healing, so it doesn't instantly replace the stopped instance
#   3. stop ONE app instance, wait until the load balancer marks it unhealthy
#   4. 10 requests again (all answered by the surviving instance)
#   5. start the instance again and resume the auto scaling group
# It pauses before step 3 and before step 5 so you can take console screenshots.
# Run in AWS CloudShell:  bash lab5_part2_failover.sh 2>&1 | tee outputs_part2.txt
set -uo pipefail
export AWS_REGION=${AWS_REGION:-af-south-1} AWS_PAGER=""   # Joseph's copy: AWS_REGION=eu-north-1
P=healthconnect-dev
ASG=$P-asg
TG=$(aws elbv2 describe-target-groups --names $P-tg --query 'TargetGroups[0].TargetGroupArn' --output text)
LB=$(aws elbv2 describe-load-balancers --names $P-alb --query 'LoadBalancers[0].DNSName' --output text)
URL="http://$LB/health"

health() { aws elbv2 describe-target-health --target-group-arn "$TG" --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State,TargetHealth.Reason]' --output table; }
ten() { ok=0; for i in $(seq 1 10); do r=$(curl -s -m 5 -w ' HTTP %{http_code}' "$URL"); echo "$i: $r"; [[ $r == *"HTTP 200"* ]] && ok=$((ok+1)); done; echo "=> $ok/10 succeeded"; }

echo "### Lab 5 failover demo, $(date -u +%Y-%m-%dT%H:%MZ), load balancer: $URL"
echo; echo "=== BEFORE: target health (expect 2 healthy) ==="; health
echo; echo "=== BEFORE: 10 requests through the load balancer (expect two different instance ids) ==="; ten

read -rp $'\n>>> Screenshot the target group "Targets" tab now (both healthy). Press Enter to stop one instance... '

VICTIM=$(aws elbv2 describe-target-health --target-group-arn "$TG" --query 'TargetHealthDescriptions[0].Target.Id' --output text)
echo; echo "=== Pausing auto scaling self-healing on $ASG (so it doesn't replace the stopped instance) ==="
aws autoscaling suspend-processes --auto-scaling-group-name $ASG --scaling-processes HealthCheck ReplaceUnhealthy Launch Terminate AZRebalance
echo "=== Stopping $VICTIM ==="
aws ec2 stop-instances --instance-ids "$VICTIM" --query 'StoppingInstances[].[InstanceId,CurrentState.Name]' --output text
echo "Waiting for the load balancer to take it out (up to ~3 minutes)..."
for i in $(seq 1 36); do
  s=$(aws elbv2 describe-target-health --target-group-arn "$TG" --targets Id="$VICTIM" --query 'TargetHealthDescriptions[0].TargetHealth.State' --output text 2>/dev/null)
  echo "  $(date -u +%H:%M:%S) $VICTIM: $s"; [[ $s != healthy && $s != initial ]] && break; sleep 5
done
echo; echo "=== AFTER: target health (expect one healthy, one unhealthy/unused) ==="; health
echo; echo "=== AFTER: 10 requests (expect 10/10, all from the surviving instance) ==="; ten

read -rp $'\n>>> Screenshot the "Targets" tab again (one unhealthy). Press Enter to restore everything... '

echo; echo "=== Restoring: starting $VICTIM and resuming auto scaling ==="
aws ec2 start-instances --instance-ids "$VICTIM" --query 'StartingInstances[].[InstanceId,CurrentState.Name]' --output text
aws autoscaling resume-processes --auto-scaling-group-name $ASG
echo "Restored. The instance re-registers healthy in ~1-2 minutes (the app container restarts on boot)."
echo "### done"
