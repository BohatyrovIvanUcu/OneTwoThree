# ADR 0008: Google Cloud Platform Architecture & Service Selection (Spry Multicloud)

## Status
Accepted

## Context
Through Lab 7, Spry's production infrastructure runs on AWS (`us-east-1`), managed by Terraform in [infra/](../../infra) with remote state in HCP Terraform (`123boh/meetings-dev`). For Lab 9, we evaluate migrating Spry to Google Cloud Platform (`us-central1`, project `onetwothree-514711`) and move the usable core of the application (frontend, REST API, and relational database) to GCP while keeping secondary workflows on AWS for now.

The existing AWS stack in `infra/` consists of:
- Static React SPA on S3 + CloudFront (Free plan + WAF)
- FastAPI container on AWS Lambda (`back/Dockerfile.lambda` + Mangum) with a Lambda Function URL
- ECR (`meetings-backend`)
- Aurora Serverless v2 PostgreSQL (0–1 ACU, pauses after idle) in private VPC subnets
- Cognito User Pool + Hosted UI + Google IdP (`infra/auth.tf`)
- Weekly Reports pipeline: EventBridge Scheduler → SQS (+ DLQ) → Report Builder Lambda → S3 → Report Mailer Lambda → SES (`infra/reports.tf`)
- AI Agenda Parser: Bedrock (Claude Haiku / Nova) behind a Lambda Function URL (`infra/ai.tf`)
- Secrets Manager, CloudWatch Logs, IAM roles, and Terraform `aws` provider

## Decision

### 1. AWS-to-GCP Service Mapping

| Spry on AWS | On Google Cloud | Decision | What is different & Rationale |
| --- | --- | --- | --- |
| S3 + CloudFront (Free plan) + WAF, static frontend | **Firebase Hosting** | **Replace** | CDN and managed TLS certificate included; Spark (free) plan gives 10 GB storage and 360 MB/day transfer. Supports `/api/**` rewrites directly to Cloud Run for same-origin requests without CORS. A standalone Cloud Storage bucket needs an external HTTPS Load Balancer (billed hourly) for custom-domain HTTPS. |
| Lambda + Function URL, FastAPI (`Dockerfile.lambda` + Mangum) | **Cloud Run** | **Replace** | Runs the standard `uvicorn` container (`back/Dockerfile`) listening on `$PORT`, scales to zero (`min_instance_count = 0`), includes managed HTTPS URL, has no 15-minute execution cap, and needs no Mangum/Lambda adapter. |
| ECR | **Artifact Registry** | **Replace** | Stores the backend container image in `us-central1` (`0.5 GB` free every month). |
| Aurora Serverless v2, 0–1 ACU, pauses | **Cloud SQL for PostgreSQL (`db-f1-micro`, 10 GB SSD)** | **Replace (with manual stop)** | Unlike Aurora Serverless v2, Cloud SQL does **not** pause automatically on idle; it bills `$0.0105/h` while running plus `$0.17/GB-month` SSD storage even when stopped. Chosen for Part 2 so SQLAlchemy 2 + Alembic migrations work unchanged without rewriting the data access layer. Stopped (`activation_policy = NEVER`) outside active demos/work. |
| DynamoDB (if moved off SQL) | **Firestore** | **Drop (not used in Part 2; documented alternative)** | Serverless document DB with generous daily free tier (`50k` reads, `20k` writes, `1 GiB` storage/day → `$0/mo` idle), but not SQL: no joins, foreign keys, or Alembic migrations; requires rewriting repositories and query patterns. |
| Cognito user pool + Google | Identity Platform (Firebase Authentication) | **Keep on AWS (for now)** | Identity Platform offers `50,000` free MAU vs Cognito's `10,000`, and supports Google sign-in. Kept on AWS in Part 2 to preserve existing Cognito users and Google OAuth setup; planned as a stretch goal. |
| EventBridge Scheduler | Cloud Scheduler | **Keep on AWS (for now)** | `3` jobs free per billing account (`$0.10/job` after). Kept on AWS alongside the weekly reports pipeline. |
| SQS | Pub/Sub (or Cloud Tasks) | **Keep on AWS (for now)** | Pub/Sub provides push subscriptions to Cloud Run; Cloud Tasks acts as a work queue. Kept on AWS with the reports pipeline. |
| S3 event → Lambda | Cloud Storage + Eventarc → Cloud Run | **Keep on AWS (for now)** | Same event-driven pattern via Eventarc triggers; kept on AWS with the reports bucket/mailer. |
| SES | No native GCP service (SendGrid / Mailgun / keep SES) | **Keep SES on AWS** | GCP has no built-in transactional e-mail service. Keeping AWS SES (or calling SendGrid/Mailgun via HTTPS API with key in GCP Secret Manager) avoids third-party account verification overhead. |
| Bedrock (Claude, Nova) | Vertex AI (Gemini, and Claude via Model Garden) | **Keep on AWS (for now)** | Same Claude models exist in Model Garden, plus Google's Gemini models. Kept on AWS because GCP Free Trial credits do **not** cover partner models like Claude on Vertex AI; Vertex AI Gemini is evaluated in Part 4 / stretch. |
| SSM Parameter Store / Secrets Manager | **Secret Manager** | **Replace (for GCP DB)** | `6` active secret versions and `10,000` accesses free per month. Stores the Terraform-generated Cloud SQL password and mounts it into Cloud Run. |
| CloudWatch Logs | **Cloud Logging** | **Replace (for Cloud Run)** | Automatic log ingestion for Cloud Run and Cloud SQL; free tier covers small lab workloads. |
| IAM roles | **Service Accounts + IAM roles** | **Replace** | Dedicated least-privilege service accounts: one for Terraform (`spry-terraform`) and a separate runtime SA for Cloud Run (`spry-api`) with only `roles/cloudsql.client` and secret-scoped `roles/secretmanager.secretAccessor`. No JSON keys downloaded; local runs use `gcloud` ADC. |
| Terraform `aws` provider (`infra/`) | **Terraform `google` provider (`gcp/`)** | **Add alongside `infra/`** | Separate `gcp/` folder and separate HCP Terraform workspace (`meetings-gcp-dev` in `123boh`) so one cloud's `plan`/`apply` cannot touch or break the other cloud. |

