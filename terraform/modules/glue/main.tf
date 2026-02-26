locals { name = "${var.project}-${var.env}" }

resource "aws_iam_role" "glue" {
  name = "${local.name}-glue-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "glue.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "glue_service" {
  role       = aws_iam_role.glue.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"
}

resource "aws_iam_role_policy" "glue_s3" {
  role = aws_iam_role.glue.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
      Resource = [var.s3_bucket_arn, "${var.s3_bucket_arn}/*"]
    }]
  })
}

resource "aws_glue_catalog_database" "main" {
  name = replace("${local.name}_health_logs", "-", "_")
}

resource "aws_glue_crawler" "health_logs" {
  name          = "${local.name}-health-crawler"
  role          = aws_iam_role.glue.arn
  database_name = aws_glue_catalog_database.main.name
  s3_target {
    path = "s3://${var.s3_bucket_name}/health_logs/"
  }
  schedule = "cron(0 2 * * ? *)"
  configuration = jsonencode({
    Version = 1.0
    CrawlerOutput = {
      Partitions = { AddOrUpdateBehavior = "InheritFromTable" }
    }
  })
}
