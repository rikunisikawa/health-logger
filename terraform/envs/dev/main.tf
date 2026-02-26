module "vpc" {
  source   = "../../modules/vpc"
  project  = var.project
  env      = var.env
  vpc_cidr = "10.0.0.0/16"
  az_count = 2
}

module "s3" {
  source  = "../../modules/s3"
  project = var.project
  env     = var.env
}

module "rds" {
  source                    = "../../modules/rds"
  project                   = var.project
  env                       = var.env
  vpc_id                    = module.vpc.vpc_id
  subnet_ids                = module.vpc.private_subnet_ids
  allowed_security_group_id = module.ecs.app_sg_id
  instance_class            = "db.t4g.micro"
  db_username               = var.db_username
  db_password               = var.db_password
}

module "ecs" {
  source               = "../../modules/ecs"
  project              = var.project
  env                  = var.env
  vpc_id               = module.vpc.vpc_id
  public_subnet_ids    = module.vpc.public_subnet_ids
  private_subnet_ids   = module.vpc.private_subnet_ids
  ecr_image            = var.ecr_image
  desired_count        = 1
  cpu                  = 256
  memory               = 512
  s3_export_bucket_arn = module.s3.bucket_arn
  db_security_group_id = module.rds.sg_id
  environment_variables = [
    { name = "RAILS_ENV",            value = "production" },
    { name = "RAILS_LOG_TO_STDOUT",  value = "true" },
    { name = "S3_EXPORT_BUCKET",     value = module.s3.bucket_name },
    { name = "DB_HOST",              value = split(":", module.rds.endpoint)[0] },
    { name = "DB_NAME",              value = module.rds.db_name },
    { name = "DB_USERNAME",          value = var.db_username },
  ]
}

module "glue" {
  source          = "../../modules/glue"
  project         = var.project
  env             = var.env
  s3_bucket_name  = module.s3.bucket_name
  s3_bucket_arn   = module.s3.bucket_arn
}

output "alb_dns"      { value = module.ecs.alb_dns_name }
output "ecr_repo_url" { value = module.ecs.ecr_repo_url }
