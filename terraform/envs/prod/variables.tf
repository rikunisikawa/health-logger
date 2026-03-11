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
  description = "Lambda ZIP S3 keys: {create_record=..., get_latest=..., push_subscribe=..., push_notify=..., get_item_config=..., save_item_config=..., delete_record=..., get_env_data=...}"
  default     = { create_record = "placeholder", get_latest = "placeholder", push_subscribe = "placeholder", push_notify = "placeholder", get_item_config = "placeholder", save_item_config = "placeholder", delete_record = "placeholder", get_env_data = "placeholder" }
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

variable "vapid_private_key" {
  type      = string
  sensitive = true
}

variable "vapid_public_key" {
  type = string
}
