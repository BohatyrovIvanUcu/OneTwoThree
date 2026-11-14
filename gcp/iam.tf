locals {
  terraform_roles = toset([
    "roles/run.admin",
    "roles/cloudsql.admin",
    "roles/artifactregistry.admin",
    "roles/secretmanager.admin",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/iam.serviceAccountUser",
  ])
}

# Dedicated service account for Terraform / CI (no JSON keys downloaded)
resource "google_service_account" "terraform" {
  account_id   = "${var.project_name}-terraform"
  display_name = "Spry Terraform Deployer"
  description  = "Least-privilege service account for Terraform / CI deployments"

  depends_on = [google_project_service.services["iam.googleapis.com"]]
}

resource "google_project_iam_member" "terraform_roles" {
  for_each = local.terraform_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.terraform.email}"
}

# Separate runtime service account that the Cloud Run API runs as
resource "google_service_account" "api" {
  account_id   = "${var.project_name}-api"
  display_name = "Spry Cloud Run API"
  description  = "Runtime identity for the Spry FastAPI service on Cloud Run"

  depends_on = [google_project_service.services["iam.googleapis.com"]]
}

resource "google_project_iam_member" "api_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}
