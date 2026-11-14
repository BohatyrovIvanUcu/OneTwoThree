project_id   = "onetwothree-514711"
region       = "us-central1"
project_name = "spry"

db_tier              = "db-f1-micro"
db_disk_size_gb      = 10
db_name              = "meetings"
db_user              = "meetings"
db_activation_policy = "ALWAYS"

seed          = "true"
backend_image = "us-central1-docker.pkg.dev/onetwothree-514711/spry-backend/meetings-backend:latest"

cors_origins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://onetwothree-514711.web.app",
  "https://onetwothree-514711.firebaseapp.com",
]
