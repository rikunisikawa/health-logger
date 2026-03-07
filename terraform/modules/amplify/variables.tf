variable "project" { type = string }
variable "env" { type = string }

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/repo format"
}

variable "api_endpoint" { type = string }
variable "cognito_user_pool_id" { type = string }
variable "cognito_client_id" { type = string }
variable "cognito_domain" { type = string }
variable "vapid_public_key" { type = string }
