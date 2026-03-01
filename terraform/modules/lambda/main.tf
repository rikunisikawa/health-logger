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
