variable "project" { type = string }
variable "env" { type = string }

variable "table_bucket_arn" {
  type        = string
  description = "S3 Tables table bucket ARN"
}

variable "table_bucket_s3_uri" {
  type        = string
  description = "S3 Tables table bucket URI (e.g. s3://bucket-name)"
}

variable "iceberg_s3_location" {
  type        = string
  description = "Regular S3 bucket URI for Glue Iceberg table storage (e.g. s3://bucket-name/iceberg)"
}
