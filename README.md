# Resume Tailoring Tool

An AI-powered application that tailors a resume to a specific job description using only verifiably supported facts about the candidate.

The application maintains a structured career inventory, analyzes job requirements, identifies relevant evidence, and generates an editable resume draft. Users can review evidence, edit the draft, save it, and export it as a PDF.

## Features

- **Career inventory:** A structured, versioned record of employment, accomplishments, skills, projects, leadership experience, education, and supporting evidence.
- **Job analysis:** Extracts requirements from a job description and matches them against relevant career-inventory records.
- **Resume generation:** Uses matched evidence to generate a tailored summary, skills, and experience bullets.
- **Review and editing:** Displays supporting evidence and warnings, and allows users to edit and save resume drafts.
- **PDF export:** Produces a paginated, US Letter resume through the browser's print dialog.
- **Validation:** Checks inventory structure, record IDs, references, and compatibility between the Python and JavaScript validators.

## Architecture

The application has two primary components:

**Frontend**
- Static HTML, CSS, and JavaScript in `public/`.
- Calls same-origin API endpoints under `/api`, configured in `public/config.js`.
- Displays the inventory, job analyses, and saved resume drafts.

**Backend**
- A Cloudflare Pages Function forwards API requests through a Service Binding to the JavaScript Worker in `cloudflare/worker/`.
- The Worker reads the career inventory through its Assets binding.
- Workers AI performs job analysis and resume-content generation.
- D1 stores completed job analyses and saved resume drafts.

The local Python tools provide inventory validation and a lightweight development server. The Python schema in `career_inventory_schema.py` is the source of truth for local validation; the Worker implements the corresponding JavaScript rules. Parity tests check that both validators behave consistently.

## Local Development

### Requirements

- Python 3.11 or later
- Node.js 22 or later
- npm

The Python inventory tools use only the standard library. The Cloudflare Worker uses Wrangler, declared as a development dependency in `cloudflare/worker/package.json`.

### Run the local inventory browser

From the repository root:

```bash
python -m career_inventory_api
```

Open `http://127.0.0.1:8000`.

This server reads `data/master-career-inventory.json` directly and serves the inventory browser and API without Cloudflare tooling. It does not provide the Workers AI job-analysis workflow.

To use a different inventory file:

```bash
python -m career_inventory_api --inventory /path/to/inventory.json
```

Alternatively, set `CAREER_INVENTORY_PATH`.

### Run the Cloudflare application locally

Install the Worker dependencies:

```bash
cd cloudflare/worker
npm install
```

Use two terminals.

**Terminal 1 — Start the Worker:**

```bash
cd cloudflare/worker
npm run dev
```

**Terminal 2 — Start Pages from the repository root:**

```bash
npm --prefix cloudflare/worker exec -- wrangler pages dev ./public --service INVENTORY_API=career-inventory-api
```

Open the Pages development URL, normally `http://127.0.0.1:8788`.

The Pages Function forwards `/api` requests to the local Worker through the Service Binding. This environment supports the application API and Workers AI integration.

### Local D1 database

From `cloudflare/worker`, apply the migrations and start the Worker:

```bash
npx wrangler d1 migrations apply career-inventory-db --local
npm run dev
```

The version-controlled migrations create the `jobs` and `resume_drafts` tables.

## Testing and Validation

Run the inventory audit and Python tests from the repository root:

```bash
python -m career_inventory_schema data/master-career-inventory.json
python -m unittest test_career_inventory_schema.py
python -m unittest test_career_inventory_api.py
```

The inventory audit reports blocking errors for schema violations, duplicate IDs, and broken references. It also reports non-blocking warnings for unresolved verification questions and source notes that explicitly identify conflicts or uncorroborated claims.

Run the Worker tests:

```bash
cd cloudflare/worker
npm test
```

Run the cross-language compatibility and API regression tests from the repository root:

```bash
python -m unittest test_cloudflare_worker.py test_career_inventory_api.py test_career_inventory_schema.py
```

The tests cover Worker behavior, API contracts, inventory validation, and compatibility between the Python and JavaScript validators. Worker tests mock AI responses and do not make billed model requests.

## Deployment

Deployment requires a Cloudflare account and Wrangler authentication.

### 1. Configure D1

From `cloudflare/worker`:

```bash
npx wrangler login
npx wrangler d1 create career-inventory-db
```

Copy the returned database ID into the `DB` entry under `d1_databases` in `cloudflare/worker/wrangler.jsonc`.