### 2. Required Architectural Answers

1. **The database (`Cloud SQL 24/7` vs `Cloud SQL stopped at night` vs `Firestore` vs `Cross-cloud AWS Aurora`):**
   - **Cloud SQL 24/7 (`db-f1-micro`, 10 GB SSD):** Zero code changes (SQLAlchemy + Alembic + `psycopg` work out of the box), low latency inside `us-central1` via Cloud SQL Auth Proxy Unix socket (`/cloudsql/...`), predictable performance with no cold-resume lag. However, it costs `~$9.37/month` (`$7.67` compute + `$1.70` SSD) even with zero traffic because Cloud SQL does not auto-pause.
   - **Cloud SQL stopped when idle (`activation_policy = NEVER`):** Same zero code changes and low intra-region latency when started, while cutting idle compute to `$0` (paying only `~$1.70/month` for 10 GB SSD + `~$0.0105/h` while active). Requires manually starting/stopping (e.g. via `gcloud` or Terraform variable) and ~1–2 minutes startup time. **This is the choice for Spry's core on GCP.**
   - **Firestore:** Drops cost to `$0/month` for student/idle traffic (`50,000` reads and `20,000` writes free daily) with zero instance management. The trade-off is completely rewriting Spry's relational schema (`users`, `meetings`, `participants`, `meeting_participants` join table), SQLAlchemy models, Alembic migrations, and queries (denormalizing documents and counting reads per screen).
   - **Keep Aurora on AWS and call across clouds:** Avoids migrating data/schema, and Aurora still pauses to `$0` compute. However, every DB query crosses the public internet between `us-central1` (GCP) and `us-east-1` (AWS), adding `~15–40 ms` RTT per query (multiplied by non-pooled or multi-query endpoints), incurring AWS data egress charges (`$0.09/GB`), and forcing Aurora into public subnets/TLS exposure instead of private VPC isolation. Too brittle and slow for normal operation.

2. **E-mail provider and secret storage:**
   - Because GCP offers no native transactional e-mail service, the pragmatic options are **SendGrid** or **Mailgun** (REST API over HTTPS, free/low-tier plans) or **keeping AWS SES** in a multicloud setup.
   - For Spry, we **keep AWS SES** (already verified for `bohatyrov.pn@ucu.edu.ua` in `infra/terraform.tfvars`) until the reporting pipeline moves. If/when the mailer moves to Cloud Run using SendGrid or Mailgun, its API key lives in **GCP Secret Manager** (`google_secret_manager_secret`), mounted into Cloud Run at runtime via environment variable `value_source` (never committed to Git or Terraform `.tfvars`).

3. **Which features stay on AWS, and why:**
   - **Sign-in (`infra/auth.tf` — Cognito + Google IdP):** Already configured with Hosted UI, Google OAuth client, and user pool state; moving to Identity Platform requires re-configuring OAuth redirects and verifying tokens differently on both backend and frontend. (Core GCP deployment runs with auth disabled for local/demo testing, or can add Identity Platform later.)
   - **Weekly reports (`infra/reports.tf` — EventBridge Scheduler, SQS, Report Builder/Mailer Lambdas, S3, SES):** Depends on AWS SES and private VPC Lambdas; no user-facing latency penalty if left on AWS while core CRUD runs on GCP.
   - **AI Agenda Parser (`infra/ai.tf` — Bedrock Claude Haiku Lambda):** Bedrock already gives direct IAM-authenticated access to Claude Haiku without API keys, whereas GCP Free Trial credits do not pay for partner models (Claude) on Vertex AI.

## Consequences
- `gcp/` is completely isolated from `infra/`, using its own HCP Terraform workspace (`meetings-gcp-dev`) and `google` provider.
- The backend `back/Dockerfile` remains cloud-agnostic (plain `uvicorn` reading `$PORT`), while `back/Dockerfile.lambda` remains untouched for AWS Lambda.
- Running Cloud SQL `db-f1-micro` incurs hourly charges unless stopped (`activation_policy = NEVER`) or destroyed (`terraform destroy`) after testing.
