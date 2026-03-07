output "app_id" { value = aws_amplify_app.main.id }
output "default_domain" { value = aws_amplify_app.main.default_domain }
output "app_url" { value = "https://main.${aws_amplify_app.main.default_domain}" }
