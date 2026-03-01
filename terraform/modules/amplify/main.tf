locals { name = "${var.project}-${var.env}" }

resource "aws_amplify_app" "main" {
  name         = local.name
  repository   = "https://github.com/${var.github_repository}"
  access_token = var.github_access_token

  # amplify.yml in repository root is used automatically when build_spec is omitted

  environment_variables = {
    VITE_API_ENDPOINT         = var.api_endpoint
    VITE_COGNITO_USER_POOL_ID = var.cognito_user_pool_id
    VITE_COGNITO_CLIENT_ID    = var.cognito_client_id
    VITE_COGNITO_DOMAIN       = var.cognito_domain
  }

  # Redirect SPA routes to index.html
  custom_rule {
    source = "/<*>"
    status = "404-200"
    target = "/index.html"
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.main.id
  branch_name = "main"

  enable_auto_build = true
  framework         = "React"
  stage             = "PRODUCTION"
}
