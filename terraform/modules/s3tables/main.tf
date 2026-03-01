locals { name = "${var.project}-${var.env}" }

resource "aws_s3tables_table_bucket" "main" {
  name = "${local.name}-health-tables"
}

resource "aws_s3tables_namespace" "health" {
  table_bucket_arn = aws_s3tables_table_bucket.main.arn
  namespace        = ["health"]
}

resource "aws_s3tables_table" "health_records" {
  table_bucket_arn = aws_s3tables_table_bucket.main.arn
  namespace        = aws_s3tables_namespace.health.namespace[0]
  name             = "health_records"
  format           = "ICEBERG"
}
