# Lab 9: Cost Comparison (Part 3) & Data/AI Stack Guide (Part 4)

## Part 3 — Cost Comparison: AWS (`us-east-1`) vs Google Cloud (`us-central1`)

All prices are on-demand list prices in USD, excluding tax, assuming **730 hours/month**.

### Chosen Architecture & Free-Tier Assumptions
- **GCP (`us-central1`, project `onetwothree-514711`):**
  - **Frontend:** Firebase Hosting Spark (free) plan — `10 GB` storage, `360 MB/day` transfer → `$0`.
  - **API:** Cloud Run (request-based billing, `min_instance_count = 0`, `1 vCPU`, `512 MiB`) — free tier covers `2M` requests, `180,000` vCPU-s, and `360,000` GiB-s/month → `$0` across all four student/demo profiles (assuming `<= 1.5M` light API requests/month even in the 24/7 profile, ~50 ms CPU per request = `75,000` vCPU-s < `180,000` free).
  - **Database:** Cloud SQL for PostgreSQL `db-f1-micro` (`$0.0105/h` while running) + `10 GB` SSD (`$0.17/GB-month` = `$1.70/month`, billed even while stopped). Automated backups disabled for lab.
  - **Registry / Secrets / Logs:** Artifact Registry (`< 0.5 GB` free), Secret Manager (`1` active version < `6` free, `< 10,000` accesses free), Cloud Logging (within free allotment) → `$0`.
- **AWS (`us-east-1`, Lab 4 / `infra/`):**
  - **Frontend:** S3 + CloudFront Free plan + WAF → `$0`.
  - **API:** Lambda + Function URL (`1M` requests and `400,000` GB-s free/month) → `$0`.
  - **Database:** Aurora Serverless v2 (`0–1 ACU`), pauses after 5 min idle; minimum active capacity when awake is `0.5 ACU` (`0.5 × $0.12/ACU-h = $0.06/h`), plus `~1 GB` storage (`$0.10/GB-month`).
  - **Registry / Secrets / Logs:** `~$0.20–$0.30/month` baseline (using Lab 9 reference baseline `≈ $0.30/month` total when idle).

### Reference Profile (`nobody`, Cloud SQL stopped vs running)

| Piece | AWS (`us-east-1`) | Google Cloud (`us-central1`, Cloud SQL) | Google Cloud (if Firestore instead) |
| --- | --- | --- | --- |
| Frontend + CDN + HTTPS | CloudFront Free plan + WAF → `$0.00` | Firebase Hosting free plan → `$0.00` | Firebase Hosting free plan → `$0.00` |
| API | Lambda, idle → `$0.00` | Cloud Run, scaled to zero → `$0.00` | Cloud Run, scaled to zero → `$0.00` |
| Database compute | Aurora, paused → `$0.00` | `$0.00` (stopped) / `$7.67` (730h running) | `$0.00` (within `50k` reads/day) |
| Database storage | `~1 GB` at `$0.10/GB` → `$0.10` | `10 GB` SSD at `$0.17/GB` → `$1.70` | `1 GiB` free → `$0.00` |
| Registry, secrets, logs | `~$0.20` (a few cents) | `$0.00` (within free tier) | `$0.00` (within free tier) |
| **Total (idle)** | **≈ $0.30 / month** | **$1.70** (stopped) / **$9.37** (running) | **$0.00 / month** |

### Four Traffic Profiles Comparison

*(Assuming Cloud SQL is started only during active hours for `class demos` and `office hours`, and Aurora runs at minimum active `0.5 ACU` during active hours.)*

| Traffic Profile | Active DB Hours | AWS Total (`us-east-1`, Aurora `0.5 ACU`) | GCP Total (`us-central1`, Cloud SQL `db-f1-micro` stopped when idle) | GCP Total if Cloud SQL left running 24/7 | Cheaper Cloud |
| --- | --- | --- | --- | --- | --- |
| **Nobody** (idle) | `0 h` | **$0.30** | `$1.70` | `$9.37` | **AWS** |
| **Class demos** (`10 × 2 h`) | `20 h` | **$1.50** (`$1.20` ACU + `$0.30`) | `$1.91` (`$0.21` SQL + `$1.70`) | `$9.37` | **AWS** |
| **Office hours** (`8 h × 22 d`) | `176 h` | `$10.86` (`$10.56` ACU + `$0.30`) | **$3.55** (`$1.85` SQL + `$1.70`) | **$9.37** | **GCP** |
| **Busy around the clock** | `730 h` | `$44.10` (`$43.80` ACU + `$0.30`) | **$9.37** (`$7.67` SQL + `$1.70`) | **$9.37** | **GCP** |

### Answers to Part 3 Questions

