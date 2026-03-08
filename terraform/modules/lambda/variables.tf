variable "project" { type = string }
variable "env" { type = string }

variable "lambda_s3_keys" {
  type        = map(string)
  description = "Map of function name to S3 key: {create_record=..., get_latest=..., push_subscribe=..., push_notify=..., get_item_config=..., save_item_config=...}"
}

variable "firehose_stream_arn" { type = string }
variable "firehose_stream_name" { type = string }

variable "s3_results_bucket_arn" { type = string }
variable "s3_results_bucket_name" { type = string }

variable "athena_database" { type = string }

variable "vapid_private_key" {
  type      = string
  sensitive = true
}

variable "vapid_public_key" { type = string }
