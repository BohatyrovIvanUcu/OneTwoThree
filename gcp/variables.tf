variable "project_id" {
  description = "Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "Google Cloud region for Cloud Run, Cloud SQL, and Artifact Registry"
  type        = string
  default     = "us-central1"
}

variable "project_name" {
  description = "Prefix used for GCP resource names"
  type        = string
  default     = "spry"
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "db_disk_size_gb" {
  description = "Cloud SQL SSD disk size in GB"
  type        = number
  default     = 10
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "meetings"
}

variable "db_user" {
  description = "PostgreSQL user name"
  type        = string
  default     = "meetings"
}

variable "db_activation_policy" {
  description = "Cloud SQL activation policy: ALWAYS (running) or NEVER (stopped)"
  type        = string
  default     = "ALWAYS"

  validation {
    condition     = contains(["ALWAYS", "NEVER"], var.db_activation_policy)
    error_message = "db_activation_policy must be ALWAYS or NEVER."
  }
}

variable "backend_image" {
  description = "Full Artifact Registry image URI for Cloud Run. Leave empty on initial bootstrap before pushing the image."
  type        = string
  default     = ""
}

variable "seed" {
  description = "Whether the backend inserts sample participants when the table is empty"
  type        = string
  default     = "true"
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated HTTP requests to Cloud Run (needed for Firebase Hosting rewrite / demo mode)"
  type        = bool
  default     = true
}

variable "cors_origins" {
  description = "Allowed CORS origins for the FastAPI backend"
  type        = list(string)
  default = [
    "http://localhost:3000",
    "http://localhost:5173",
  ]
}
