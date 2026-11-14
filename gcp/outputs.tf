output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "artifact_registry_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.backend.repository_id}"
}

output "cloud_sql_instance_name" {
  value = google_sql_database_instance.postgres.name
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "cloud_run_service_name" {
  value = length(google_cloud_run_v2_service.backend) > 0 ? google_cloud_run_v2_service.backend[0].name : null
}

output "cloud_run_url" {
  value = length(google_cloud_run_v2_service.backend) > 0 ? google_cloud_run_v2_service.backend[0].uri : null
}

output "api_service_account" {
  value = google_service_account.api.email
}

output "terraform_service_account" {
  value = google_service_account.terraform.email
}
