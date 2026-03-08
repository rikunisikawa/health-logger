locals { name = "${var.project}-${var.env}" }

# ── HTTP API ───────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "main" {
  name          = local.name
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["content-type", "authorization"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_origins = var.cors_allow_origins
    max_age       = 86400
  }
}

# ── JWT Authorizer (Cognito) ───────────────────────────────────────────────────

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    issuer   = var.cognito_issuer_url
    audience = [var.cognito_client_id]
  }
}

# ── Default stage ──────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 1000
    throttling_rate_limit  = 100
  }
}

# ── Lambda integrations ────────────────────────────────────────────────────────

resource "aws_apigatewayv2_integration" "create_record" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.create_record_lambda_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "get_latest" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.get_latest_lambda_invoke_arn
  payload_format_version = "2.0"
}

# ── Routes ─────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_route" "create_record" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /records"
  target    = "integrations/${aws_apigatewayv2_integration.create_record.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_latest" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /records/latest"
  target    = "integrations/${aws_apigatewayv2_integration.get_latest.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.get_latest.id}"

  authorization_type = "NONE"
}

# ── Lambda permissions (allow API GW to invoke) ────────────────────────────────

resource "aws_lambda_permission" "create_record" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.create_record_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_latest" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.get_latest_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "push_subscribe" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.push_subscribe_lambda_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "push_subscribe_post" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /push/subscribe"
  target    = "integrations/${aws_apigatewayv2_integration.push_subscribe.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "push_subscribe_delete" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /push/subscribe"
  target    = "integrations/${aws_apigatewayv2_integration.push_subscribe.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "push_subscribe" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.push_subscribe_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "get_item_config" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.get_item_config_lambda_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "save_item_config" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.save_item_config_lambda_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_item_config" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /items/config"
  target    = "integrations/${aws_apigatewayv2_integration.get_item_config.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "save_item_config" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /items/config"
  target    = "integrations/${aws_apigatewayv2_integration.save_item_config.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "get_item_config" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.get_item_config_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "save_item_config" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.save_item_config_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "delete_record" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.delete_record_lambda_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "delete_record" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /records/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.delete_record.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "delete_record" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.delete_record_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