Apply the migrations:

```bash
npx wrangler d1 migrations apply career-inventory-db --remote
```

### 2. Deploy the Worker

From `cloudflare/worker`:

```bash
npm run deploy
```

### 3. Deploy Pages

From the repository root:

```bash
npm --prefix cloudflare/worker exec -- wrangler pages deploy ./public --project-name career-inventory
```

The Worker must be deployed before Pages. Keep the Worker service name in the Pages Service Binding consistent with the deployed Worker name in each environment.

### Security

**The repository does not implement user authentication.**

The career inventory is bundled with the Worker deployment, not placed in the Pages `public/` directory. The Worker handles API requests through the Pages Service Binding, and its public `workers.dev` endpoint is disabled.

Before deploying a personal inventory, protect the Pages custom domain, `pages.dev` hostname, and preview deployments with Cloudflare Access. The Worker Service Binding is not a substitute for user authentication or access control.

Do not commit API tokens, credentials, or other secrets to source control or Wrangler configuration. The AI Gateway settings in the Worker configuration are non-secret configuration values.

## Application API

The Pages frontend calls same-origin `/api` routes. Pages Functions forward requests to the Worker, so the browser does not need a hard-coded backend hostname or cross-origin CORS configuration.

### Inventory

`GET /api/inventory` returns:

- `loaded`: whether the inventory could be retrieved and parsed.
- `inventory`: the loaded inventory.
- `validation`: audit errors and warnings.

Retrieval or JSON parsing failures return HTTP 500 with `loaded: false`. Validation failures return the loaded inventory with its audit results.

### Job analysis

`POST /api/jobs`

Accepts a JSON object containing non-empty `company`, `title`, and `jobDescription` strings.

The Worker:
1. Validates the request.
2. Extracts structured job requirements using Workers AI.
3. Normalizes and validates the requirements.
4. Retrieves relevant candidate evidence from the inventory.
5. Uses Workers AI to assess the evidence for each requirement.
6. Saves the completed analysis in D1.

Limits include:
- Company and title: 200 Unicode code points each.
- Job description: 50,000 Unicode code points.
- Extracted requirements: at most 25 before prioritization.
- Retained requirements: at most `MAX_REQUIREMENTS_PER_JOB` (default 15).
- Requirement descriptions: 500 characters.
- Keywords: at most 10 per requirement, each no longer than 50 characters.

The response includes requirement descriptions, categories, importance, keywords, evidence matches, and warnings. Each evidence match includes a match strength, selected evidence record IDs, a rationale, and any identified evidence gap.

`GET /api/jobs/{jobId}` retrieves a saved analysis. Completed analyses return HTTP 201 when created; unknown IDs return 404.

### Resume drafts

`POST /api/jobs/{jobId}/generated-content` generates a new, independent resume draft.

`GET /api/resume-drafts/{draftId}` retrieves a saved draft without regenerating it.

`PUT /api/resume-drafts/{draftId}` saves edits to an existing draft. The request includes the updated `resume` and its current `version`. Version-checked writes prevent stale edits from overwriting newer changes; conflicts return HTTP 409.

Each draft preserves its original job ID, inventory revision, creation time, warnings, and employment order. Manual additions are marked as manually added and do not receive generated evidence IDs. Edited generated content retains its original evidence associations and is marked as manually edited.

## Resume Preview and PDF Export

Saved drafts are displayed as paginated US Letter pages with 0.6-inch margins. The browser recalculates page breaks as content changes, including during editing.

Review evidence, warnings, editing controls, and page labels are excluded from the exported document.

To export a PDF:
1. Save the draft or cancel editing.
2. Select **Export saved PDF**.
3. In the browser's print dialog, choose **Save as PDF**.

Export is disabled while unsaved edits are present. The suggested filename uses the draft ID (`resume-draft-<draft-id>.pdf`) rather than personal contact or role information. The browser print engine preserves selectable text and supported links.

## Workers AI and AI Gateway

The Worker uses a Workers AI binding and routes AI invocations through the configured AI Gateway. The gateway ID and token limit are configured in `cloudflare/worker/wrangler.jsonc`.

The default gateway is named `default` and is created in the authenticated Cloudflare account on its first request. To use a different gateway, update `AI_GATEWAY_ID`.

### Smoke test

Authenticate Wrangler and start a remote Worker session:

```bash
cd cloudflare/worker
npx wrangler login
npm run dev -- --remote
```

