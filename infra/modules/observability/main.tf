# Single SNS topic fans out to every subscribed email. All alarms publish here.
# When an alarm transitions to ALARM state, every confirmed subscriber receives
# an email within ~1 minute.

resource "aws_sns_topic" "alarms" {
  name = "${var.name_prefix}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alarm_email_addresses)
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = each.value
  # SNS sends a confirmation email automatically; subscribers must click the
  # link before they'll receive alarms. endpoint_auto_confirms = false (default)
  # keeps the opt-in explicit.
}

# ---------- ALB alarms ----------

# Any unhealthy target → someone wake up. ASG replaces unhealthy EC2s on its
# own, but a sustained unhealthy count means the replacement cycle isn't keeping
# up (bad image, failing migrations, etc.).
resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${var.name_prefix}-alb-unhealthy-hosts"
  alarm_description   = "ALB sees >=1 unhealthy target for 10 minutes (2 periods of 5 min)."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_rate" {
  alarm_name          = "${var.name_prefix}-alb-target-5xx"
  alarm_description   = "Backend returned >10 HTTP 5xx responses in a 5-minute window."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_latency_p95" {
  alarm_name          = "${var.name_prefix}-alb-target-latency-p95"
  alarm_description   = "p95 target response time >2s for 10 min (2 periods). Suggests backend slow (DB, cold start, saturation)."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  extended_statistic  = "p95"
  threshold           = 2
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }
}

# ---------- RDS alarms ----------

# t4g.micro has 1 GiB RAM total. Postgres starts behaving badly well before
# memory hits zero — 100 MB freeable is already in the "swap or die" zone.
resource "aws_cloudwatch_metric_alarm" "rds_freeable_memory" {
  alarm_name          = "${var.name_prefix}-rds-freeable-memory-low"
  alarm_description   = "RDS freeable memory under 100 MB — OOM imminent on t4g.micro (1 GiB total)."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 104857600 # 100 MB in bytes
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${var.name_prefix}-rds-free-storage-low"
  alarm_description   = "RDS free storage under 2 GB. Autoscale ceiling is 100 GB; this is early-warning so there's time to react."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2147483648 # 2 GB in bytes
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.name_prefix}-rds-cpu-high"
  alarm_description   = "RDS CPU >80% sustained for 10 min. Likely a bad query, missing index, or genuine load."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

# ---------- EC2 alarms ----------

# fck-nat: single instance, no HA. If it's down, every private-subnet egress
# breaks (ECR pulls, apt updates, SSM Session Manager, outbound app traffic).
# System StatusCheck covers hardware/host failures the ASG doesn't catch.
resource "aws_cloudwatch_metric_alarm" "nat_status_check" {
  alarm_name          = "${var.name_prefix}-nat-status-check-failed"
  alarm_description   = "fck-nat instance status check failed. Private-subnet egress is broken until recovery."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    InstanceId = var.nat_instance_id
  }
}

# ASG-level aggregate: alerts if ANY instance in the group fails system checks.
# ASG will auto-replace, but worth knowing something flaky is happening.
resource "aws_cloudwatch_metric_alarm" "asg_status_check" {
  alarm_name          = "${var.name_prefix}-asg-status-check-failed"
  alarm_description   = "An ASG EC2 instance failed its system status check. ASG replaces automatically; this just notifies."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    AutoScalingGroupName = var.asg_name
  }
}

# Cost Explorer must have the tag activated before a budget can filter on it.
# Activation can take up to 24h to take effect.
resource "aws_ce_cost_allocation_tag" "project" {
  tag_key = var.budget_tag_key
  status  = "Active"
}

# ---------- Monthly cost guardrail ----------
# AWS Budgets lives in us-east-1 regardless of our primary region; the resource
# itself is global, but notifications fire from us-east-1 behind the scenes.
# Two notifications: forecast warning + actual critical.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_critical_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Count only this project's spend (Project tag), not other labs in the account.
  cost_filter {
    name   = "TagKeyValue"
    values = [var.budget_cost_filter_value]
  }

  cost_types {
    include_tax          = true
    include_subscription = true
    include_credit       = false # don't let free-tier credits mask real spend
    use_amortized        = false
  }

  # AWS rejects a notification with no subscribers, so only emit them when at
  # least one address is configured. Without addresses the budget still tracks
  # spend; set alarm_email_addresses to turn the emails on.
  dynamic "notification" {
    for_each = length(var.alarm_email_addresses) > 0 ? [1] : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = (var.monthly_budget_warn_usd / var.monthly_budget_critical_usd) * 100
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = var.alarm_email_addresses
    }
  }

  dynamic "notification" {
    for_each = length(var.alarm_email_addresses) > 0 ? [1] : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = 100 # 100% of limit_amount = absolute cap
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alarm_email_addresses
    }
  }
}

# ---------- CloudWatch dashboard ----------
# One pane of glass for every tier we run: ALB traffic/latency/errors/health,
# RDS CPU/memory/storage/connections/IO, ASG capacity, and the fck-nat host.
data "aws_region" "current" {}

