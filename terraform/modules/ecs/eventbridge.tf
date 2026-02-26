# EventBridge rule: trigger ExportHealthRecordsJob every hour via ECS RunTask
locals {
  eb_name = "${local.name}-export-schedule"
}

resource "aws_iam_role" "eventbridge_ecs" {
  name = "${local.name}-eventbridge-ecs-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_ecs" {
  role = aws_iam_role.eventbridge_ecs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecs:RunTask"
        Resource = aws_ecs_task_definition.app.arn
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [
          aws_iam_role.ecs_task_execution.arn,
          aws_iam_role.ecs_task.arn
        ]
      }
    ]
  })
}

resource "aws_scheduler_schedule" "export" {
  name = local.eb_name

  flexible_time_window {
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 10
  }

  # Run every hour
  schedule_expression = "rate(1 hour)"

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.eventbridge_ecs.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.app.arn
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = var.private_subnet_ids
        security_groups  = [aws_security_group.app.id]
        assign_public_ip = false
      }

      overrides {
        container_override {
          name    = "app"
          command = ["bundle", "exec", "rails", "runner", "ExportHealthRecordsJob.perform_now"]
        }
      }
    }
  }
}
