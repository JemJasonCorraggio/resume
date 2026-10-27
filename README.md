# resume
An AI tool for tailoring a resume to a given job description while using only veritably true facts about the candidate

## Career inventory schema

[`career_inventory_schema.py`](./career_inventory_schema.py) defines the Python 3.11+ typed schema and standard-library validator for [`data/master-career-inventory.json`](./data/master-career-inventory.json). It is the source of truth for the local Python tools. The current schema version is **1.2.0**. The validator also accepts the baseline's **1.1.0** version for backward compatibility; use 1.2.0 for new or updated inventories. Additive optional fields require a minor version bump; incompatible changes require a major version bump.

Run the inventory audit and regression tests from the repository root:

```sh
python -m career_inventory_schema data/master-career-inventory.json
python -m unittest test_career_inventory_schema.py
python -m unittest test_career_inventory_api.py
```

The audit exits unsuccessfully for schema, duplicate-ID, or broken-reference errors. It prints non-blocking warnings for unresolved verification questions and source notes that explicitly flag conflicts or uncorroborated claims. Diagnostics include the record and field path. `audit_inventory()` returns both `errors` and `warnings`; `validate_inventory()` remains available when only blocking errors are needed.

### Looking up records and related evidence

[`career_inventory.py`](./career_inventory.py) provides `get_accomplishment()`, `get_skill()`, `get_employment()`, `get_project()`, and `get_leadership_example()` helpers. Each takes the loaded inventory and an ID, and returns a deep-copied record or `None` when the ID is not found. `get_related_evidence()` returns deep copies of records explicitly linked to the requested record in either direction; it returns an empty list for a known record without links and `None` for an unknown ID. Returned copies can be edited by callers without changing the source inventory.

### Read-only inventory browser and Cloudflare deployment

The browser consists of static HTML, CSS, and JavaScript in [`public/`](./public/).
The browser calls same-origin endpoints under `/api`, configured centrally in
[`public/config.js`](./public/config.js). In Cloudflare, a
Pages Function in [`functions/api/inventory.js`](./functions/api/inventory.js)
forwards that request through a Service Binding to the JavaScript Worker in
[`cloudflare/worker/`](./cloudflare/worker/). The Worker reads the canonical
inventory bundled through its Cloudflare Assets binding and runs the
JavaScript port of the schema and audit rules in
[`cloudflare/worker/src/validation.js`](./cloudflare/worker/src/validation.js).
The root [`career_inventory_schema.py`](./career_inventory_schema.py) remains
the validator source of truth for local Python tools; parity tests compare the
Worker validator against it. Pages cannot run the local Python HTTP server or
read the repository's working-tree files at runtime, so the Worker package
includes the inventory needed in production.

The API response contains `loaded`, `inventory`, and `validation` (`errors`
and `warnings`). A file retrieval or JSON parse failure returns HTTP 500 with
`loaded: false`; validation failures return the loaded inventory with the
canonical audit errors. The frontend only renders these results; it does not
implement validation rules or editing/upload features. The same Pages app also
submits job analyses and can reopen a saved result by job ID. The browser uses
the configurable `/api` base in `public/config.js`; Pages Functions forward
requests through the existing Worker Service Binding, so browser traffic is
same-origin and does not require CORS.

Run the local development server from the repository root:

```sh
python -m career_inventory_api
```

Open <http://127.0.0.1:8000>. This local server reads
`data/master-career-inventory.json` directly and serves the same UI and API
for inventory browsing without Cloudflare. Job analysis requires the Pages
preview and Worker service binding described below. The local server uses
Python's standard-library `http.server` and the existing inventory service and
validator, with no third-party Python dependencies. Use
`--inventory /path/to/inventory.json` or
`CAREER_INVENTORY_PATH` to test another local file.

For an end-to-end Cloudflare local preview, install Node.js 22+ and npm, then
install the Worker tooling:

