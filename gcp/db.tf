resource "random_password" "db_password" {
  length  = 24
  special = false
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "${var.project_name}-db-password"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

resource "google_secret_manager_secret_iam_member" "api_db_password" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.db_password.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_sql_database_instance" "postgres" {
  name                = "${var.project_name}-postgres"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = false

  settings {
    tier              = var.db_tier
    edition           = "ENTERPRISE"
    disk_size         = var.db_disk_size_gb
    disk_type         = "PD_SSD"
    availability_type = "ZONAL"
    activation_policy = var.db_activation_policy

    backup_configuration {
      enabled = false
    }
  }

  depends_on = [google_project_service.services["sqladmin.googleapis.com"]]
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}
