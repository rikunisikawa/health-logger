locals { name = "${var.project}-${var.env}" }

# ── Artifacts S3 bucket ────────────────────────────────────────────────────────

resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.name}-lambda-artifacts"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── IAM role ───────────────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda" {
  name = "${local.name}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ── DynamoDB: push subscriptions ───────────────────────────────────────────────

resource "aws_dynamodb_table" "item_configs" {
  name         = "${local.name}-item-configs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "push_subscriptions" {
  name         = "${local.name}-push-subscriptions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }
}

resource "aws_iam_role_policy" "lambda" {
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["firehose:PutRecord", "firehose:PutRecordBatch"]
        Resource = [var.firehose_stream_arn]
      },
      {
        Effect = "Allow"
        Action = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:DeleteItem", "dynamodb:Scan"]
        Resource = [aws_dynamodb_table.push_subscriptions.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem"]
        Resource = [aws_dynamodb_table.item_configs.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "athena:StartQueryExecution",
          "athena:GetQueryExecution",
          "athena:GetQueryResults",
          "athena:StopQueryExecution",
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:GetBucketLocation",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:AbortMultipartUpload",
        ]
        Resource = [var.s3_results_bucket_arn, "${var.s3_results_bucket_arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["glue:GetDatabase", "glue:GetTable", "glue:GetPartitions"]
        Resource = ["*"]
      },
      {
        Effect   = "Allow"
        Action   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
        Resource = ["*"]
      },
    ]
  })
}

# ── Lambda functions ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "create_record" {
  function_name = "${local.name}-create-record"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.13"
  handler       = "handler.lambda_handler"

  s3_bucket = aws_s3_bucket.artifacts.id
  s3_key    = var.lambda_s3_keys["create_record"]

  timeout     = 30
  memory_size = 256

  tracing_config { mode = "Active" }

  environment {
    variables = {
      FIREHOSE_STREAM_NAME = var.firehose_stream_name
    }
  }

  depends_on = [aws_s3_bucket.artifacts]
}

resource "aws_lambda_function" "get_latest" {
  function_name = "${local.name}-get-latest"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.13"
  handler       = "handler.lambda_handler"

  s3_bucket = aws_s3_bucket.artifacts.id
  s3_key    = var.lambda_s3_keys["get_latest"]

  timeout     = 60
  memory_size = 256

  tracing_config { mode = "Active" }

  environment {
    variables = {
      ATHENA_DATABASE      = var.athena_database
      ATHENA_OUTPUT_BUCKET = var.s3_results_bucket_name
    }
  }

  depends_on = [aws_s3_bucket.artifacts]
}

resource "aws_lambda_function" "get_item_config" {
  function_name = "${local.name}-get-item-config"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.13"
  handler       = "handler.lambda_handler"

  s3_bucket = aws_s3_bucket.artifacts.id
  s3_key    = var.lambda_s3_keys["get_item_config"]

  timeout     = 30
  memory_size = 128

  tracing_config { mode = "Active" }

  environment {
    variables = {
      ITEM_CONFIGS_TABLE = aws_dynamodb_table.item_configs.name
    }
  }

  depends_on = [aws_s3_bucket.artifacts]
}

resource "aws_lambda_function" "save_item_config" {
  function_name = "${local.name}-save-item-config"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.13"
  handler       = "handler.lambda_handler"

  s3_bucket = aws_s3_bucket.artifacts.id
  s3_key    = var.lambda_s3_keys["save_item_config"]

  timeout     = 30
  memory_size = 128

  tracing_config { mode = "Active" }

  environment {
    variables = {
      ITEM_CONFIGS_TABLE = aws_dynamodb_table.item_configs.name
    }
  }

  depends_on = [aws_s3_bucket.artifacts]
}

resource "aws_lambda_function" "push_subscribe" {
  function_name = "${local.name}-push-subscribe"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.13"
  handler       = "handler.lambda_handler"

  s3_bucket = aws_s3_bucket.artifacts.id
  s3_key    = var.lambda_s3_keys["push_subscribe"]

  timeout     = 30
  memory_size = 128

  tracing_config { mode = "Active" }

  environment {
    variables = {
      PUSH_SUBSCRIPTIONS_TABLE = aws_dynamodb_table.push_subscriptions.name
    }
  }

  depends_on = [aws_s3_bucket.artifacts]
}

resource "aws_lambda_function" "push_notify" {
  function_name = "${local.name}-push-notify"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.13"
  handler       = "handler.lambda_handler"

  s3_bucket = aws_s3_bucket.artifacts.id
  s3_key    = var.lambda_s3_keys["push_notify"]

  timeout     = 60
  memory_size = 256

  tracing_config { mode = "Active" }

  environment {
    variables = {
      PUSH_SUBSCRIPTIONS_TABLE = aws_dynamodb_table.push_subscriptions.name
      VAPID_PRIVATE_KEY        = var.vapid_private_key
    }
  }

  depends_on = [aws_s3_bucket.artifacts]
}

# ── EventBridge Scheduler (daily push notify at 21:00 JST = 12:00 UTC) ────────

resource "aws_iam_role" "scheduler" {
  name = "${local.name}-scheduler-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = [aws_lambda_function.push_notify.arn]
    }]
  })
}

resource "aws_scheduler_schedule" "push_notify_daily" {
  name       = "${local.name}-push-notify-daily"
  group_name = "default"

  flexible_time_window {
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 10
  }

  schedule_expression          = "cron(0 12 * * ? *)"
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.push_notify.arn
    role_arn = aws_iam_role.scheduler.arn
  }
}
