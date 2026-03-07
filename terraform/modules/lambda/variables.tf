variable "project" { type = string }
variable "env" { type = string }

variable "lambda_s3_keys" {
  type        = map(string)
  description = "Map of function name to S3 key: {create_record=..., get_latest=...}"
}

variable "firehose_stream_arn" { type = string }
variable "firehose_stream_name" { type = string }

variable "s3_results_bucket_arn" { type = string }
variable "s3_results_bucket_name" { type = string }

variable "athena_database" { type = string }
