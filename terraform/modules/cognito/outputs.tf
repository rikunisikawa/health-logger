output "user_pool_id" { value = aws_cognito_user_pool.main.id }
output "client_id"    { value = aws_cognito_user_pool_client.main.id }
output "domain"       { value = aws_cognito_user_pool_domain.main.domain }
output "issuer_url" {
  value = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}
