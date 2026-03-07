locals { name = "${var.project}-${var.env}" }

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

resource "aws_iam_role" "firehose" {
  name = "${local.name}-firehose-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "firehose.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "firehose" {
  role = aws_iam_role.firehose.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3tables:PutObject",
          "s3tables:GetObject",
          "s3tables:AbortMultipartUpload",
          "s3tables:GetBucketLocation",
          "s3tables:ListBucket",
          "s3tables:ListBucketMultipartUploads",
          "s3tables:GetTableBucket",
          "s3tables:GetNamespace",
          "s3tables:GetTable",
          "s3tables:ListTables",
          "s3tables:ListNamespaces",
          "s3tables:ListTableBuckets",
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "glue:GetTable",
          "glue:GetTableVersion",
          "glue:GetTableVersions",
          "glue:UpdateTable",
          "glue:GetDatabase",
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
        ]
        Resource = [var.s3_backup_bucket_arn, "${var.s3_backup_bucket_arn}/*"]
      },
    ]
  })
}

resource "aws_kinesis_firehose_delivery_stream" "health_records" {
  name        = "${local.name}-health-records"
  destination = "iceberg"

  iceberg_configuration {
    role_arn    = aws_iam_role.firehose.arn
    catalog_arn = "arn:aws:glue:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:catalog"

    destination_table_configuration {
      database_name = var.glue_database_name
      table_name    = "health_records"
    }

    buffering_size     = 5
    buffering_interval = 60

    s3_configuration {
      role_arn            = aws_iam_role.firehose.arn
      bucket_arn          = var.s3_backup_bucket_arn
      prefix              = "firehose-backup/"
      error_output_prefix = "firehose-errors/"
    }
  }
}
