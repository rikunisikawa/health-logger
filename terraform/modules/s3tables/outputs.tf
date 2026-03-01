output "table_bucket_arn"    { value = aws_s3tables_table_bucket.main.arn }
output "table_bucket_name"   { value = aws_s3tables_table_bucket.main.name }
output "table_bucket_s3_uri" { value = "s3://${aws_s3tables_table_bucket.main.name}" }
output "table_arn"           { value = aws_s3tables_table.health_records.arn }
output "namespace"           { value = aws_s3tables_namespace.health.namespace[0] }
