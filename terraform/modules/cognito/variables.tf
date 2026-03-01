variable "project" { type = string }
variable "env"     { type = string }

variable "callback_urls" {
  type        = list(string)
  description = "Allowed OAuth callback URLs"
}

variable "logout_urls" {
  type        = list(string)
  description = "Allowed logout URLs"
}
