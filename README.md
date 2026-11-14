# Resolver — Incident Management Platform with AI Assistant (Phase 1 / SRS-AI-001)

Resolver is a production-grade, multi-tenant incident management and response platform engineered for high reliability and rapid recovery. Phase 1 introduces an AI-powered copilot subsystem designed strictly under **Human-in-the-Loop** principles, a **Fail-Open** architecture, and a **Rules-First** triage hierarchy.

---

## Table of Contents

1. [Architecture & System Design](#architecture--system-design)
2. [Safety & Security Constraints (Hard Rules)](#safety--security-constraints-hard-rules)
3. [AI Phase 1 Capabilities](#ai-phase-1-capabilities)
4. [Prerequisites & Environment Setup](#prerequisites--environment-setup)
5. [Installation & Startup](#installation--startup)
6. [BullMQ Background Processing & Admin UI](#bullmq-background-processing--admin-ui)
7. [API Reference (AI Endpoints)](#api-reference-ai-endpoints)
8. [Automated Test Suite](#automated-test-suite)
9. [Manual Smoke Test Guide](#manual-smoke-test-guide)
10. [Dual-Core AMD A6 / Low-Resource Compliance](#dual-core-amd-a6--low-resource-compliance)

---

## Architecture & System Design

The AI subsystem operates asynchronously alongside Resolver's core incident lifecycle. It uses a **Rules-First** approach: deterministic evaluation runs synchronously, and external LLMs are consulted only when rules are inconclusive or when generative summarization / postmortem drafting is requested.

```
                         [ Alert / User Input ]
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │ Tier-1 Rules Engine   │ ◄── Pure synchronous (<1ms)
                        └───────────┬───────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
        [ Inconclusive / Text ]              [ Definitive Tier-1 ]
                  │                                   │
                  ▼                                   ▼
        ┌───────────────────┐               ┌───────────────────┐
        │   BullMQ Queue    │               │  Direct Suggestion│
        └─────────┬─────────┘               └─────────┬─────────┘
                  │                                   │
                  ▼                                   │
        ┌───────────────────┐                         │
        │ Redaction Engine  │ (PII / Secrets scrub)   │
        └─────────┬─────────┘                         │
                  │                                   │
                  ▼                                   │
        ┌───────────────────┐                         │
        │ Provider Adapter  │ (Groq/Gemini/Ollama/    │
        │ (<incident_data>) │  Fake)                  │
        └─────────┬─────────┘                         │
                  │                                   │
                  ▼                                   │
        ┌───────────────────┐                         │
        │  Zod Validation   │                         │
        └─────────┬─────────┘                         │
                  │                                   │
                  └─────────────────┬─────────────────┘
                                    ▼
                        ┌───────────────────────┐
                        │ ai_suggestions (Audit)│
                        │ & Incident Subdoc     │
                        └───────────┬───────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │ Responder UI Decision │
                        │ [Accept|Edit|Dismiss] │ ◄── RBAC Enforced
                        └───────────┬───────────┘
                                    │
                                    ▼
                        [ Mutates finalSeverity ]
```

---

## Safety & Security Constraints (Hard Rules)

Resolver enforces strict safety guarantees across all layers of the stack:

| # | Hard Rule | Architectural Implementation |
|---|-----------|------------------------------|
| **1** | **AI Only Suggests** | AI suggestions **never** mutate `incident.severity` or `incident.status` autonomously, and **never** page engineers. Accepting triage in the UI/API is the **only** path by which `ai.severity` becomes `finalSeverity`. |
| **2** | **Fail-Open Architecture** | If AI is disabled, Redis is offline, or external LLM APIs fail, incident creation and core incident management **never block**. Background jobs fail silently or record errors without interrupting users. |
| **3** | **Rules-First Priority** | Tier-1 rules evaluate title, description, tags, service criticality, and alert labels deterministically. If a Tier-1 rule triggers, external AI cannot override the resulting severity suggestion. |
| **4** | **Strict Redaction** | All outgoing prompts pass through `server/src/services/ai/redaction.ts` to scrub passwords, tokens, API keys, emails, phone numbers, and IPv4 addresses before reaching any external LLM. |
| **5** | **Delimiter Defense & Validation** | Untrusted user data in prompts is bounded (max 500 characters) and enclosed inside `<incident_data>...</incident_data>` delimiters with strict system instructions to ignore commands within. Model responses are strictly parsed and validated against Zod schemas. |
| **6** | **Decision Audit Trail** | Every triage, summary, and postmortem generation is saved to the `ai_suggestions` collection with input/output hashes, token metrics, model agreement rate, and user feedback. |

---

## AI Phase 1 Capabilities

### 1. Rules-First Severity Triage
- Evaluates incoming incidents against deterministic rules (e.g., database outage, payment gateway failure, production drop).
- If rules are inconclusive, dispatches an asynchronous job to the configured AI provider to analyze root cause likelihood, suggest severity (`SEV1`–`SEV4`), assign a confidence score (0.0–1.0), and propose culprit services or responder teams.

### 2. Incident Status Summary
- Synthesizes incident title, description, service details, and the latest chronological responder comments/updates into a concise, 2–3 sentence executive briefing.
- Highlights current operational impact and active mitigation efforts for newly arriving responders.

### 3. Postmortem Generation
- **Guarded Execution**: Exclusively available for incidents in `RESOLVED` or `CLOSED` status (attempting to generate a postmortem for open incidents returns HTTP `400 Bad Request`).
- Outputs an actionable postmortem draft containing:
  - Incident Overview & Root Cause Analysis
  - Timeline Synopsis
  - Action Items with suggested owners and priorities
  - Lessons Learned and preventative recommendations

### 4. Human-in-the-Loop Feedback Loop
- Responders can **Accept**, **Edit**, or **Dismiss** AI severity suggestions.
- Accepting or editing updates `finalSeverity` and `aiAccepted` on the incident, while recording the responder's decision, rationale, and edit notes in the audit log.
- Developers can review AI suggestions; role-based access control (RBAC) ensures only `SUPER_ADMIN`, `ADMIN`, or `INCIDENT_LEAD` can modify severity.

---

## Prerequisites & Environment Setup

- **Node.js**: `v18.x` or `v20.x`
- **MongoDB**: `v6.0+` or `v7.0+` running on `mongodb://localhost:27017/resolver`
- **Redis**: Lightweight container for BullMQ background queues (see Docker setup below)

### Redis Setup (Single Docker Command)

In accordance with machine resource constraints, run a lightweight Alpine Redis instance:

```bash
docker run -d --name resolver-redis -p 6379:6379 redis:alpine
```

*(Note: If Docker is unavailable or Redis is stopped, Resolver continues to run normally in fail-open mode without background queueing).*

---

## Installation & Startup

### 1. Environment Configuration

Copy `.env.example` in `server/` to `server/.env`:

```bash
cp server/.env.example server/.env
```

Key environment variables in `server/.env`:

```ini
# Core Configuration
PORT=5000
MONGODB_URI=mongodb://localhost:27017/resolver
REDIS_URL=redis://localhost:6379

# Frontend URLs & Invitations
CLIENT_URL=http://localhost:5173
INVITATION_BASE_URL=http://localhost:5173/accept-invitation

# Email Delivery Configuration (brevo HTTP API is default for cloud platforms like Render)
EMAIL_PROVIDER=brevo
EMAIL_API_KEY=your_brevo_api_key_here
EMAIL_FROM="Resolver Notifications <notifications@resolver.internal>"

# Optional SMTP Provider (alternative to Brevo HTTP; ports 25/465/587 blocked on Render free)
# EMAIL_PROVIDER=smtp
# SMTP_HOST=smtp-relay.brevo.com
# SMTP_PORT=587
# BREVO_SMTP_USER=your_brevo_smtp_login
# BREVO_SMTP_PASS=your_brevo_smtp_key

# AI Phase 1 Settings
AI_ENABLED=true
AI_PROVIDER=fake                   # Options: fake | groq | gemini | ollama
AI_MODEL=llama-3.3-70b-versatile    # Model name passed to provider

# External API Keys (backend only - never exposed to client)
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
OLLAMA_HOST=http://localhost:11434

# Safety Limits
AI_TIMEOUT_MS=30000
AI_DAILY_CAP=50
AI_REDACT_IPS=true
```

#### Deployment & Email Configuration Table

| Variable | Description | Default / Example | Required in Production |
|---|---|---|---|
| `NODE_ENV` | Environment mode | `production` | Yes |
| `PORT` | Listening port (assigned by host on Render) | `10000` | Yes |
| `APP_URL` | Public backend URL | `https://resolver-api.onrender.com` | Yes |
| `MONGODB_URI` | MongoDB Atlas cluster connection URI | `mongodb+srv://...` | Yes |
| `REDIS_URL` | Upstash Redis connection URI (with TLS) | `rediss://...` | Yes |
| `CLIENT_URL` | Frontend origin for CORS and invitation links | `https://resolver.vercel.app` | Yes |
| `EMAIL_PROVIDER` | Email delivery adapter (`brevo` HTTP API or `smtp`) | `brevo` (Render default) | Yes |
| `EMAIL_API_KEY` | Brevo v3 API key for HTTPS transactional email | `xkeysib-...` | Yes |
| `EMAIL_FROM` | Sender address verified in Brevo | `notifications@yourdomain.com` | Yes |
| `JWT_ACCESS_SECRET` | Secret key for access token signing | Strong 32+ char secret | Yes |
| `JWT_REFRESH_SECRET`| Secret key for refresh token signing | Strong 32+ char secret | Yes |
| `COOKIE_SECRET` | Secret key for signed cookie verification | Strong 32+ char secret | Yes |
| `ALERT_INGEST_SECRET` | Secret key for alert webhook ingestion | Strong 16+ char secret | Yes |

### 2. Backend (Server)

```bash
# Install dependencies
npm --prefix server install

# Run database build / type check
npm --prefix server run build

# Start in development mode (Express on http://localhost:5000)
npm --prefix server run dev
```

### 3. Frontend (Client)

```bash
# Install dependencies
npm --prefix client install

# Type check & production build
npm --prefix client run build

# Start Vite dev server (on http://localhost:5173)
npm --prefix client run dev
```

---

## BullMQ Background Processing & Admin UI

Resolver uses BullMQ for asynchronous triage jobs with retry mechanisms, exponential backoff, and dead-letter queueing.

- **Queue Name**: `ai-triage`
- **Job Name**: `triage-incident`
- **Bull Board Dashboard**: Accessible at `http://localhost:5000/admin/queues`

*Security Note: Access to `/admin/queues` is protected by `requireAuth` and `requireRole(["SUPER_ADMIN", "ADMIN"])`. Bearer token authentication is required.*

---

## API Reference (AI Endpoints)

All endpoints require authentication (`Authorization: Bearer <access_token>`).

### 1. Request AI Triage
`POST /api/v1/incidents/:id/ai/triage`
- Dispatches or calculates triage analysis for the specified incident.
- **RBAC**: Any authenticated team member.
- **Response**: `{ success: true, data: { suggestionId, suggestedSeverity, confidence, rationale, culpritService, culpritTeam } }`

### 2. Request Status Summary
`POST /api/v1/incidents/:id/ai/summary`
- Generates a concise incident status briefing based on latest activity.
- **RBAC**: Any authenticated team member.
- **Response**: `{ success: true, data: { summary, generatedAt, model } }`

### 3. Request Postmortem Draft
`POST /api/v1/incidents/:id/ai/postmortem`
- Generates postmortem draft with root cause analysis, timeline, action items, and lessons learned.
- **Validation**: Fails with HTTP `400` if incident status is `OPEN`, `INVESTIGATING`, or `IDENTIFIED`.
- **RBAC**: Any authenticated team member.
- **Response**: `{ success: true, data: { postmortem: { rootCause, timelineSynopsis, actionItems, lessonsLearned }, rawMarkdown } }`

### 4. Fetch Incident AI Status & History
`GET /api/v1/incidents/:id/ai`
- Returns current AI triage state, latest summary, postmortem, and suggestion history for the incident.

### 5. Record Human Decision
`POST /api/v1/ai/suggestions/:id/decision`
- **Body**:
  ```json
  {
    "decision": "accepted", // "accepted" | "edited" | "dismissed"
    "finalSeverity": "SEV1", // Optional: Required if edited
    "decisionNotes": "Validated by Incident Commander"
  }
  ```
- **RBAC**: `SUPER_ADMIN`, `ADMIN`, `INCIDENT_LEAD`.
- **Effect**: If accepted or edited, updates `incident.finalSeverity` and `incident.aiAccepted`. Updates suggestion record with feedback.

### 6. AI Telemetry & Audit Logs
`GET /api/v1/ai/audit?page=1&limit=20&decision=accepted`
- **Query Params**: `page`, `limit`, `type`, `decision`, `incidentId`, `serviceId`
- **RBAC**: `SUPER_ADMIN`, `ADMIN`, `MANAGER`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "logs": [ ... ],
      "metrics": {
        "totalSuggestions": 42,
        "acceptedCount": 35,
        "editedCount": 4,
        "dismissedCount": 3,
        "pendingCount": 0,
        "agreementRate": 0.833,
        "avgLatencyMs": 412
      },
      "pagination": { "page": 1, "limit": 20, "totalPages": 3, "totalCount": 42 }
    }
  }
  ```

---

## Automated Test Suite

Resolver contains a comprehensive Vitest test suite with **126 tests across 7 dedicated AI test files**, verifying all functional requirements and edge cases.

To execute the AI test suite:

```bash
# Run all AI subsystem unit and integration tests
npm --prefix server test -- tests/ai

# Run complete test suite (Auth, Incidents, Services, AI)
npm --prefix server test
```

### Test Coverage Breakdown

| Test Suite | File | Tests | Validates |
|------------|------|-------|-----------|
| **Rules Engine** | `tests/aiRulesEngine.test.ts` | 27 | Deterministic keyword matching, service tiers, alert labels, performance (<10ms for 10,000 evaluations). |
| **Redaction Engine** | `tests/aiRedaction.test.ts` | 18 | Secret keys, passwords, API tokens, JWTs, emails, phone numbers, and IPv4 masking. |
| **Provider Adapters** | `tests/aiProviders.test.ts` | 20 | Multi-provider interfaces (`fake`, `groq`, `gemini`, `ollama`), error handling, timeouts, malformed JSON fallback. |
| **BullMQ Queue** | `tests/aiQueue.test.ts` | 10 | Background job enqueueing, retry strategies, fail-open behavior when Redis connection fails. |
| **AI Orchestration** | `tests/aiService.test.ts` | 23 | Triage generation, prompt construction, postmortem status guards, human decision recording (Accept / Edit / Dismiss). |
| **REST Endpoints** | `tests/aiEndpoints.test.ts` | 18 | API routes, request validation, RBAC authorization, and error responses. |
| **Audit & Telemetry** | `tests/aiAudit.test.ts` | 10 | Audit log filtering, pagination, latency metrics, and model agreement rate calculation. |

---

## Manual Smoke Test Guide

Follow this guide to verify the end-to-end functionality in a local development environment:

### Step 1: Start Redis and Services
1. Start Redis: `docker run -d --name resolver-redis -p 6379:6379 redis:alpine`
2. Start Server: `npm --prefix server run dev`
3. Start Client: `npm --prefix client run dev`

### Step 2: Test Rules-First Triage
1. Navigate to `http://localhost:5173` and log in as an administrator.
2. Create a new incident with title: `Production database connection pool exhausted`.
3. In the Incident Details page, observe the **AI Copilot Triage Card**:
   - Suggested Severity displays `SEV1` (evaluated deterministically via Tier-1 rules).
   - Confidence score shows `0.95`.
   - Rationale references rule match: `Tier-1 rule match: database outage`.
4. Click **Accept Suggestion**. Notice that `finalSeverity` updates to `SEV1` and the card reflects `Accepted by <User>`.

### Step 3: Test Incident Summary
1. Add several timeline updates/comments on the incident (e.g., "Scaled connection pool from 50 to 200", "CPU usage normalizing").
2. In the **Incident Summary Card**, click **Generate Summary** (or **Refresh**).
3. Verify that a concise status briefing is generated highlighting the current progress and impact.

### Step 4: Test Postmortem Guard
1. While the incident is still `INVESTIGATING`, attempt to generate a postmortem. Notice the card displays an advisory badge: `Available once incident is Resolved or Closed`.
2. Change the incident status to `RESOLVED`.
3. The **AI Postmortem Draft Card** activates. Click **Draft Postmortem**.
4. Verify the structured draft is generated with:
   - Root Cause Analysis
   - Timeline Synopsis
   - Recommended Action Items
   - Lessons Learned
5. Click **Copy Markdown** to copy the complete report to your clipboard.

### Step 5: Verify Audit Log
1. Execute an audit log query using cURL or Postman:
   ```bash
   curl -H "Authorization: Bearer <TOKEN>" "http://localhost:5000/api/v1/ai/audit"
   ```
2. Verify that `totalSuggestions`, `acceptedCount`, `agreementRate`, and log entries match the actions performed in the UI.

---

## Dual-Core AMD A6 / Low-Resource Compliance

To support development on machines with restricted memory and compute resources (such as dual-core AMD A6 processors):

- **Zero Mandatory Local Containers**: Resolver does not require local LLM containers or heavy microservices.
- **Fake Provider by Default**: `AI_PROVIDER=fake` provides deterministic, zero-latency, realistic AI responses offline without API keys or CPU overhead.
- **Lightweight Redis**: BullMQ connects to standard Redis with minimal RAM footprint (<15MB).
- **Graceful Fail-Open**: If Redis or Docker is stopped, the entire application degrades gracefully without hanging or throwing unhandled errors.

---

## AI Phase 3 Capabilities & Safety Model

### 1. Alert Grouping (FR-08)
- **Rule 1 (Exact Deduplication / Deterministic Match)**: SHA-256 fingerprint exact match (or same service + same alert name) within a configurable time window (`AI_ALERT_GROUPING_WINDOW_MINUTES`, default 30m) automatically attaches the incoming alert to an existing open incident without invoking AI.
- **Rule 2 (Semantic Embedding Match)**: Embedding cosine similarity $\ge$ `AI_ALERT_GROUPING_SIMILARITY_THRESHOLD` (default 0.82) on the same service within the time window creates an `ai_suggestion` of type `alert_group`. Human responders explicitly **Accept** (attaches and increments `alertCount`) or **Dismiss** (creates separate incident).
- **Tier-1 P1 Safeguard**: Critical alerts on Tier-1 services never auto-group silently if they could hide a new failure mode; they are flagged for human review.
- **Fail-Open Ingestion**: Alert intake never blocks if Redis or embedding providers are down.

### 2. Runbook Suggestions (FR-11)
- **Retrieval First (No LLM required)**: Ranks operational runbooks from the `Runbook` collection and `Service.runbookLinks` using a multi-factor scoring formula:
  - Same service match: +0.40
  - Keyword and tag token overlap: up to +0.35
  - Cosine embedding similarity: up to +0.25
- **No Invented Runbooks**: Suggestions strictly present runbooks that exist in caller's organization database.
- **Optional LLM Explanation (Off by default)**: Governed by `AI_RUNBOOK_EXPLANATION_ENABLED=false`. When enabled, generates a 1-sentence factual explanation using `<incident_data>` delimiters.
- **Feedback Logging**: Responders can click "Useful" or "Not useful", updating the audit record in `ai_suggestions`.

### 3. Command-Palette Read-Only Assistant (FR-10)
- Natural-language assistant query endpoint: `POST /api/v1/assistant/query` (and `/api/v1/ai/assistant/query`) with `{ question: string }`.
- Accessible directly inside the `Cmd+K` command menu or via API.
- **Fixed Tool Allowlist**:
  1. `list_open_incidents(limit?, priority?)` — Read-only open incident query.
  2. `get_incident(incidentId)` — Read-only incident details.
  3. `find_incidents_by_service(serviceName, limit?)` — Read-only service incident lookup.
  4. `get_service(serviceName?, serviceId?)` — Read-only service metadata & runbooks.
  5. `get_oncall(serviceName?)` — Explictly returns: `No on-call rotation schedule is configured in Resolver` (never hallucinates).
- **Security & Safety Model**:
  - **Read-Only**: Zero write tools. Zero raw database queries. Zero model-generated URLs.
  - **RBAC Scoping**: Every tool executes with the calling user's permissions and organization boundary.
  - **Zod Validation**: Tool names and arguments are strictly validated against schemas.
  - **Loop Bounds**: Hard-capped at max 3 tool calls per question with timeout protection.
  - **Delimiter Defense & Redaction**: Questions and tool outputs are redacted and wrapped in `<user_question>` and `<tool_result>` tags.
  - **Secret Key Scrubbing**: Model output is programmatically scrubbed for backend API keys and JWT secrets.
  - **Audit Logging**: Every query and cited source list is logged to `ai_suggestions`.

---

## Phase 3 Configuration & Thresholds (.env)

| Variable | Type | Default | Description |
|---|---|---|---|
| `AI_ALERT_GROUPING_ENABLED` | boolean | `true` | Enables alert deduplication and semantic grouping |
| `AI_ALERT_GROUPING_WINDOW_MINUTES` | number | `30` | Time window (minutes) for grouping alerts into open incidents |
| `AI_ALERT_GROUPING_SIMILARITY_THRESHOLD` | number | `0.82` | Cosine similarity threshold for AI grouping suggestions |
| `AI_RUNBOOK_ENABLED` | boolean | `true` | Enables runbook suggestions on Incident Detail page |
| `AI_RUNBOOK_EXPLANATION_ENABLED` | boolean | `false` | Enables optional LLM 1-sentence runbook explanation step |
| `AI_ASSISTANT_ENABLED` | boolean | `true` | Enables natural-language read-only assistant in Cmd+K |
| `AI_DAILY_CAP` | number | `50` | Maximum AI operations per organization per day |
| `AI_TIMEOUT_MS` | number | `30000` | Hard timeout for external AI provider operations (ms) |

---

## Hard Rules Compliance Checklist

- [x] **Rule 1: AI only SUGGESTS or READS** — All AI mutations require explicit human clicks (Accept/Dismiss). Assistant is strictly read-only with no write tools.
- [x] **Rule 2: Fail-Open Architecture** — System operates fully if AI is disabled, Redis is down, or LLM providers throw. Ingestion and paging never wait on AI.
- [x] **Rule 3: Cheapest First** — Exact fingerprint rules evaluated first, embeddings second, LLM last (and off by default for runbooks).
- [x] **Rule 4: Redaction & Delimiter Defense** — Inputs scrubbed of PII/secrets before external calls; `<incident_data>`, `<user_question>`, `<tool_result>` delimiter tags enforced; Zod schema validation on every model output.
- [x] **Rule 5: Zero Key Leakage** — API keys only in backend `.env`, never returned to client, logged, or echoed in answers.
- [x] **Rule 6: AI-generated Label & Audit Log** — All outputs labeled "AI-generated", logged to `ai_suggestions`, feature toggles return `{ aiAvailable: false, reason: 'disabled' }`.
- [x] **Rule 7: Documented BullMQ/Redis Queues** — Queue and background worker jobs clearly commented and gracefully handle offline states.
- [x] **Rule 8: Three Checkpoint Delivery** — Checkpoints A (Alert Grouping), B (Runbooks), and C (Assistant + Settings) delivered sequentially and verified with test suites.

---

## Reproduce the Benchmark Results

Resolver includes a rigorous measurement and benchmarking suite located under `scripts/bench/`. All raw execution outputs are preserved in `docs/results-raw/`, and the consolidated report is dynamically compiled into [`docs/results.md`](docs/results.md) with **zero fabricated numbers**.

### Quick Start: Run the Full Benchmark Suite

```bash
# Runs rules, load, failure injection, and report generation in sequence
npm run bench:all
```

### Individual Benchmark Commands & Flags

| Command | Purpose | Default Settings & Recommended Flags |
|---|---|---|
| `npm run bench:rules` | Micro-benchmark of `severityFromRules` across 100k synchronous evaluations (measures p50/p95/max latency in µs/ms and ops/sec). | Pure CPU evaluation, zero network overhead. |
| `npm run bench:load` | Load and throughput benchmark using `autocannon` across alert ingest, incident creation, incident details, and incident listing. Also tests alert burst grouping and bounded creation safeguards. | Flags: `--connections 5` (concurrent connections), `--duration 5` (seconds per endpoint), `--alerts 30` (burst volume), `--allow-real-db` (confirms database). |
| `npm run bench:failure` | Resilience & fail-open injection suite covering scenarios S0–S5 (Redis outage, LLM API failure, Embedding failure, AI toggled off in settings, compound outages), post-outage recovery testing, and 10 hostile prompt-injection attacks. | Flags: `--incidents 50` (incidents per scenario), `--alerts 50` (alerts per scenario), `--max-seconds 300` (global timeout), `--allow-degraded` (for offline Redis baseline), `--allow-real-db`. |
| `npm run bench:cleanup` | Strictly removes all synthetic benchmark sessions and records tagged with `seeded: true` or `benchSession:<id>` across Incidents, Alerts, Services, Users, Organizations, and AiSuggestions. Confirms 0 remaining records. | Flag: `--allow-real-db`. |
| `npm run bench:report` | Compiles [`docs/results.md`](docs/results.md) by dynamically reading the latest JSON artifacts from `docs/results-raw/`. If an artifact is absent, that section renders "Not run". | Reads `docs/results-raw/rules-*.json`, `load-*.json`, `failure-*.json`. |

### Safety & Guardrails for Benchmark Scripts

1. **Non-Production Safety:** All benchmark scripts refuse to run if `NODE_ENV=production` or if the target URL is not `localhost`/`127.0.0.1` (unless `--allow-remote` is explicitly passed).
2. **Database Protection:** Benchmark scripts refuse to connect unless the database name contains `bench` or `test`, or the `--allow-real-db` flag is explicitly supplied.
3. **Deterministic & Isolated Data:** All records are created under unique per-run session IDs (`benchSessionId`), tagged with `seeded: true`, and strictly isolated so existing data is never touched or modified.
4. **Offline Zero-Cost Provider:** Default AI provider is `AI_PROVIDER=fake`, ensuring benchmarks do not leak secrets, incur billing, or exhaust free-tier API quotas.



