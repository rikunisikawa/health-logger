variable "project" { type = string }
variable "env" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_id" { type = string }
variable "instance_class" { type = string; default = "db.t4g.micro" }
variable "db_name" { type = string; default = "health_logger" }
variable "db_username" { type = string }
variable "db_password" { type = string; sensitive = true }
