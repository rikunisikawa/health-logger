variable "project"    { type = string; default = "health-logger" }
variable "env"        { type = string; default = "dev" }
variable "aws_region" { type = string; default = "ap-northeast-1" }
variable "ecr_image"  { type = string }
variable "db_password" { type = string; sensitive = true }
variable "db_username" { type = string; default = "hluser" }
