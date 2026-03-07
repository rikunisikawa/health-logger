output "create_record_invoke_arn" { value = aws_lambda_function.create_record.invoke_arn }
output "get_latest_invoke_arn" { value = aws_lambda_function.get_latest.invoke_arn }
output "create_record_function_name" { value = aws_lambda_function.create_record.function_name }
output "get_latest_function_name" { value = aws_lambda_function.get_latest.function_name }
output "artifacts_bucket_arn" { value = aws_s3_bucket.artifacts.arn }
output "artifacts_bucket_name" { value = aws_s3_bucket.artifacts.id }
output "push_subscribe_invoke_arn" { value = aws_lambda_function.push_subscribe.invoke_arn }
output "push_subscribe_function_name" { value = aws_lambda_function.push_subscribe.function_name }
