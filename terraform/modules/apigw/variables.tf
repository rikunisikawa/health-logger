variable "project" { type = string }
variable "env"     { type = string }

variable "cors_allow_origins" {
  type        = list(string)
  description = "Allowed CORS origins (e.g. Amplify app URL)"
  default     = ["*"]
}

variable "cognito_issuer_url" { type = string }
variable "cognito_client_id"  { type = string }

variable "create_record_lambda_invoke_arn" { type = string }
variable "get_latest_lambda_invoke_arn"    { type = string }
variable "create_record_function_name"     { type = string }
variable "get_latest_function_name"        { type = string }
