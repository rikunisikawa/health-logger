output "stream_arn"  { value = aws_kinesis_firehose_delivery_stream.health_records.arn }
output "stream_name" { value = aws_kinesis_firehose_delivery_stream.health_records.name }
