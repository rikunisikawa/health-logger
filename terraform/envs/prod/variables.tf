variable "project" {
  type    = string
  default = "health-logger"
}

variable "env" {
  type    = string
  default = "prod"
}

variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "lambda_s3_keys" {
  type        = map(string)
  description = "Lambda ZIP S3 keys: {create_record=..., get_latest=...}"
  default     = { create_record = "placeholder", get_latest = "placeholder" }
}

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/repo format"
}

# Update after first terraform apply with the real Amplify domain.
# E.g. ["https://main.<app-id>.amplifyapp.com"]
variable "cognito_callback_urls" {
  type    = list(string)
  default = ["https://localhost:3000"]
}

variable "cors_allow_origins" {
  type    = list(string)
  default = ["*"]
}
