module "vpc" {
  source   = "../../modules/vpc"
  project  = var.project
  env      = var.env
  vpc_cidr = "10.1.0.0/16"
  az_count = 2
}

module "s3" {
  source  = "../../modules/s3"
  project = var.project
  env     = var.env
}

module "ecs" {
  source               = "../../modules/ecs"
  project              = var.project
  env                  = var.env
  vpc_id               = module.vpc.vpc_id
  public_subnet_ids    = module.vpc.public_subnet_ids
  private_subnet_ids   = module.vpc.private_subnet_ids
  ecr_image            = var.ecr_image
  desired_count        = 2
  cpu                  = 512
  memory               = 1024
  s3_export_bucket_arn = module.s3.bucket_arn
  environment_variables = [
    { name = "RAILS_ENV",           value = "production" },
    { name = "RAILS_LOG_TO_STDOUT", value = "true" },
    { name = "S3_EXPORT_BUCKET",    value = module.s3.bucket_name },
    { name = "AWS_REGION",          value = "ap-northeast-1" },
  ]
  secrets = [
    { name = "AUTH_USERNAME", valueFrom = "arn:aws:ssm:ap-northeast-1:${data.aws_caller_identity.current.account_id}:parameter/health-logger/prod/auth-username" },
    { name = "AUTH_PASSWORD", valueFrom = "arn:aws:ssm:ap-northeast-1:${data.aws_caller_identity.current.account_id}:parameter/health-logger/prod/auth-password" },
  ]
}

module "glue" {
  source         = "../../modules/glue"
  project        = var.project
  env            = var.env
  s3_bucket_name = module.s3.bucket_name
  s3_bucket_arn  = module.s3.bucket_arn
}

data "aws_caller_identity" "current" {}

output "alb_dns"      { value = module.ecs.alb_dns_name }
output "ecr_repo_url" { value = module.ecs.ecr_repo_url }
