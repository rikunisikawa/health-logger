locals {
  name = "health-logger-${var.environment}"
}

# ── S3 bucket: raw environment data storage ───────────────────────────────────

resource "aws_s3_bucket" "env_data" {
  bucket        = "${local.name}-env-data"
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "env_data" {
  bucket = aws_s3_bucket.env_data.id
  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "env_data" {
  bucket = aws_s3_bucket.env_data.id

  rule {
    id     = "expire-athena-results"
    status = "Enabled"
    filter { prefix = "athena-results/" }
    expiration { days = 30 }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "env_data" {
  bucket = aws_s3_bucket.env_data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "env_data" {
  bucket                  = aws_s3_bucket.env_data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Glue Database: environment data catalog ───────────────────────────────────

resource "aws_glue_catalog_database" "env" {
  name        = "health_logger_env_${var.environment}"
  description = "Health Logger environment data (weather, air quality)"
}

# ── IAM Role for Lambda ────────────────────────────────────────────────────────

resource "aws_iam_role" "get_env_data" {
  name = "${local.name}-get-env-data-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "get_env_data_basic" {
  role       = aws_iam_role.get_env_data.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "get_env_data" {
  role = aws_iam_role.get_env_data.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = ["${aws_s3_bucket.env_data.arn}/raw/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.env_data.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "glue:GetDatabase",
          "glue:GetTable",
          "glue:CreateTable",
          "glue:UpdateTable",
        ]
        Resource = [
          "arn:aws:glue:*:*:catalog",
          "arn:aws:glue:*:*:database/${aws_glue_catalog_database.env.name}",
          "arn:aws:glue:*:*:table/${aws_glue_catalog_database.env.name}/*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "athena:StartQueryExecution",
          "athena:GetQueryExecution",
          "athena:GetQueryResults",
        ]
        Resource = ["arn:aws:athena:*:*:workgroup/primary"]
      },
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject"]
        Resource = ["${aws_s3_bucket.env_data.arn}/athena-results/*"]
      },
    ]
  })
}

# ── Lambda function: get_env_data ─────────────────────────────────────────────

resource "aws_lambda_function" "get_env_data" {
  function_name = "${local.name}-get-env-data"
  role          = aws_iam_role.get_env_data.arn
  runtime       = "python3.13"
  handler       = "handler.lambda_handler"

  s3_bucket = var.lambda_s3_bucket
  s3_key    = var.lambda_s3_key

  timeout     = 300
  memory_size = 256

  tracing_config { mode = "Active" }

  environment {
    variables = {
      S3_BUCKET_NAME = aws_s3_bucket.env_data.id
      LOCATION_ID    = var.location_id
      LATITUDE       = tostring(var.latitude)
      LONGITUDE      = tostring(var.longitude)
      TIMEZONE       = "Asia/Tokyo"
    }
  }
}

# ── EventBridge Rule: daily trigger ───────────────────────────────────────────

resource "aws_cloudwatch_event_rule" "env_data_daily" {
  name                = "${local.name}-env-data-daily"
  description         = "Trigger get_env_data Lambda daily at 10:00 JST (01:00 UTC)"
  schedule_expression = var.schedule_expression
}

resource "aws_cloudwatch_event_target" "env_data_daily" {
  rule      = aws_cloudwatch_event_rule.env_data_daily.name
  target_id = "GetEnvDataLambda"
  arn       = aws_lambda_function.get_env_data.arn
}

# ── Lambda Permission: allow EventBridge to invoke Lambda ─────────────────────

resource "aws_lambda_permission" "env_data_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_env_data.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.env_data_daily.arn
}
