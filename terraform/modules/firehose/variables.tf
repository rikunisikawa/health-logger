variable "project" { type = string }
variable "env" { type = string }
variable "glue_database_name" { type = string }
variable "s3_backup_bucket_arn" {
  type        = string
  description = "S3 bucket ARN for failed record backup"
}
