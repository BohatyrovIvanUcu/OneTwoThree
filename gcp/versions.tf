terraform {
  required_version = ">= 1.10"

  cloud {
    organization = "123boh"
    workspaces {
      name = "meetings-gcp-dev"
    }
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
