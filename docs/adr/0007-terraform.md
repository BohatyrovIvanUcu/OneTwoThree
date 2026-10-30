# ADR 0007: Migration from CloudFormation to Terraform & HCP Terraform

## Status
Accepted

## Context
In Labs 4, 5, and 6, infrastructure components were provisioned using AWS CloudFormation templates:
- `infra/cognito.yaml` (Cognito User Pool, App Client, Domain, Google IdP, Managed Login Branding)
- `infra/reports.yaml` (S3 reports bucket, SQS request queue & DLQ, EventBridge Scheduler, VPC Endpoint, Report Builder & Mailer Lambdas)
- `infra/ai.yml` (AWS Bedrock Claude Haiku Agenda Parser Lambda & Function URL with CORS)

While CloudFormation works seamlessly within a single AWS account, it has distinct limitations:
1. It is bound strictly to AWS APIs (cannot declaratively manage external resources such as Google Cloud OAuth clients, GitHub repository settings, DNS, or multi-cloud services).
2. It lacks cross-cloud drift inspection and unified planning workflows.
3. Multi-environment parity (dev, stage, prod) requires cumbersome template duplication or nested stacks.

## Decision
We moved the project's infrastructure definitions from AWS CloudFormation to Terraform (HCL), managed centrally in **HCP Terraform** (workspace `meetings-dev` within organization `123boh`).

1. **State Management & Execution:**
   - HCP Terraform manages the central state backend and state locking.
   - Execution mode is set to **Remote**.
   - Dynamic OIDC credentials are used via an IAM OIDC Identity Provider (`aws_iam_openid_connect_provider.tfc`) and an assumed IAM role (`arn:aws:iam::388094503220:role/hcp-terraform-123boh`). No static AWS access keys are stored in HCP Terraform.
2. **Resource Migration (Zero Data Loss):**
   - CloudFormation templates were updated with `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` prior to stack deletion.
   - All 34 existing cloud resources were adopted into Terraform using native `import` blocks without recreation or downtime.
   - No user accounts in Cognito and no reports in S3 were lost during the migration.
3. **Secrets & Configurations:**
   - Sensitive variables (`google_client_secret`) are configured directly in HCP Terraform workspace variables marked as `sensitive = true`.
   - Non-sensitive variables are declared in `infra/variables.tf` with defaults in `infra/terraform.tfvars`.

## Alternatives Considered
- **AWS CloudFormation:** Kept state inside AWS, but lacks multi-provider support, cross-cloud capability, and unified plan reviews.
- **AWS CDK:** High abstraction in TypeScript/Python, but still compiles down to CloudFormation and shares its vendor-lock and limitations.
- **OpenTofu:** Fully open-source drop-in replacement for Terraform, compatible with our HCL configurations. We chose Terraform with HCP Terraform for its native cloud execution and OIDC credential management.

## Consequences & Operational Impact
- **Who changes infrastructure now:** All infrastructure changes are proposed via Pull Requests in Git. HCP Terraform executes speculative plans on PRs and performs `apply` automatically or upon merge. Developers no longer run `terraform apply` locally.
- **Secrets & State Storage:** Sensitive values are stored encrypted in HCP Terraform state and variable vaults. They never appear in plaintext logs or plans.
- **What happens if HCP Terraform is down:** State versions can be fetched or disaster-recovery workflows can execute locally using temporary AWS credentials, pointing to local state backup if necessary.
