resource "google_artifact_registry_repository" "backend" {
  location      = var.region
  repository_id = "${var.project_name}-backend"
  description   = "Container images for Spry backend on Cloud Run"
  format        = "DOCKER"

  depends_on = [google_project_service.services["artifactregistry.googleapis.com"]]
}
