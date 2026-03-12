output "lambda_function_name" {
  description = "Name of the get_env_data Lambda function"
  value       = aws_lambda_function.get_env_data.function_name
}

output "s3_bucket_name" {
  description = "Name of the environment data S3 bucket"
  value       = aws_s3_bucket.env_data.id
}

output "s3_bucket_arn" {
  description = "ARN of the environment data S3 bucket"
  value       = aws_s3_bucket.env_data.arn
}

output "glue_database_name" {
  description = "Name of the Glue catalog database for environment data"
  value       = aws_glue_catalog_database.env.name
}
