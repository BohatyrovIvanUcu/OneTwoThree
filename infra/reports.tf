data "aws_secretsmanager_secret_version" "db" {
  secret_id = var.db_secret_arn
}

locals {
  db_credentials = jsondecode(data.aws_secretsmanager_secret_version.db.secret_string)
}

# =====================================================================
# S3 Gateway VPC Endpoint
# =====================================================================
resource "aws_vpc_endpoint" "s3_gateway" {
  vpc_id            = var.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [var.private_route_table_id]

  tags = {
    Name         = "${var.project_name}-s3-gateway"
    PROJECT_NAME = var.project_name
  }
}

# =====================================================================
# SQS Queues: Main queue + Dead-Letter Queue (DLQ)
# =====================================================================
resource "aws_sqs_queue" "report_requests_dlq" {
  name                      = "${var.project_name}-report-requests-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_sqs_queue" "report_requests" {
  name                       = "${var.project_name}-report-requests"
  visibility_timeout_seconds = 360 # 6x builder 60s timeout
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.report_requests_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    PROJECT_NAME = var.project_name
  }
}

# =====================================================================
# Report Builder Lambda
# =====================================================================
resource "aws_cloudwatch_log_group" "report_builder" {
  name              = "/aws/lambda/${var.project_name}-report-builder"
  retention_in_days = 7

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_iam_role" "report_builder" {
  name = "${var.project_name}-report-builder-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_iam_role_policy_attachment" "report_builder_vpc_access" {
  role       = aws_iam_role.report_builder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "report_builder_s3" {
  name = "S3ReportsPutAccess"
  role = aws_iam_role.report_builder.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject"
      ]
      Resource = "arn:aws:s3:::${var.project_name}-reports-${data.aws_caller_identity.current.account_id}/*"
    }]
  })
}

resource "aws_iam_role_policy" "report_builder_sqs" {
  name = "SqsReportsConsumerAccess"
  role = aws_iam_role.report_builder.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ]
      Resource = aws_sqs_queue.report_requests.arn
    }]
  })
}

resource "aws_lambda_function" "report_builder" {
  function_name = "${var.project_name}-report-builder"
  package_type  = "Image"
  image_uri     = var.image_uri
  role          = aws_iam_role.report_builder.arn
  architectures = [var.architecture]
  memory_size   = 512
  timeout       = 60

  image_config {
    command = ["app.reports.lambda_handler.handler"]
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.report_builder.name
  }

  vpc_config {
    subnet_ids         = [var.private_subnet_1_id, var.private_subnet_2_id]
    security_group_ids = [var.backend_security_group_id]
  }

  environment {
    variables = {
      DB_HOST        = var.db_endpoint
      DB_PORT        = "5432"
      DB_NAME        = var.db_name
      DB_USER        = var.db_username
      DB_PASSWORD    = local.db_credentials["password"]
      DB_NULL_POOL   = "true"
      REPORTS_BUCKET = "${var.project_name}-reports-${data.aws_caller_identity.current.account_id}"
      PROJECT_NAME   = var.project_name
    }
  }

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_lambda_event_source_mapping" "report_builder" {
  event_source_arn = aws_sqs_queue.report_requests.arn
  function_name    = aws_lambda_function.report_builder.arn
  batch_size       = 1
  enabled          = true
}

# =====================================================================
# EventBridge Scheduler
# =====================================================================
resource "aws_iam_role" "scheduler" {
  name = "${var.project_name}-scheduler-sqs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_iam_role_policy" "scheduler_sqs" {
  name = "SqsSendMessage"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sqs:SendMessage"
      Resource = aws_sqs_queue.report_requests.arn
    }]
  })
}

resource "aws_scheduler_schedule" "report_schedule" {
  name                         = "${var.project_name}-weekly-report-schedule"
  schedule_expression          = var.report_schedule_cron
  schedule_expression_timezone = var.report_schedule_timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_sqs_queue.report_requests.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ week = null, source = "schedule" })
  }
}

# =====================================================================
# Report Mailer Lambda
# =====================================================================
resource "aws_cloudwatch_log_group" "report_mailer" {
  name              = "/aws/lambda/${var.project_name}-report-mailer"
  retention_in_days = 7

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_iam_role" "report_mailer" {
  name = "${var.project_name}-report-mailer-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_iam_role_policy_attachment" "report_mailer_basic" {
  role       = aws_iam_role.report_mailer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "report_mailer_s3_ses_sqs" {
  name = "S3AndSesAndSqsPolicy"
  role = aws_iam_role.report_mailer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "arn:aws:s3:::${var.project_name}-reports-${data.aws_caller_identity.current.account_id}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendRawEmail", "ses:SendEmail"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.report_requests.arn
      }
    ]
  })
}

data "archive_file" "report_mailer_zip" {
  type        = "zip"
  output_path = "${path.module}/report_mailer.zip"

  source {
    content  = file("${path.module}/report_mailer_index.py")
    filename = "index.py"
  }
}

resource "aws_lambda_function" "report_mailer" {
  function_name    = "${var.project_name}-report-mailer"
  runtime          = "python3.12"
  handler          = "index.handler"
  role             = aws_iam_role.report_mailer.arn
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.report_mailer_zip.output_path
  source_code_hash = data.archive_file.report_mailer_zip.output_base64sha256

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.report_mailer.name
  }

  environment {
    variables = {
      SENDER_EMAIL              = var.sender_email
      RECIPIENT_EMAIL           = var.recipient_email
      REPORT_REQUESTS_QUEUE_URL = aws_sqs_queue.report_requests.url
    }
  }

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_lambda_permission" "mailer_invoke_permission" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.report_mailer.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = "arn:aws:s3:::${var.project_name}-reports-${data.aws_caller_identity.current.account_id}"
}

# =====================================================================
# S3 Bucket with 90-day retention and notification trigger
# =====================================================================
resource "aws_s3_bucket" "reports" {
  bucket = "${var.project_name}-reports-${data.aws_caller_identity.current.account_id}"

  tags = {
    PROJECT_NAME = var.project_name
  }
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket = aws_s3_bucket.reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "DeleteOldReportsAfter90Days"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_notification" "reports" {
  bucket = aws_s3_bucket.reports.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.report_mailer.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "reports/"
    filter_suffix       = ".csv"
  }

  lambda_function {
    lambda_function_arn = aws_lambda_function.report_mailer.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "requests/"
    filter_suffix       = ".json"
  }

  depends_on = [
    aws_lambda_permission.mailer_invoke_permission
  ]
}

# =====================================================================
# Backend API S3 Requests upload permission (Stretch Goal)
# =====================================================================
resource "aws_iam_role_policy" "backend_s3_requests" {
  name = "${var.project_name}-backend-s3-requests"
  role = var.backend_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "s3:PutObject"
      Resource = "arn:aws:s3:::${var.project_name}-reports-${data.aws_caller_identity.current.account_id}/requests/*"
    }]
  })
}
