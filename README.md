# Meetings App

Monorepo with a FastAPI backend (`back/`), a React + shadcn/ui frontend (`front/`) and PostgreSQL,
all started with Docker Compose. See meetings in a week or day calendar, add them (title, time,
description, participants, call link, place), edit and remove them.

## Run everything

```bash
make up          # = cp .env.example .env (first time) + docker compose up --build --wait, then
                 #   docker compose watch: rebuilds backend/frontend when their files change
make start       # the same without watching (returns once the stack is healthy)
make help        # all targets: logs, test, lint, format, clean, aws-*
```

- App: http://localhost:3000 (sign in / sign up; the calendar is at `/home`). Until Cognito is set
  up (see [Sign-in](#sign-in-cognito)), nothing is checked: any valid form opens the calendar and
  everyone is one local user.
- API docs: http://localhost:3000/api/docs (or http://localhost:8000/api/docs directly)

If a host port is already taken, change `DB_PORT`, `BACKEND_PORT` or `FRONTEND_PORT` in `.env`.
`SEED=true` inserts 5 sample participants on first start. `docker compose down -v` wipes the database.

## Layout

```
compose.yaml      # db, backend, frontend
back/             # FastAPI + SQLAlchemy 2 + Alembic
  app/
    main.py       # app, CORS, error handlers
    lambda_handler.py # AWS Lambda entry point (Mangum) + migrate action
    models.py     # User, Meeting (owner_id → users), Participant, meeting_participants
    auth.py       # Cognito ID-token verification, current user
    schemas.py    # Pydantic request/response models
    services/     # business logic
    routers/      # /api/meetings, /api/participants, /api/health
  alembic/        # migrations (run on container start; on AWS via `make aws-backend-migrate`)
  Dockerfile.lambda # AWS Lambda image
  tests/
front/            # Vite + React + TypeScript + Tailwind + shadcn/ui
  src/
    pages/        # LoginPage (/), SignUpPage (/signup), ConfirmPage (/confirm), AuthCallbackPage
                  # (/auth/callback, Google), HomePage (/home, the calendar; needs sign-in)
    components/   # MeetingsCalendar, MeetingFormDialog, DeleteMeetingDialog, ParticipantsMultiSelect
    components/ui # generated shadcn components
    hooks/        # TanStack Query hooks
    lib/calendar.ts # date helpers and the overlap layout for the calendar
    lib/auth.ts   # Cognito sign-in/up, session and token refresh, Google (Hosted UI + PKCE)
    lib/api.ts    # typed fetch wrapper (VITE_API_URL = backend origin, empty = same origin)
  nginx.conf      # serves the SPA, proxies /api to backend
infra/            # CloudFormation: cognito, backend-ecr, backend (Lambda + Aurora), frontend (S3 + CloudFront)
```

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Liveness + DB check (no sign-in needed) |
| GET | `/api/me` | The signed-in user (created on first request) |
| PATCH | `/api/me` | Update the user's `name` |
| GET | `/api/meetings` | List meetings with participants, by start time |
| GET | `/api/meetings/{id}` | One meeting |
| POST | `/api/meetings` | Create a meeting |
| PUT | `/api/meetings/{id}` | Replace a meeting (same body as POST) |
| DELETE | `/api/meetings/{id}` | Delete a meeting |
| GET | `/api/participants?q=` | List/search participants |
| POST | `/api/participants` | Create a participant (409 on duplicate email) |
| DELETE | `/api/participants/{id}` | Delete a participant |
| GET | `/api/ai/models` | List available AWS Bedrock foundation models |
| POST | `/api/ai/parse-meeting` | Parse natural language prompt into meeting details using Bedrock |
| POST | `/api/meetings/ai` | Parse prompt and schedule meeting directly using Bedrock |

Everything except `/api/health` needs `Authorization: Bearer <Cognito ID token>`. Meetings are
personal: each belongs to the user who created it (`owner_id`), and other users get 404 for it. The
participant directory is shared. All IDs are UUIDs. A meeting needs a title, `starts_at` and `ends_at` (ISO 8601 with a timezone, end after start)
and at least one of `call_link` or `place`.

## AI Scheduling (AWS Bedrock)

Meetings can be scheduled using natural language prompts powered by foundation models on **AWS Bedrock** (e.g. Amazon Nova Micro / Lite / Pro, Meta Llama 3 8B).
- **In the UI**: Click **AI Schedule** in the header or **Fill with AI** inside the meeting form dialog.
- **VPC Endpoint / PrivateLink**: In AWS Lambda (which runs inside private VPC subnets without NAT Gateway to save costs), AWS Bedrock Runtime is accessed privately via the `com.amazonaws.<region>.bedrock-runtime` VPC Interface Endpoint.


## Sign-in (Cognito)

The browser signs in with a Cognito user pool directly: email + password (sign-up sends a 6-digit
code to confirm the email) and, once configured, Google through the Cognito Hosted UI. The API
verifies the ID token's signature, issuer, audience and expiry against the pool's public keys and
stores the user in the `users` table (keyed by the token's `sub`), where extra profile data lives.

```bash
make aws-cognito-deploy   # user pool + app client + Hosted UI domain; prints the lines for .env
make aws-cognito-env      # print them again
```

Paste the printed `COGNITO_*` lines into `.env` and run `make up`. The local backend and frontend
then use the real user pool. With `COGNITO_USER_POOL_ID` empty, auth is off: no token is checked and
every request acts as one local user (`dev@localhost`).

**Google sign-in** (off until configured): create an OAuth client ID (type "Web application") in
Google Cloud with the redirect URI `https://<COGNITO_DOMAIN>/oauth2/idpresponse`, set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then run `make aws-cognito-deploy` again and
copy `COGNITO_GOOGLE_ENABLED=true` into `.env`. On AWS, run `make aws-frontend-publish` to rebuild the
frontend with it. Until then the Google button shows as "coming soon".

On AWS the Lambda has no internet access, so `aws-backend-stack` downloads the pool's JWKS and passes
it in as `COGNITO_JWKS`. Cognito does not rotate user pool signing keys. Meetings created before
accounts existed have no owner, so nobody sees them.

## Local development

Backend (needs a Postgres, e.g. `docker compose up -d db`):

```bash
cd back
uv sync
DATABASE_URL=postgresql+psycopg://meetings:meetings@localhost:5432/meetings uv run alembic upgrade head
DATABASE_URL=postgresql+psycopg://meetings:meetings@localhost:5432/meetings uv run uvicorn app.main:app --reload
```

Frontend (Vite proxies `/api` to `http://localhost:8000`, override with `VITE_API_PROXY`):

```bash
cd front
npm install
npm run dev        # http://localhost:5173
```

## Tests

```bash
# backend: uses a separate database (created once)
docker compose exec db psql -U meetings -c "CREATE DATABASE meetings_test"
cd back && TEST_DATABASE_URL=postgresql+psycopg://meetings:meetings@localhost:5432/meetings_test uv run pytest

# frontend
cd front && npm test
```

## Code style

CI (`.github/workflows/code-style.yml`) runs on every push to `main` and on pull requests:

| Part | Tools | Run locally | Auto-fix |
| --- | --- | --- | --- |
| `back/` | Ruff (lint + format) | `uv run ruff check . && uv run ruff format --check .` | `uv run ruff check --fix . && uv run ruff format .` |
| `front/` | ESLint, Prettier, `tsc` | `npm run lint && npm run format:check && npm run typecheck` | `npm run format` |

Config lives in `back/pyproject.toml` (`[tool.ruff]`), `front/eslint.config.js` and `front/.prettierrc.json`.

## Deploy to AWS (backend on Lambda + Aurora Serverless, frontend on CloudFront)

Everything is deployed to **us-east-1**. CloudFront accepts custom-domain certificates only from that region. Infrastructure is CloudFormation in `infra/`:

- `infra/cognito.yaml`: Cognito user pool (email + password, self sign-up with email code), public app client, Hosted UI domain, and Google as an identity provider when `GOOGLE_CLIENT_ID` is set.
- `infra/backend-ecr.yaml`: ECR repository for the backend's Lambda container image (`back/Dockerfile.lambda`).
- `infra/backend.yaml`: VPC with private subnets, Aurora Serverless v2 PostgreSQL (scales to 0 ACU when idle), and a Lambda function with a public **function URL**, which is the backend URL.
- `infra/frontend.yaml`: private S3 bucket and CloudFront distribution for the SPA on the **flat-rate Free plan** ($0/month, with the WAF web ACL the plan requires), with an optional custom domain.

Every resource carries the tag `PROJECT_NAME=<project>`. It is set in the templates and as a stack tag, and `cert.sh` puts it on the ACM certificate. Some resource types can't be tagged in AWS at all: function URLs, Lambda permissions, the bucket policy, the CloudFront origin access control, Route 53 records and the pricing plan subscription.

```mermaid
flowchart LR
    B[Browser] -->|HTTPS| CF[CloudFront + WAF<br/>Free plan, optional custom domain]
    CF --> S3[(S3<br/>built SPA)]
    B -->|HTTPS, CORS| URL[Lambda function URL]
    URL --> L[Lambda<br/>FastAPI via Mangum<br/>private subnets]
    L -->|:5432| DB[(Aurora Serverless v2<br/>PostgreSQL, private subnets)]
    L -. image .-> ECR[ECR]
```

1. Put credentials into `.env` (an IAM user or role allowed to use CloudFormation, EC2/VPC, Lambda, ECR, RDS, Secrets Manager, S3, CloudFront, WAF, Pricing Plan Manager, ACM, Route 53, IAM and CloudWatch Logs):

   ```
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   ```

2. Optionally copy `infra/backend.params.example.env` to `infra/backend.params.env` to override stack parameters (memory, Aurora capacity, seeding, …).
3. Deploy. The first run takes about 15 minutes, mostly waiting for Aurora and CloudFront:

   ```bash
   make aws-deploy   # = aws-cognito-deploy, aws-backend-deploy, then aws-frontend-deploy
   ```

   The steps run in this order:

   1. **Cognito** (`make aws-cognito-deploy`): user pool, app client and Hosted UI domain. Redirect URLs cover localhost and the site's origins. It prints the `.env` lines for local use.
   2. **Backend** (`make aws-backend-deploy`): ECR stack → build and push the Lambda image → backend stack → `aws-backend-migrate` invokes the function with `{"action": "migrate"}` to run Alembic and seeding. It prints the function URL (`https://<id>.lambda-url.us-east-1.on.aws/`).
   3. **Frontend** (`make aws-frontend-deploy`): frontend stack → `npm run build` with `VITE_API_URL=<function URL>` and the `VITE_COGNITO_*` IDs → upload to S3 and invalidate CloudFront → allow the site's origin in the backend's `CORS_ORIGINS` and as a Cognito redirect URL. It prints the site URL.

Other targets: `make aws-backend-outputs`, `aws-backend-status`, `aws-backend-logs`, `aws-backend-health`, `aws-backend-migrate`, `aws-frontend-outputs`, `aws-frontend-publish` (rebuild and upload the frontend only), `aws-destroy`. Use `ARCH=amd64` to build an x86 Lambda instead of Graviton (`arm64`, the default). Use `CLOUDFRONT_PLAN=PAY_AS_YOU_GO` if the account can't subscribe to the Free plan (accounts on the AWS Free Tier are not eligible, and each account gets at most 3 free plans).

### Custom domain for the frontend (optional)

By default the site is served on its `*.cloudfront.net` domain. To add a custom domain (default `onetwothree.dobosevych.com`, override with `FRONTEND_DOMAIN=app.example.com`), deploy once and then run:

```bash
make aws-frontend-cert        # 1. request the ACM certificate (free, us-east-1) and set up DNS validation
make aws-frontend-https       # 2. wait until it is issued, attach it to CloudFront, allow it in CORS, set up DNS
make aws-frontend-https-check # 3. curl https://onetwothree.dobosevych.com/
```

- **Domain's zone in Route 53 (same account):** the zone is found automatically. The validation record and alias `A`/`AAAA` records to CloudFront are created for you.
- **Any other DNS provider:** step 1 prints a validation `CNAME` to add there. Step 2 prints the `CNAME <domain> → <id>.cloudfront.net` record to add.

`make aws-frontend-cert-status` and `make aws-frontend-dns` show the records again. Once the certificate is issued, every later `make aws-deploy` keeps the domain. The backend stays on its function URL.

**Cost.** There is no load balancer, NAT gateway or public IPv4 address. Lambda and function URLs fit in the always-free tier for a small app. CloudFront runs on the flat-rate Free plan, which costs $0 with no overage charges and also covers its WAF web ACL (a per-IP rate limit). Requests that WAF blocks don't count toward the plan's allowance. Aurora Serverless v2 has no free tier. With `DbMinCapacity=0` it pauses after 5 idle minutes, and then you pay only for storage (about $0.10/GB-month). While active it costs about $0.12 per ACU-hour. The first request after a pause waits about 15 seconds while Aurora resumes. The DB credentials secret costs $0.40/month. Run `make aws-destroy` when you are done. It keeps a final Aurora snapshot.

On AWS the backend reads `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` instead of `DATABASE_URL`. The password is generated in Secrets Manager and resolved into the function's environment at deploy time, so the VPC needs no internet access. `DB_NULL_POOL=true` closes connections after each request, because idle connections from warm Lambdas would stop Aurora from pausing. Migrations do not run on cold start. `make aws-backend-migrate` runs them, and every `aws-backend-deploy` calls it.

## Infrastructure as Code (Terraform & HCP Terraform)

The infrastructure previously defined in CloudFormation (, , ) has been migrated to Terraform managed via **HCP Terraform**:
- **HCP Organization:** 
- **Workspace:**  (Remote execution via AWS IAM OIDC dynamic credentials)
- **Files:** Located in  (, , , , , ).
- **Plan check:** [0m[33mRunning plan in HCP Terraform. Output will stream here. Pressing Ctrl-C
will stop streaming the logs, but will not stop the plan running remotely.[0m

Preparing the remote plan...
[0m
The remote workspace is configured to work with configuration at
infra relative to the target repository.

Terraform will upload the contents of the following directory,
excluding files or directories as defined by a .terraformignore file
at /home/ivan/67_ooad/OneTwoThree/.terraformignore (if it is present),
in order to capture the filesystem context the remote workspace expects:
    /home/ivan/67_ooad/OneTwoThree

[0m[33mTo view this run in a browser, visit:[0m
[0m[33mhttps://app.terraform.io/app/123boh/meetings-dev/runs/run-1Wj2KELstNBMsadh[0m
[0m
Waiting for the plan to start...

Terraform v1.17.1
on linux_amd64

Initializing plugins and modules...
[1mdata.archive_file.report_mailer_zip: Refreshing...[0m[0m
[1mdata.archive_file.report_mailer_zip: Refresh complete after 0s [id=e9431a172793c50d2cb12e3719b0ce498f199229][0m[0m
[1mdata.aws_caller_identity.current: Refreshing...[0m[0m
[1maws_vpc_endpoint.s3_gateway: Refreshing state... [id=vpce-09859ebaf15676e1d][0m[0m
[1maws_cloudwatch_log_group.agenda_parser: Refreshing state... [id=/aws/lambda/meetings-agenda-parser][0m[0m
[1maws_sqs_queue.report_requests_dlq: Refreshing state... [id=https://sqs.us-east-1.amazonaws.com/388094503220/meetings-report-requests-dlq][0m[0m
[1maws_cloudwatch_log_group.report_mailer: Refreshing state... [id=/aws/lambda/meetings-report-mailer][0m[0m
[1maws_iam_role.report_mailer: Refreshing state... [id=meetings-report-mailer-role][0m[0m
[1maws_iam_role.scheduler: Refreshing state... [id=meetings-scheduler-sqs-role][0m[0m
[1maws_cloudwatch_log_group.report_builder: Refreshing state... [id=/aws/lambda/meetings-report-builder][0m[0m
[1maws_cognito_user_pool.main: Refreshing state... [id=us-east-1_HWNGYOPFG][0m[0m
[1maws_iam_role.agenda_parser: Refreshing state... [id=meetings-agenda-parser-role][0m[0m
[1mdata.aws_caller_identity.current: Refresh complete after 0s [id=388094503220][0m[0m
[1mdata.aws_secretsmanager_secret_version.db: Refreshing...[0m[0m
[1mdata.aws_secretsmanager_secret_version.db: Refresh complete after 0s [id=arn:aws:secretsmanager:us-east-1:388094503220:secret:DbSecret-TvzLywgjtefB-Am0ES9|AWSCURRENT][0m[0m
[1maws_iam_role_policy.backend_s3_requests: Refreshing state... [id=meetings-backend-BackendRole-1Z1k8Crn4UlJ:meetings-backend-s3-requests][0m[0m
[1maws_s3_bucket.reports: Refreshing state... [id=meetings-reports-388094503220][0m[0m
[1maws_iam_role.report_builder: Refreshing state... [id=meetings-report-builder-role][0m[0m
[1maws_sqs_queue.report_requests: Refreshing state... [id=https://sqs.us-east-1.amazonaws.com/388094503220/meetings-report-requests][0m[0m
[1maws_iam_role_policy_attachment.report_mailer_basic: Refreshing state... [id=meetings-report-mailer-role/arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole][0m[0m
[1maws_iam_role_policy.report_mailer_s3_ses_sqs: Refreshing state... [id=meetings-report-mailer-role:S3AndSesAndSqsPolicy][0m[0m
[1maws_lambda_function.report_mailer: Refreshing state... [id=meetings-report-mailer][0m[0m
[1maws_iam_role_policy_attachment.agenda_parser_basic: Refreshing state... [id=meetings-agenda-parser-role/arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole][0m[0m
[1maws_iam_role_policy.agenda_parser_bedrock: Refreshing state... [id=meetings-agenda-parser-role:BedrockInferenceAccess][0m[0m
[1maws_iam_role_policy.scheduler_sqs: Refreshing state... [id=meetings-scheduler-sqs-role:SqsSendMessage][0m[0m
[1maws_scheduler_schedule.report_schedule: Refreshing state... [id=default/meetings-weekly-report-schedule][0m[0m
[1maws_cognito_identity_provider.google[0]: Refreshing state... [id=us-east-1_HWNGYOPFG:Google][0m[0m
[1maws_cognito_user_pool_domain.main: Refreshing state... [id=meetings-388094503220][0m[0m
[1maws_cognito_user_pool_client.main: Refreshing state... [id=3rs93bjpui3leuq7qu2u37sn12][0m[0m
[1maws_lambda_permission.mailer_invoke_permission: Refreshing state... [id=AllowExecutionFromS3Bucket][0m[0m
[1maws_iam_role_policy.report_builder_sqs: Refreshing state... [id=meetings-report-builder-role:SqsReportsConsumerAccess][0m[0m
[1maws_iam_role_policy.report_builder_s3: Refreshing state... [id=meetings-report-builder-role:S3ReportsPutAccess][0m[0m
[1maws_iam_role_policy_attachment.report_builder_vpc_access: Refreshing state... [id=meetings-report-builder-role/arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole][0m[0m
[1maws_lambda_function.report_builder: Refreshing state... [id=meetings-report-builder][0m[0m
[1maws_s3_bucket_lifecycle_configuration.reports: Refreshing state... [id=meetings-reports-388094503220][0m[0m
[1maws_s3_bucket_notification.reports: Refreshing state... [id=meetings-reports-388094503220][0m[0m
[1maws_s3_bucket_public_access_block.reports: Refreshing state... [id=meetings-reports-388094503220][0m[0m
[1maws_cognito_managed_login_branding.main: Refreshing state...[0m[0m
[1maws_lambda_function.agenda_parser: Refreshing state... [id=meetings-agenda-parser][0m[0m
[1maws_lambda_event_source_mapping.report_builder: Refreshing state... [id=62ecee0b-c8d2-429e-85d2-5d582aea248f][0m[0m
[1maws_lambda_function_url.agenda_parser: Refreshing state... [id=meetings-agenda-parser][0m[0m
[1maws_lambda_permission.agenda_parser_url_permission: Refreshing state... [id=FunctionURLAllowPublicAccess][0m[0m
[1maws_lambda_permission.agenda_parser_invoke_permission: Refreshing state... [id=meetings-ai-AgendaParserFunctionInvokePermission-HxrIATimJrn1][0m[0m

[0m[1m[32mNo changes.[0m[1m Your infrastructure matches the configuration.[0m

[0mTerraform has compared your real infrastructure against your configuration
and found no differences, so no changes are needed.
[90m
─────────────────────────────────────────────────────────────────────────────[0m

Note: You didn't use the -out option to save this plan, so Terraform can't
guarantee to take exactly these actions if you run "terraform apply" now. or run speculative plans via GitHub Pull Requests.
