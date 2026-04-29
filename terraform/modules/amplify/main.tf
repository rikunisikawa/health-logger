locals { name = "${var.project}-${var.env}" }

resource "aws_iam_role" "amplify_backend" {
  name = "${local.name}-amplify-backend"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "amplify.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "amplify_build" {
  role = aws_iam_role.amplify_backend.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["amplify:*"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup", "logs:CreateLogStream",
          "logs:PutLogEvents", "logs:DescribeLogGroups", "logs:DescribeLogStreams",
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_amplify_app" "main" {
  name                 = local.name
  repository           = "https://github.com/${var.github_repository}"
  iam_service_role_arn = aws_iam_role.amplify_backend.arn

  # amplify.yml in repository root is used automatically when build_spec is omitted

  environment_variables = {
    VITE_API_ENDPOINT         = var.api_endpoint
    VITE_COGNITO_USER_POOL_ID = var.cognito_user_pool_id
    VITE_COGNITO_CLIENT_ID    = var.cognito_client_id
    VITE_COGNITO_DOMAIN       = var.cognito_domain
    VITE_VAPID_PUBLIC_KEY     = var.vapid_public_key
  }

  # Redirect SPA routes to index.html
  custom_rule {
    source = "/<*>"
    status = "404-200"
    target = "/index.html"
  }

  depends_on = [aws_iam_role_policy.amplify_build]

  lifecycle {
    ignore_changes = [access_token]
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.main.id
  branch_name = "main"

  enable_auto_build = true
  framework         = "React"
  stage             = "PRODUCTION"
}

resource "aws_amplify_branch" "develop" {
  app_id      = aws_amplify_app.main.id
  branch_name = "develop"

  enable_auto_build = true
  framework         = "React"
  stage             = "DEVELOPMENT"
}
