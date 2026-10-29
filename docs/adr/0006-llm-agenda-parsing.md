# ADR 0006: LLM Agenda Parsing via Amazon Bedrock (Outside-VPC Split Architecture)

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Architecture & Engineering Team
- **Consulted:** Course Guidelines (Lab 6)

---

## 1. Context and Problem Statement

Real-world meeting agendas do not arrive as neatly formatted structured fields; they arrive as messy emails, Slack chat messages, or quick notes (e.g., *"Пн 10:00, синк по прайсингу, 45 хв. 1) нові тарифи Pro — Олена, 15 хв 2) фідбек від клієнтів — Taras..."*). Users need an effortless way to paste unstructured text and have the system convert it into a structured agenda with discussion topics, durations, owners, and action items.

However, incorporating an LLM into the production architecture introduces strict architectural constraints:
1. **Zero Standing Cost ($0 Idle Cost):** The application runs serverlessly on AWS Free Tier without NAT Gateways ($32.40/month/AZ).
2. **Data & Action Integrity:** LLMs are probabilistic. They can hallucinate values, miscalculate durations, or succumb to prompt injections. The model must never perform write operations directly.
3. **Security & Multi-Tenancy:** External text pasted by users is untrusted data and must never be interpreted as system instructions.
4. **Latency & Observability:** LLM calls take 2–6 seconds and cost money per token. Every invocation must be authenticated, rate/length-limited, and logged with exact token usage and financial cost.

---

## 2. Decision

We implement the **"Paste an agenda"** feature using a decoupled **Split Architecture**:
1. **Model:** We use **Claude Haiku 4.5** (`anthropic.claude-haiku-4-5-20251001-v1:0`) via Amazon Bedrock, with `PARSER_MODEL` configurable in environment variables. Claude Haiku provides exceptional multilingual parsing (Ukrainian/English), strict schema conformance via tools (`record_agenda`), and ultra-low cost ($0.10/M input tokens, $0.50/M output tokens; ~$0.0007 per parse).
2. **Outside-VPC Parser Lambda with Function URL:**
   - The parser Lambda function (`meetings-agenda-parser`) runs **strictly outside the VPC**.
   - It needs no database access; it takes text and returns JSON.
   - It reaches Amazon Bedrock directly over the AWS public network at **$0 fixed networking cost** (no NAT Gateway and no $14.40/mo VPC Interface Endpoint).
   - It exposes an `AWS::Lambda::Url` (AuthType: `NONE`, CORS restricted to frontend origins).
   - Authentication is strictly verified in-code against Cognito JWKS (RSA-256). Unauthenticated requests are rejected with 401.
   - Payloads > 10,000 characters are rejected with 413 before invoking Bedrock.
3. **The Model Suggests, the Person Decides:**
   - The model never touches the database and never writes data.
   - The frontend renders an interactive pre-filled form where all model-derived fields are marked with visual **"suggested"** badges.
   - When the user edits or touches a field, the badge clears.
   - Persistence occurs exclusively when the human user clicks **"Save Agenda"**, sending the verified payload through the standard authenticated API (`POST /meetings/{id}/agenda`) inside the VPC.
4. **Quality Signal Tracking:**
   - The save request transmits the finalized agenda alongside the original `ai_suggestion` snapshot (original JSON, model ID, prompt version).
   - PostgreSQL stores both in `agenda` (JSONB) and `ai_suggestion` (JSONB) on the `meetings` table. The delta between suggested and saved values serves as an ongoing implicit evaluation dataset.

---

## 3. Alternatives Considered and Rejected

### Alternative 1: Calling Bedrock from the Main Backend Lambda inside VPC via a VPC Interface Endpoint
- *Why it lost:* The backend Lambda lives in a private subnet with no NAT Gateway. To reach Bedrock from within the VPC, we would need to provision AWS PrivateLink VPC Interface Endpoints (`com.amazonaws.us-east-1.bedrock` and `com.amazonaws.us-east-1.bedrock-runtime`).
- *Cost penalty:* Interface Endpoints cost ~$0.01/hour per AZ (~$7.20/month per AZ, or ~$14.40/month for high availability across 2 AZs) plus data processing fees, even when completely idle! This violates our strict $0.00/month idle cost requirement. Moving the parser outside the VPC achieves identical security for $0.00 fixed cost.

### Alternative 2: Calling the Anthropic Claude API Directly (api.anthropic.com)
- *Why it lost:* Requires provisioning and securing separate third-party API keys (storing secrets, risking leaks), introduces a separate billing contract outside AWS, bypasses AWS IAM role-based authorization, and prevents using AWS Budgets/CloudWatch cost allocation tags for unified cloud financial management.

### Alternative 3: Plain Regular-Expression / Rule-Based Parser
- *Why it lost:* Human agendas are written in chaotic natural language with mixed languages (Ukrainian + English), varied date formats (*"next Tuesday after lunch"*, *"до п'ятниці"*), ambiguous names, bullet points, and conversational filler. Regular expressions are brittle, fail on unpredicted phrasing, and require exponential maintenance for multilingual support.

---

## 4. Consequences

### Positive
- **Zero Idle Infrastructure Cost:** $0.00/month when idle. Pay only ~$0.0007 per active parse.
- **Robust Security:** Unauthenticated traffic is blocked at the perimeter; prompt injection is isolated by schema boundaries and human-in-the-loop review.
- **Auditability & Observability:** Every parse outputs a structured JSON log line with user sub, model, prompt version, input/output tokens, latency in ms, and estimated cost in USD.
- **Zero-Effort Evaluation:** Storing `ai_suggestion` alongside saved agendas generates ground-truth data for evaluating prompt revisions (`agenda-v1` vs `agenda-v2`).

### Negative / Trade-Offs
- **Two Lambda Functions:** The backend API and AI parser are deployed as separate Lambda functions (mitigated by sharing the same container image with alternate command entry points).
- **Graceful Degradation when Bedrock is Unavailable:** If Bedrock experiences an outage or throttling (HTTP 429), the parser returns a descriptive error and the user simply types their agenda into the form manually. The core calendar, meeting scheduling, and reporting features remain 100% operational.

