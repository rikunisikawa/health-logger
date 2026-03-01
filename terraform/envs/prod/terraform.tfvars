project    = "health-logger"
env        = "prod"
aws_region = "ap-northeast-1"

github_repository = "riku_nishikawa/health-logger"
# github_access_token and lambda_s3_keys are set via CI/CD secrets

# After first apply: update with real Amplify domain and restrict CORS
# cognito_callback_urls = ["https://main.<app-id>.amplifyapp.com"]
# cors_allow_origins    = ["https://main.<app-id>.amplifyapp.com"]
