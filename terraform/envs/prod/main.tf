locals {
  name = "${var.project}-${var.env}"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── S3 (error/results bucket) ─────────────────────────────────────────────────
module "s3" {
  source  = "../../modules/s3"
  project = var.project
  env     = var.env
}

# ── S3 Tables (Iceberg storage) ───────────────────────────────────────────────
module "s3tables" {
  source  = "../../modules/s3tables"
  project = var.project
  env     = var.env
}

# ── Glue Catalog (Iceberg table definition) ───────────────────────────────────
module "glue" {
  source              = "../../modules/glue"
  project             = var.project
  env                 = var.env
  table_bucket_arn    = module.s3tables.table_bucket_arn
  table_bucket_s3_uri = module.s3tables.table_bucket_s3_uri
  iceberg_s3_location = "s3://${module.s3.bucket_name}/iceberg"
}

# ── Kinesis Firehose → S3 Tables (Iceberg) ────────────────────────────────────
module "firehose" {
  source               = "../../modules/firehose"
  project              = var.project
  env                  = var.env
  glue_database_name   = module.glue.database_name
  s3_backup_bucket_arn = module.s3.bucket_arn
}

# ── Lambda functions ──────────────────────────────────────────────────────────
module "lambda" {
  source  = "../../modules/lambda"
  project = var.project
  env     = var.env

  lambda_s3_keys = var.lambda_s3_keys

  firehose_stream_arn  = module.firehose.stream_arn
  firehose_stream_name = module.firehose.stream_name

  s3_results_bucket_arn  = module.s3.bucket_arn
  s3_results_bucket_name = module.s3.bucket_name

  athena_database = module.glue.database_name
}

# ── Cognito (User Pool + Client + Domain) ─────────────────────────────────────
# NOTE: callback_urls must be updated to the Amplify URL after first apply.
# Run: terraform apply -var="cognito_callback_urls=[\"https://main.<app-id>.amplifyapp.com\"]"
module "cognito" {
  source        = "../../modules/cognito"
  project       = var.project
  env           = var.env
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_callback_urls
}

# ── API Gateway (HTTP API + JWT auth) ─────────────────────────────────────────
module "apigw" {
  source  = "../../modules/apigw"
  project = var.project
  env     = var.env

  cors_allow_origins = var.cors_allow_origins

  cognito_issuer_url = module.cognito.issuer_url
  cognito_client_id  = module.cognito.client_id

  create_record_lambda_invoke_arn = module.lambda.create_record_invoke_arn
  get_latest_lambda_invoke_arn    = module.lambda.get_latest_invoke_arn
  create_record_function_name     = module.lambda.create_record_function_name
  get_latest_function_name        = module.lambda.get_latest_function_name
}

# ── Amplify (React frontend hosting) ─────────────────────────────────────────
module "amplify" {
  source  = "../../modules/amplify"
  project = var.project
  env     = var.env

  github_repository   = var.github_repository
  github_access_token = var.github_access_token

  api_endpoint         = module.apigw.endpoint_url
  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_client_id    = module.cognito.client_id
  cognito_domain       = module.cognito.domain
}

# ── GitHub OIDC (for Actions → AWS) ──────────────────────────────────────────
# Import existing provider with: terraform import aws_iam_openid_connect_provider.github <arn>
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

resource "aws_iam_role" "github_actions" {
  name = "${local.name}-github-actions"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:*"
        }
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions" {
  role = aws_iam_role.github_actions.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:DeleteObject"]
        Resource = [
          module.lambda.artifacts_bucket_arn,
          "${module.lambda.artifacts_bucket_arn}/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["amplify:StartJob", "amplify:StopJob", "amplify:GetJob", "amplify:ListJobs"]
        Resource = ["*"]
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:PublishVersion"]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:GetBucketVersioning"]
        Resource = [
          "arn:aws:s3:::health-logger-tfstate-prod",
          "arn:aws:s3:::health-logger-tfstate-prod/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/health-logger-tflock-prod"
      },
    ]
  })
}

# ── Outputs ────────────────────────────────────────────────────────────────────
output "api_endpoint" { value = module.apigw.endpoint_url }
output "amplify_app_url" { value = module.amplify.app_url }
output "cognito_user_pool_id" { value = module.cognito.user_pool_id }
output "cognito_client_id" { value = module.cognito.client_id }
output "github_actions_role" { value = aws_iam_role.github_actions.arn }
output "lambda_artifacts_bucket" { value = module.lambda.artifacts_bucket_name }