```sh
cd cloudflare/worker
npm install
```

Use two terminals. Start the Worker:

```sh
cd cloudflare/worker
npm run dev
```

Start Pages from the repository root:

```sh
npm --prefix cloudflare/worker exec -- wrangler pages dev ./public --service INVENTORY_API=career-inventory-api
```

Open the Pages dev URL (normally <http://127.0.0.1:8788>). The service binding
routes `/api` requests to the local JavaScript Worker. The Python server above
remains available for local inventory browsing without Cloudflare tooling.

Run the Worker contract tests and the cross-language compatibility tests from
the repository root:

```sh
cd cloudflare/worker
npm test
cd ../..
python -m unittest test_cloudflare_worker.py test_career_inventory_api.py test_career_inventory_schema.py
```

#### Deploying to Cloudflare

Deploy the Worker first, then the Pages site. Requirements are Node.js 22+/npm
and a Cloudflare account. Authenticate from the Worker directory with
`npx wrangler login`. The deployed backend does not require a Python runtime.

```sh
cd cloudflare/worker
npm run deploy
cd ../..
npm --prefix cloudflare/worker exec -- wrangler pages deploy ./public --project-name career-inventory
```

`cloudflare/worker/wrangler.jsonc` names the Worker `career-inventory-api`,
bundles `data/` as its internal asset binding, and disables the public
`workers.dev` endpoint. `wrangler.jsonc` configures the Pages output directory
and binds the Pages Function's `INVENTORY_API` service to that Worker. The
frontend continues to call `/api/inventory`, so there is no hard-coded API
hostname, production URL replacement, or cross-origin CORS configuration.
Keep the configured Worker service name consistent with the deployed Worker
name in each Pages environment.

The inventory file is included in the Worker deployment artifact, not
published in the Pages `public/` directory. The Worker invokes its handler
before checking bundled static assets and answers `/api/inventory`,
`/api/ai/smoke-test`, and `/api/jobs`, so the raw inventory asset is not served
as a public URL. The Pages Functions expose only these API routes. Before
deploying the personal inventory, protect the Pages custom domain, `pages.dev`
hostname, and preview deployments with Cloudflare Access; the Worker is not
directly reachable, and its Service Binding is only available to the Pages
Functions. Authentication is not implemented by this repository.

#### Workers AI smoke test

The Worker has a Workers AI binding for
`@cf/meta/llama-3.1-8b-instruct-fast`. Wrangler configuration sets
`AI_MAX_TOKENS` to `2048` and `AI_GATEWAY_ID` to `default`. All Workers AI
invocations, including the smoke test, requirement extraction, and evidence
matching, pass that gateway ID through the supported `env.AI.run()` gateway
options. The default gateway is created in the authenticated Cloudflare
account on its first request; to use a named gateway, change `AI_GATEWAY_ID`
in `cloudflare/worker/wrangler.jsonc`. These are non-secret settings; no API
key is stored in the repository.

Authenticate Wrangler with `npx wrangler login` and use a remote Worker
session to invoke the model:

```sh
cd cloudflare/worker
npm run dev -- --remote
```

In another terminal, call the fixed-prompt endpoint:

```sh
curl -X POST http://127.0.0.1:8787/api/ai/smoke-test
```

A successful call returns `{ "ok": true, "response": "Workers AI is ready." }`.
The same endpoint is available to application code at
`POST /api/ai/smoke-test` through the Pages Service Binding. Invalid, truncated,
or unexpected model output and invocation errors return a generic HTTP 502
response; internal provider details are neither logged nor sent to the browser.
Run the Worker unit tests with `npm test` from
`cloudflare/worker` to verify the configured token limit and failure behavior
without making a billed model request.

##### Inspecting AI Gateway requests

In the Cloudflare dashboard, select the account that owns the Worker, open
**AI > AI Gateway**, select the gateway named by `AI_GATEWAY_ID` (initially
`default`), and open **Logs**. Gateway logging is explicitly enabled for each
invocation. Logs can show the model/provider, timestamp, status, token usage,
cost, duration, and available provider error details. The Worker adds
`application` and `operation` metadata (`smoke-test`, `job-analysis`, or
`evidence-matching`) to help identify the request type.

For each invocation, the Worker also emits a sanitized application log with
the operation name and `aiGatewayLogId`. Match that ID to the Gateway log ID
when investigating a failed request; the Worker does not log the prompt or
model response. It also sends Cloudflare's per-request
`cf-aig-collect-log-payload: false` header, so Gateway logs retain diagnostic
metadata without storing request/response payloads. Gateway logging controls
and available fields are described in
Cloudflare's [AI Gateway logging documentation](https://developers.cloudflare.com/ai-gateway/observability/logging/)
and [Workers AI binding reference](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/).

To check the smoke-test request, run the remote command above and call
`POST /api/ai/smoke-test`, then locate the matching operation and log ID in
the dashboard. If it succeeds, submit a normal `POST /api/jobs` request to
exercise requirement extraction; the corresponding Gateway entry is marked
`job-analysis`. Evidence matching is separately marked
`evidence-matching`. A Gateway entry can confirm whether the provider request
was accepted and expose status/error metadata, but it may not expose the
underlying cause of a Workers AI `parseError`. If the log has no more specific
provider error, the cause remains unconfirmed; the next step is to use the
Gateway log's request ID/status and timestamp when reporting the issue to
Cloudflare, rather than inferring a cause from the parse error alone.

#### Job-analysis API

`POST /api/jobs` accepts a JSON object with non-empty `company`, `title`, and
`jobDescription` strings. `title` is returned as `roleTitle`. Company and title
are limited to 200 Unicode code
points; the Worker enforces a maximum of 50,000 Unicode code points for the
posting after JSON parsing. Workers AI extracts structured requirements only;
company and role title come from the submitted fields.
The Worker validates output against its application-owned schema, trims
normalized fields, removes duplicate requirements only when their normalized
descriptions and categories match, and generates requirement IDs. It accepts
at most 25 requirements, 500-character descriptions, and 10 keywords of at
most 50 characters each. After normalization, the Worker retains at most
`MAX_REQUIREMENTS_PER_JOB` requirements (default 15), prioritizing high,
medium, then low importance and preserving extraction order. Omitted
requirements are reported in the response warnings; retained requirements
keep their generated IDs and extraction order. Invalid request fields return
400; unsupported or malformed model output returns a controlled 502 response. Completed
analyses return HTTP 201 with UTC timestamps and preserve the original
`jobDescription` separately from normalized analysis fields. Completed results
are persisted in D1; `GET /api/jobs/{jobId}` returns the same response shape,
and unknown IDs return the standard 404 error envelope.
Before matching, deterministic retrieval selects up to five candidates per
requirement from the validated inventory, preserving each record's original
ID and limitations. Workers AI assesses each requirement using only those
candidates. The API's `evidenceMatches` contains one assessment per
requirement: match strength, selected evidence record IDs, concise rationale,
and any evidence gap. Workers AI is invoked with a JSON Schema response format
requiring all match fields, including `evidenceRecordIds` and `gap`; application
validation still checks output structure, match strengths, and evidence IDs
against each requirement's candidates. The prompt prohibits treating shared
keywords as proof or inferring unsupported ownership, seniority, scale,
metrics, or production experience. Job creation rejects an inventory that
fails the existing schema validator. AI matching failures and malformed output
return controlled 502 responses and are logged for inspection. API errors use
an
`{ "error": { "code": "...", "message": "..." } }` response envelope. The
Worker tests mock AI responses and do not make billed model requests.

#### D1 jobs database

The Worker binds the `career-inventory` D1 database as `env.DB`. The initial
migration in `cloudflare/worker/migrations/0001_create_jobs.sql` creates a
`jobs` table for completed analyses. The repository helpers in
`cloudflare/worker/src/jobs.js` write JSON fields as serialized JSON using
bound parameters, and parse them back when retrieving a record. Job rows store
the inventory revision used, not a redundant inventory snapshot or AI prompt.

To create and migrate a local database, run these commands from
`cloudflare/worker`:

```sh
npx wrangler d1 migrations apply career-inventory-db --local
npm run dev
```

For a deployed database, authenticate Wrangler and create the database once:

```sh
npx wrangler login
npx wrangler d1 create career-inventory-db
```

Copy the returned `database_id` into the `DB` entry under `d1_databases` in
`cloudflare/worker/wrangler.jsonc`, then apply the version-controlled schema and
deploy the Worker:

```sh
npx wrangler d1 migrations apply career-inventory-db --remote
npm run deploy
```

The database ID identifies the Cloudflare account resource; it is not an API
credential. Do not put API tokens or other secrets in Wrangler config or source
control. `npm test` exercises parameterized insert/retrieve behavior and
round-trips nested JSON fields without connecting to a remote database.

#### Component and validation dependencies

- **Frontend:** `public/index.html`, `public/styles.css`, and `public/app.js`;
  configured in `public/config.js` to use `/api/inventory`.
- **Pages routing:** `functions/api/inventory.js`,
  `functions/api/ai/smoke-test.js`, `functions/api/jobs.js`, and the
  `INVENTORY_API` Service Binding in `wrangler.jsonc`.
- **Backend:** `cloudflare/worker/src/index.js` is a JavaScript Cloudflare
  Worker. Its Wrangler configuration is
  [`cloudflare/worker/wrangler.jsonc`](./cloudflare/worker/wrangler.jsonc);
  `cloudflare/worker/package.json` supplies local development, test, and deploy
  scripts and declares Wrangler as a development dependency. The Worker uses
  Wrangler's `INVENTORY_ASSETS` binding for the inventory, `AI` binding for
  Workers AI, and `DB` binding for D1 persistence; it needs no API keys or
  third-party runtime dependencies.
- **Inventory:** `data/master-career-inventory.json`, bundled with the Worker
  from the repository during deployment.
- **Validation:** the local Python tools use
  [`career_inventory_schema.py`](./career_inventory_schema.py); the Worker
  ports those schema and cross-reference rules in
  [`cloudflare/worker/src/validation.js`](./cloudflare/worker/src/validation.js).
  `test_cloudflare_worker.py` compares the Worker audit output with the Python
  validator for the canonical inventory and representative invalid cases.
- **Behavior differences:** the schema versions, rules, diagnostic structure,
  and API response shape are covered by parity tests. JavaScript's JSON parser
  cannot distinguish an integer token such as `1` from a decimal token such as
  `1.0`; both parse as a number, while Python distinguishes them during
  integer validation.

### Updating the inventory fixture

Prepare a replacement inventory JSON file, then install it from the repository root:

```sh
python -m tools.update_inventory_fixture /path/to/new-inventory.json
```

The updater checks that the source is valid JSON and conforms to the inventory schema, preserves every existing record ID (new IDs may be added), sets `schema_version` to the current supported schema version, records today's date in `inventory_revision_date`, and atomically replaces `data/master-career-inventory.json`. To provide a specific revision date:

```sh
python -m tools.update_inventory_fixture /path/to/new-inventory.json --revision-date YYYY-MM-DD
```

This updates the inventory fixture, not the schema definition: ordinary content updates use the current schema version. If the inventory structure changes, update the Python schema and `SCHEMA_VERSION` first, then upload a source file that conforms to that schema. The tool refuses unsupported source versions or an upload that removes an existing ID.

### Expected inventory structure

- `schema_version`, `inventory_generation_date`, and `inventory_revision_date` identify the schema and the dates the inventory was generated/revised.
- `subject` holds the person's profile and contact fields.
- `employment_history` contains one record per role: stable ID, employer/title/type, dates and location, context, role/ownership, team information, technologies, systems, operational responsibilities, related accomplishments, and unknowns. `accomplishment_ids` points to `ACC-*` records.
- `accomplishments` records the problem, the person's contribution and ownership, technical details, scope, outcome, metrics, evidence/confidence, relevance, candidate resume bullets, and follow-up questions. `employer_id` points to an `EMP-*` record. A metric stores string `value`, `unit`, and `confidence`; values remain strings so approximate and qualified figures are not converted into false precision.
- `skills` describes the skill/category, aliases, contexts, usage level, recency, evidence examples, and limitations. Examples may point to `ACC-*`, `PROJ-*`, or `LEAD-*` records.
- `leadership_examples` stores situation, actions, reasoning, outcome, and links to `ACC-*` records.
- `projects` stores project description, contribution, technologies, related `SK-*` IDs, evidence, and verification questions.
- `education_and_credentials` records education/certifications; unknown institution or dates may be `null`.
- `career_preferences` records target roles, work preferences, geography, compensation context, work authorization, and tailoring preferences.
- `verification_questions` tracks open or answered questions and IDs of affected records.
- `source_notes` records the source and its role in supporting inventory facts.
- Optional `negative_qualifications` is a list of explicit, evidence-backed boundaries/non-experience, each with a statement, scope, evidence, and a `related_ids` list that may be empty. This is an addition to the baseline shape; it can be omitted or be an empty list.

### Required, optional, and nullable values

Every field in the Python `TypedDict` definitions is required unless marked `NotRequired`. A `NotRequired` field may be omitted; this does **not** mean its value may be `null`. Fields whose annotations include `| None` are required keys that explicitly permit JSON `null`. Empty strings/lists are not interchangeable with `null`; use them only when they accurately represent known empty content. The validator rejects unexpected fields, missing required fields, type mismatches, unsupported schema versions, duplicate record IDs (including duplicates across collections), and dangling/wrong-kind references. It does not coerce values. Missing `NotRequired` fields and nullable references do not produce errors.

Optional fields present in the baseline include employment notes/constraints, accomplishment `employer_note`, leadership related-accomplishment links, and a verification question's `answered_date`. See the Python definitions for the complete required/nullability contract.

### IDs, references, and truthful limitations

IDs are stable record keys, not sequence positions: `EMP-*` employment, `ACC-*` accomplishment, `SK-*` skill, `LEAD-*` leadership example, `PROJ-*` project, `EDU-*` education/credential, `VQ-*` verification question, and `SRC-*` source note. Preserve an existing ID when editing a record; allocate a new unique ID when adding one. IDs are unique within their collection and references must point to an existing record of the permitted kind. `verification_questions.affects` may reference employment, accomplishment, skill, leadership, project, or education IDs.

Do not turn absence of evidence into experience. Put confirmed skill boundaries in `skills[].limitations`, role constraints in `employment_history[].constraints_and_limitations`, unknown/missing facts in `employment_history[].missing_or_unconfirmed` or `verification_questions`, and explicit negative qualifications in `negative_qualifications`. Keep claims qualified by the evidence/confidence field. For example, a work item known not to have reached production belongs as a limitation; do not describe it as a production outcome.

### Known limitations

- This schema validates shape, JSON-compatible primitive types, version, and ID references; it cannot determine whether a factual statement is true or whether evidence supports its wording. Source-conflict warnings rely on explicit conflict/uncorroborated markers in source notes, not semantic comparison of prose.
- Dates and confidence/status vocabulary are strings because the baseline uses partial dates and descriptive confidence values. Their semantic consistency requires human review.
- Detailed limitations and unknowns are mostly prose, so the validator cannot infer whether all facts requiring qualification have been recorded.
