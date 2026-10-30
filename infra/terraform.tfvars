region           = "us-east-1"
project_name     = "meetings"
callback_urls    = ["http://localhost:3000/auth/callback", "http://localhost:5173/auth/callback", "https://d18n2l5wknn4cc.cloudfront.net/auth/callback"]
logout_urls      = ["http://localhost:3000/", "http://localhost:5173/", "https://d18n2l5wknn4cc.cloudfront.net/"]
google_client_id = "1006406906222-1dmc7m9mm7s38mslii8he7amq7ivm71h.apps.googleusercontent.com"

image_uri                 = "388094503220.dkr.ecr.us-east-1.amazonaws.com/meetings-backend:latest"
architecture              = "x86_64"
vpc_id                    = "vpc-06b62106add879d81"
private_route_table_id    = "rtb-0b404a2522cbdd908"
private_subnet_1_id       = "subnet-01d8f00f3df356a78"
private_subnet_2_id       = "subnet-0242ded1f420c79f3"
backend_security_group_id = "sg-0fc2c17a4bf39d15a"
backend_role_name         = "meetings-backend-BackendRole-1Z1k8Crn4UlJ"
db_endpoint               = "meetings-db.cluster-cw7secukwled.us-east-1.rds.amazonaws.com"
db_secret_arn             = "arn:aws:secretsmanager:us-east-1:388094503220:secret:DbSecret-TvzLywgjtefB-Am0ES9"
db_name                   = "meetings"
db_username               = "meetings"
sender_email              = "bohatyrov.pn@ucu.edu.ua"
recipient_email           = "bohatyrov.pn@ucu.edu.ua"
report_schedule_cron      = "cron(0 7 ? * MON *)"
report_schedule_timezone  = "Europe/Kyiv"

cors_origins   = ["http://localhost:3000", "http://localhost:5173", "https://d18n2l5wknn4cc.cloudfront.net"]
parser_model   = "us.anthropic.claude-haiku-4-5"
prompt_version = "agenda-v1"
