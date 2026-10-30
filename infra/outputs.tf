# =====================================================================
# Cognito Outputs
# =====================================================================
output "UserPoolId" {
  value = aws_cognito_user_pool.main.id
}

output "UserPoolClientId" {
  value = aws_cognito_user_pool_client.main.id
}

output "Region" {
  value = var.region
}

output "Issuer" {
  value = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

output "HostedUiDomain" {
  value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
}

output "GoogleEnabled" {
  value = var.google_client_id != "" ? "true" : "false"
}

# =====================================================================
# Reports Outputs
# =====================================================================
output "ReportsBucketName" {
  value = aws_s3_bucket.reports.bucket
}

output "ReportRequestsQueueUrl" {
  value = aws_sqs_queue.report_requests.url
}

output "ReportRequestsQueueArn" {
  value = aws_sqs_queue.report_requests.arn
}

output "ReportRequestsDlqUrl" {
  value = aws_sqs_queue.report_requests_dlq.url
}

output "ReportBuilderFunctionName" {
  value = aws_lambda_function.report_builder.function_name
}

output "ReportMailerFunctionName" {
  value = aws_lambda_function.report_mailer.function_name
}

# =====================================================================
# AI Agenda Parser Outputs
# =====================================================================
output "AgendaParserFunctionUrl" {
  value = aws_lambda_function_url.agenda_parser.function_url
}

output "AgendaParserFunctionName" {
  value = aws_lambda_function.agenda_parser.function_name
}

output "AgendaParserFunctionArn" {
  value = aws_lambda_function.agenda_parser.arn
}
