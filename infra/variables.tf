variable "region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "meetings"
}

# Cognito variables
variable "callback_urls" {
  type    = list(string)
  default = ["http://localhost:3000/auth/callback", "http://localhost:5173/auth/callback", "https://d18n2l5wknn4cc.cloudfront.net/auth/callback"]
}

variable "logout_urls" {
  type    = list(string)
  default = ["http://localhost:3000/", "http://localhost:5173/", "https://d18n2l5wknn4cc.cloudfront.net/"]
}

variable "google_client_id" {
  type    = string
  default = "1006406906222-1dmc7m9mm7s38mslii8he7amq7ivm71h.apps.googleusercontent.com"
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

# Reports variables
variable "image_uri" {
  type    = string
  default = "388094503220.dkr.ecr.us-east-1.amazonaws.com/meetings-backend:latest"
}

variable "architecture" {
  type    = string
  default = "x86_64"
}

variable "vpc_id" {
  type    = string
  default = "vpc-06b62106add879d81"
}

variable "private_route_table_id" {
  type    = string
  default = "rtb-0b404a2522cbdd908"
}

variable "private_subnet_1_id" {
  type    = string
  default = "subnet-01d8f00f3df356a78"
}

variable "private_subnet_2_id" {
  type    = string
  default = "subnet-0242ded1f420c79f3"
}

variable "backend_security_group_id" {
  type    = string
  default = "sg-0fc2c17a4bf39d15a"
}

variable "backend_role_name" {
  type    = string
  default = "meetings-backend-BackendRole-1Z1k8Crn4UlJ"
}

variable "db_endpoint" {
  type    = string
  default = "meetings-db.cluster-cw7secukwled.us-east-1.rds.amazonaws.com"
}

variable "db_secret_arn" {
  type    = string
  default = "arn:aws:secretsmanager:us-east-1:388094503220:secret:DbSecret-TvzLywgjtefB-Am0ES9"
}

variable "db_name" {
  type    = string
  default = "meetings"
}

variable "db_username" {
  type    = string
  default = "meetings"
}

variable "sender_email" {
  type    = string
  default = "bohatyrov.pn@ucu.edu.ua"
}

variable "recipient_email" {
  type    = string
  default = "bohatyrov.pn@ucu.edu.ua"
}

variable "report_schedule_cron" {
  type    = string
  default = "cron(0 7 ? * MON *)"
}

variable "report_schedule_timezone" {
  type    = string
  default = "Europe/Kyiv"
}

# AI variables
variable "cors_origins" {
  type    = list(string)
  default = ["http://localhost:3000", "http://localhost:5173", "https://d18n2l5wknn4cc.cloudfront.net"]
}

variable "parser_model" {
  type    = string
  default = "us.anthropic.claude-haiku-4-5"
}

variable "prompt_version" {
  type    = string
  default = "agenda-v1"
}