In another terminal, call the smoke-test endpoint:

```bash
curl -X POST http://127.0.0.1:8787/api/ai/smoke-test
```

A successful response looks like:

```json
{ "ok": true, "response": "Workers AI is ready." }
```

The endpoint is also available through Pages at `POST /api/ai/smoke-test`.

### Inspecting AI Gateway requests

In the Cloudflare dashboard, open **AI → AI Gateway**, select the configured gateway, and open its logs.

The Worker logs a sanitized operation name and Gateway log ID for each invocation. Use that ID to locate the corresponding Gateway entry. Operations are identified as `smoke-test`, `job-analysis`, or `evidence-matching`.

Gateway logs can provide request status, model/provider information, token usage, cost, duration, and available provider error details. The Worker does not log prompts or model responses, and requests use Cloudflare's `cf-aig-collect-log-payload: false` header to avoid storing request/response payloads.

A Gateway entry can help establish whether a provider request was accepted and expose available error metadata. It may not identify the underlying cause of a Workers AI parsing error.

## Career Inventory

The canonical inventory is `data/master-career-inventory.json`. Its structure is defined by `career_inventory_schema.py`, which also provides the standard-library validator.

The current schema version is **1.2.0**. Version 1.1.0 remains accepted for backward compatibility; use 1.2.0 for new or updated inventories.

### Main record collections

| Collection | Contents |
|---|---|
| `subject` | Candidate profile and contact information |
| `employment_history` | Employment, role scope, technologies, responsibilities, and linked accomplishments |
| `accomplishments` | Problems, contributions, ownership, technical details, outcomes, metrics, evidence, and limitations |
| `skills` | Skills, aliases, contexts, usage levels, recency, evidence, and limitations |
| `leadership_examples` | Leadership situations, actions, reasoning, outcomes, and linked accomplishments |
| `projects` | Project descriptions, contributions, technologies, and evidence |
| `education_and_credentials` | Education and certifications |
| `career_preferences` | Target roles, work preferences, geography, compensation, work authorization, and tailoring preferences |
| `verification_questions` | Open or answered questions and affected records |
| `source_notes` | Sources and their role in supporting inventory facts |
| `negative_qualifications` | Optional, evidence-backed boundaries or areas of non-experience |

### IDs and references

IDs are stable record keys, not sequence positions. Preserve existing IDs when editing records and assign new unique IDs when adding records.

| Prefix | Record type |
|---|---|
| `EMP-` | Employment |
| `ACC-` | Accomplishment |
| `SK-` | Skill |
| `LEAD-` | Leadership example |
| `PROJ-` | Project |
| `EDU-` | Education or credential |
| `VQ-` | Verification question |
| `SRC-` | Source note |

References must point to existing records of the permitted type. IDs must be unique within their collection, and the validator also checks for duplicates across collections.

### Updating the inventory

To install a replacement inventory, run this command from the repository root:

```bash
python -m tools.update_inventory_fixture /path/to/new-inventory.json
```

The updater:
- Checks that the source is valid JSON and conforms to the inventory schema.
- Preserves every existing record ID.
- Allows new IDs to be added.
- Sets the current supported schema version.
- Updates `inventory_revision_date`.
- Replaces the canonical inventory atomically.

To specify a revision date:

```bash
python -m tools.update_inventory_fixture /path/to/new-inventory.json --revision-date YYYY-MM-DD
```

This tool updates inventory content, not the schema definition. If the inventory structure changes, update the Python schema and `SCHEMA_VERSION` first.

### Validation rules and limitations

Fields are required unless marked `NotRequired` in the Python schema. Optional fields may be omitted; nullable fields must be present but may contain JSON `null`. Empty strings and lists are not substitutes for `null`.

The validator rejects unexpected fields, missing required fields, type mismatches, unsupported schema versions, duplicate IDs, and dangling or wrong-kind references. It does not coerce values.

Validation confirms structural consistency, not factual truth. It cannot determine whether a statement is accurate or whether its evidence supports the wording. Source-conflict warnings depend on explicit conflict or uncorroborated markers in source notes; the validator does not semantically compare prose. Dates, confidence values, and many limitations are represented as strings and still require human review.

Do not turn an absence of evidence into a claim of experience. Record confirmed skill boundaries, role constraints, unknown facts, and explicit negative qualifications in their corresponding inventory fields. Preserve qualifications around scope, ownership, metrics, and production experience.