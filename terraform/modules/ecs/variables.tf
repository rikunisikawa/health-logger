variable "project" { type = string }
variable "env" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids"  { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "ecr_image" { type = string }
variable "container_port" { type = number; default = 3000 }
variable "desired_count" { type = number; default = 1 }
variable "cpu" { type = number; default = 256 }
variable "memory" { type = number; default = 512 }
variable "environment_variables" { type = list(object({ name = string; value = string })); default = [] }
variable "secrets" { type = list(object({ name = string; valueFrom = string })); default = [] }
variable "s3_export_bucket_arn" { type = string }
variable "db_security_group_id" { type = string }
