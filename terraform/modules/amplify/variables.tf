variable "project" { type = string }
variable "env"     { type = string }

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/repo format"
}

variable "github_access_token" {
  type        = string
  sensitive   = true
  description = "GitHub personal access token for Amplify GitHub connection"
}

variable "api_endpoint"         { type = string }
variable "cognito_user_pool_id" { type = string }
variable "cognito_client_id"    { type = string }
variable "cognito_domain"       { type = string }