1. **Which cloud is cheaper for each profile, and which single line decides it?**
   - **Database compute (plus Cloud SQL's 10 GB minimum storage at idle)** is the single deciding line across all four profiles.
   - For **nobody** and **class demos (20 h)**, **AWS is cheaper** (`$0.30` and `$1.50` vs `$1.70` and `$1.91`) because Aurora auto-pauses to `$0` compute and bills storage per GB actually used (`~1 GB = $0.10`), whereas Cloud SQL always bills `10 GB` SSD (`$1.70/month`) even when stopped.
   - For **office hours (176 h)** and **busy 24/7 (730 h)**, **GCP is significantly cheaper** (`$3.55` and `$9.37` vs `$10.86` and `$44.10`) because `db-f1-micro` costs `$0.0105/h` while Aurora's minimum active `0.5 ACU` costs `$0.06/h` (~5.7× higher per active hour; at `1 ACU` it is `$87.90` vs `$9.37`).

2. **What is the GCP equivalent of Aurora's "staying awake" billing trap?**
   - **Cloud SQL never auto-pauses:** forgetting to stop `db-f1-micro` when idle immediately adds `$7.67/month` (or `$25.55/month` if `db-g1-small` is selected), and provisioning an oversized Cloud SQL disk is sticky because Cloud SQL SSD disks cannot be shrunk easily afterward.
   - **Cloud Run `min_instance_count > 0` (always warm) or `cpu_idle = false`:** keeps vCPU/memory billed 24/7 instead of scaling to zero.
   - **Firestore unindexed / full-collection reads:** a UI screen that fetches hundreds of documents per visit exhausts the `50,000` free daily reads quickly (`$0.03` per 100k reads).

---

## Part 4 — AI & Data Stack Reflection + Demo Guide

### 1. Document AI vs General LLM (Lab 6 Agenda Parser)
- **When Document AI / Vision API is better:**
  - High-volume, standardized documents (invoices, receipts, IDs, tax forms, scanned PDFs with tables/checkboxes) where you need deterministic OCR, bounding boxes/coordinates, layout structure, and predictable per-page pricing (`$1.50/1k` pages for Enterprise OCR).
  - Visual/layout extraction where text order in PDFs breaks naive text extraction, or when compliance requires pretrained specialized processors without prompt drift.
- **When a general LLM (Vertex AI Gemini / Bedrock Claude) is better:**
  - Unstructured natural-language input with fuzzy semantics (like Spry's free-form agenda prompt: *"Team sync tomorrow at 10am with Anna about Q3 roadmap"*), where the task is reasoning, resolving relative dates/timezones, inferring missing fields, and mapping text into domain-specific JSON schemas.

### 2. Lab 8 Pipeline (Athena + Glue) Mapped to GCP
- **Lab 8 AWS → GCP mapping:**
  - **S3 raw/curated data** → **Cloud Storage**
  - **AWS Glue ETL / Crawlers** → **Dataflow** (Apache Beam batch/streaming pipelines; Google-provided templates like *Cloud Storage Text to BigQuery*)
  - **Amazon Athena (+ Glue Data Catalog)** → **BigQuery** (serverless SQL warehouse, native tables/schemas, `1 TiB` query + `10 GiB` storage free/month)
  - **Amazon QuickSight** → **Looker Studio** (free BI dashboards directly over BigQuery)
  - **Amazon MWAA** → **Cloud Composer** (Managed Airflow)
- **What you no longer have to manage:**
  - With **BigQuery**, there is no separate Glue Crawler/Catalog configuration, no manual S3 partitioning/SerDe tuning just to make SQL queries fast, and no separate Athena workgroup/spill bucket plumbing — storage and serverless SQL compute live in one engine. With **Dataflow**, the same Apache Beam code works for both batch and streaming without managing Spark clusters or worker provisioning.

### 3. Quick Steps for the 3 Required Screenshots

1. **BigQuery query (`bytes processed` visible):**
   - Open BigQuery Studio in project `onetwothree-514711` and run:
     ```sql
     SELECT
       language,
       SUM(views) AS total_views
     FROM `bigquery-public-data.wikipedia.pageviews_2023`
     WHERE DATE(datehour) = '2023-06-01'
     GROUP BY language
     ORDER BY total_views DESC
     LIMIT 15;
     ```
   - *(Alternative smaller public table if needed)*:
     ```sql
     SELECT
       name,
       SUM(number) AS total_births
     FROM `bigquery-public-data.usa_names.usa_1910_current`
     WHERE state = 'CA'
     GROUP BY name
     ORDER BY total_births DESC
     LIMIT 15;
     ```
   - Run the query and take a screenshot showing the results + **Job information → Bytes processed**.
2. **Looker Studio chart:**
   - Directly from BigQuery results click **Explore data → Explore with Looker Studio**, choose a Bar/Column chart (`name` vs `total_births`, or `language` vs `total_views`), and take a screenshot.
3. **Vision API or Document AI OCR:**
   - Open **Document AI → Workbench / Explore Processors → Document OCR** (or **Form Parser**) in `us` region, click **Create Processor**, upload any PDF/receipt/handwritten note image, and screenshot the extracted text/fields result.