locals {
  dashboard_widgets = [
    # ---- ALB ----
    {
      type = "metric", x = 0, y = 0, width = 12, height = 6
      properties = {
        region      = data.aws_region.current.name
        annotations = { horizontal = [], vertical = [] }
        title       = "ALB — request volume & latency"
        view        = "timeSeries"
        period      = 60
        metrics = [
          ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_arn_suffix, { label = "Requests (sum)", stat = "Sum" }],
          ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_arn_suffix, { label = "Latency avg (s)", stat = "Average", yAxis = "right" }],
        ]
      }
    },
    {
      type = "metric", x = 12, y = 0, width = 12, height = 6
      properties = {
        region      = data.aws_region.current.name
        annotations = { horizontal = [], vertical = [] }
        title       = "ALB — HTTP status codes"
        view        = "timeSeries"
        period      = 60
        metrics = [
          ["AWS/ApplicationELB", "HTTPCode_Target_2XX_Count", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_arn_suffix, { label = "2xx", stat = "Sum", color = "#2ca02c" }],
          ["AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_arn_suffix, { label = "4xx", stat = "Sum", color = "#ff7f0e" }],
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_arn_suffix, { label = "5xx", stat = "Sum", color = "#d62728" }],
        ]
      }
    },
    {
      type = "metric", x = 0, y = 6, width = 12, height = 6
      properties = {
        region      = data.aws_region.current.name
        annotations = { horizontal = [], vertical = [] }
        title       = "ALB — target health"
        view        = "timeSeries"
        period      = 60
        metrics = [
          ["AWS/ApplicationELB", "HealthyHostCount", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_arn_suffix, { label = "Healthy", stat = "Average", color = "#2ca02c" }],
          ["AWS/ApplicationELB", "UnHealthyHostCount", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_arn_suffix, { label = "Unhealthy", stat = "Maximum", color = "#d62728" }],
        ]
      }
    },
    # ---- RDS ----
    {
      type = "metric", x = 12, y = 6, width = 12, height = 6
      properties = {
        region      = data.aws_region.current.name
        annotations = { horizontal = [], vertical = [] }
        title       = "RDS — CPU & freeable memory"
        view        = "timeSeries"
        period      = 60
        metrics = [
          ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.db_instance_identifier, { label = "CPU %", stat = "Average" }],
          ["AWS/RDS", "FreeableMemory", "DBInstanceIdentifier", var.db_instance_identifier, { label = "Freeable memory", stat = "Average", yAxis = "right" }],
        ]
      }
    },
    {
      type = "metric", x = 0, y = 12, width = 12, height = 6
      properties = {
        region      = data.aws_region.current.name
        annotations = { horizontal = [], vertical = [] }
        title       = "RDS — storage & connections"
        view        = "timeSeries"
        period      = 60
        metrics = [
          ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", var.db_instance_identifier, { label = "Free storage", stat = "Average" }],
          ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.db_instance_identifier, { label = "Connections", stat = "Average", yAxis = "right" }],
        ]
      }
    },
    {
      type = "metric", x = 12, y = 12, width = 12, height = 6
      properties = {
        region      = data.aws_region.current.name
        annotations = { horizontal = [], vertical = [] }
        title       = "RDS — disk read/write latency"
        view        = "timeSeries"
        period      = 60
        metrics = [
          ["AWS/RDS", "ReadLatency", "DBInstanceIdentifier", var.db_instance_identifier, { label = "Read (s)", stat = "Average" }],
          ["AWS/RDS", "WriteLatency", "DBInstanceIdentifier", var.db_instance_identifier, { label = "Write (s)", stat = "Average" }],
        ]
      }
    },
    # ---- ASG + EC2 ----
    {
      type = "metric", x = 0, y = 18, width = 12, height = 6
      properties = {
        region      = data.aws_region.current.name
        annotations = { horizontal = [], vertical = [] }
        title       = "ASG — capacity"
        view        = "timeSeries"
        period      = 60
        metrics = [
          ["AWS/AutoScaling", "GroupInServiceInstances", "AutoScalingGroupName", var.asg_name, { label = "In service", stat = "Average" }],
          ["AWS/AutoScaling", "GroupDesiredCapacity", "AutoScalingGroupName", var.asg_name, { label = "Desired", stat = "Average" }],
        ]
      }
    },
    {
      type = "metric", x = 12, y = 18, width = 12, height = 6
      properties = {
        region      = data.aws_region.current.name
        annotations = { horizontal = [], vertical = [] }
        title       = "fck-nat host — CPU & status"
        view        = "timeSeries"
        period      = 60
        metrics = [
          ["AWS/EC2", "CPUUtilization", "InstanceId", var.nat_instance_id, { label = "CPU %", stat = "Average" }],
          ["AWS/EC2", "StatusCheckFailed", "InstanceId", var.nat_instance_id, { label = "Status check failed", stat = "Maximum", yAxis = "right", color = "#d62728" }],
        ]
      }
    },
  ]
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name_prefix}-overview"
  dashboard_body = jsonencode({ widgets = local.dashboard_widgets })
}
