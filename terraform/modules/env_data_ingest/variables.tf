variable "environment" {
  type        = string
  description = "Environment name (e.g. prod)"
}

variable "lambda_s3_bucket" {
  type        = string
  description = "S3 bucket name where Lambda ZIP artifacts are stored"
}

variable "lambda_s3_key" {
  type        = string
  description = "S3 key for the get_env_data Lambda ZIP artifact"
}

variable "location_id" {
  type        = string
  default     = "musashikosugi"
  description = "Location identifier used in S3 path partitioning"
}

variable "latitude" {
  type        = number
  default     = 35.5733
  description = "Latitude of the observation location"
}

variable "longitude" {
  type        = number
  default     = 139.6590
  description = "Longitude of the observation location"
}

variable "schedule_expression" {
  type        = string
  default     = "cron(0 15 * * ? *)"
  description = "EventBridge schedule expression (UTC). Default: 00:00 JST (next day) = 15:00 UTC (after CAMS data is ready)"
}
