# Prompts
## 1. Task: Build my master career accomplishment and skills inventory

I am building a reusable master career inventory that will serve as the source of truth for tailoring resumes to specific job descriptions in the future.

I will provide my current base resume. In addition, use all relevant information available in our previous conversations, including details about my work history, projects, technical skills, leadership, responsibilities, and accomplishments that may not appear on the resume.

**Do not write or tailor a resume.** Your task is to extract, organize, and preserve the underlying career facts so that a separate application can select and rewrite the most relevant material for each future job.

### 1. Source and accuracy rules

- Review the entire base resume and all relevant available conversation history before producing the inventory.
- Treat my resume and explicit corrections as important sources of truth, but do not assume that the resume contains everything worth preserving.
- Preserve concrete details, including numbers, technologies, scale, scope, business outcomes, and my individual contribution.
- Never invent facts, metrics, responsibilities, technologies, or outcomes.
- Distinguish between facts I explicitly stated, reasonable interpretations, and details that still need confirmation.
- If sources conflict, preserve the conflicting versions and flag the discrepancy instead of silently choosing one.
- If you cannot access a previous conversation or do not have enough evidence to substantiate a claim, say so. Do not pretend to have reviewed unavailable information.
- Preserve relevant negative qualifications and limitations where they prevent overclaiming. For example, distinguish writing production code from reviewing code, planning work, or having only limited exposure to a technology.
- Do not discard an accomplishment merely because it is old, seems minor, or is unlikely to fit on a typical one- or two-page resume.

### 2. Employment history

For every role, record:

- Employer and job title.
- Employment dates, if known.
- Team, product, and business context.
- Individual contributor, technical leadership, management, or hybrid responsibilities.
- Team size, number of direct reports, and scope of ownership, where known.
- Technologies, languages, infrastructure, databases, and tools used.
- Systems designed, implemented, migrated, operated, or maintained.
- On-call, incident response, reliability, observability, and operational responsibilities.
- Cross-team collaboration, mentoring, hiring, planning, architecture, and technical decision-making.
- Concrete accomplishments and outcomes.
- Relevant constraints, trade-offs, and difficult problems solved.
- Facts that are missing or require confirmation.

Keep accomplishments associated with the correct employer and role.

### 3. Individual accomplishment records

Create a separate record for every distinct accomplishment, project, migration, technical improvement, leadership example, or meaningful responsibility.

Give each record a stable, unique ID.

For each record, include as many of these fields as the available evidence supports:

- **ID**
- **Title**
- **Employer / role / project**
- **Problem or motivation:** What needed to change or be solved?
- **My contribution:** What did I personally do?
- **Ownership level:** Led, designed, implemented, contributed, reviewed, planned, operated, or another accurate description.
- **Technical details:** Languages, frameworks, APIs, databases, infrastructure, protocols, and relevant architecture.
- **Scale and scope:** Systems, teams, services, data flows, users, or other measurable context.
- **Outcome:** What improved, changed, or became possible?
- **Metrics:** Exact figures and their units, including financial savings, performance improvements, reliability changes, or time saved.
- **Evidence and confidence:** Explicitly stated fact, inferred interpretation, or unverified detail.
- **Potential relevance:** Backend, platform engineering, distributed systems, developer productivity, reliability, security, APIs, engineering leadership, or other appropriate categories.
- **Resume bullet candidates:** One or more accurate ways the accomplishment could eventually be expressed, without adding unsupported claims.
- **Verification questions:** Anything that should be confirmed before using the accomplishment in an external application.

Keep the underlying facts separate from the proposed resume wording. A single accomplishment may support several different bullet formulations depending on the target role.

### 4. Technical skills and experience

Build a separate skills inventory.

For every language, framework, platform, database, infrastructure technology, tool, or technical domain, record:

- Name and relevant aliases.
- Where and how I used it.
- Employer, project, or context.
- Approximate duration or recency, if known.
- Whether I implemented production code, operated it, designed systems around it, reviewed code, or only studied or experimented with it.
- Specific examples of work demonstrating the skill.
- Known limitations or distinctions that prevent overstating my proficiency.

Include relevant experience with backend development, distributed systems, APIs, cloud infrastructure, infrastructure as code, databases, observability, incident management, testing, security, developer tooling, and AI-assisted development.

Do not assign arbitrary proficiency scores or infer expertise from a technology merely appearing in a job description.

### 5. Leadership and behavioral examples

Extract examples that could support behavioral interviews or leadership-focused resumes, including:

- Leading teams or projects.
- Mentoring and developing engineers.
- Resolving technical disagreements.
- Making architectural trade-offs.
- Improving incident response or operational processes.
- Driving migrations or organizational changes.
- Working across teams.
- Handling ambiguous requirements.
- Balancing delivery, reliability, and technical debt.
- Making mistakes, learning from them, or improving a process.

Preserve the situation, my actions, the reasoning behind my decisions, and the outcome whenever that information is available. Do not manufacture missing STAR interview details.

### 6. Projects and additional experience

Include relevant personal projects, side projects, prototypes, open-source contributions, and technical learning that demonstrate practical skills.

Clearly distinguish personal projects from professional production experience.

Preserve concrete implementation details and the parts I personally built. Do not inflate the maturity, usage, or impact of a project.

### 7. Career positioning and constraints

Record relevant career preferences and factual constraints that affect how future resumes should be tailored, including:

- Types of engineering roles and technical work I am targeting.
- Management experience versus individual contributor experience.
- Technologies or domains where I have substantial experience versus limited exposure.
- Accurate education, certifications, and other qualifications, if available.
- Work authorization information that I have explicitly provided and that is relevant to applications.

Keep subjective preferences separate from verifiable qualifications. Do not include sensitive personal information unrelated to professional qualifications.

### 8. Missing information and verification

After extracting the inventory:

1. List missing information that could materially improve future resumes.
2. Identify metrics, dates, ownership claims, or technical details that need verification.
3. Identify accomplishments that seem important but lack sufficient detail to write a strong, defensible bullet.
4. Ask targeted questions that would recover useful information. Prioritize questions that could clarify multiple accomplishments at once.

Do not block the inventory on unanswered questions. Record what is known first.

### 9. Output format

Produce the inventory in structured JSON suitable for importing into a database.

Use a top-level structure with these collections:

- `employment_history`
- `accomplishments`
- `skills`
- `leadership_examples`
- `projects`
- `education_and_credentials`
- `career_preferences`
- `verification_questions`
- `source_notes`

Use consistent field names and data types. Represent unknown values as `null`, and use arrays for collections. Use stable IDs to connect accomplishments to employment records and skills.

Keep facts atomic where possible. Avoid duplicating an entire accomplishment in several collections; reference its ID instead.

Include a schema version and an inventory generation date if known. Do not include fabricated timestamps.

If the inventory is too large for one response, split it into clearly numbered parts, preserving the same schema and IDs throughout. Indicate which collections and records remain to be produced. Do not silently truncate the inventory.

Before finishing, validate that the JSON is syntactically valid, IDs are unique, references point to existing records, and no unsupported facts have been introduced.

Finally, provide a short summary of coverage, important omissions, and unresolved verification questions outside the JSON.

**The goal is completeness and traceability, not brevity. Preserve as much useful career evidence as possible so that future resume tailoring can be selective without losing information.**

## 2. Task: Use master career inventory to define inventory schema
master-career-inventory.json is a file that details a person's career history. Use this file as a baseline to define a schema in Python to be used to input and update a person's career history. Document the expected structure of the inventory: employment history, accomplishments, skills, leadership examples, projects, education, career preferences, and verification questions.

Acceptance criteria

- Required fields and field types are defined.
- IDs and references have documented meanings.
- Optional fields and permitted null values are explicit.
- The schema is versioned.
- Known limitations and negative qualifications can be represented without inventing experience.

## 3. Task: Add inventory versioning
Store the JSON inventory in the project in a directory called data. Add a method to upload a new version of the inventory and update the version number. Keep it separate from application code.

Acceptance criteria
- The inventory parses as valid JSON.
- The original IDs are preserved.
- The inventory revision is recorded.
- The README explains how to update the fixture.

## 4. Task: Validate record IDs and cross-references
Add checks beyond basic JSON schema validation to detect duplicate IDs and broken references between accomplishments, skills, leadership examples, and projects.

Acceptance criteria
- Duplicate IDs are reported.
- References to nonexistent records are reported.
- Missing optional references are not incorrectly treated as errors.
- Source inconsistencies and unresolved questions are surfaced as warnings.
- The report identifies the offending record and field.

## 5. Task: Implement inventory query functions
Provide reusable functions to retrieve an accomplishment, skill, employment record, project, or leadership example by ID. Add a function to retrieve related evidence.

Acceptance criteria
- A valid ID returns the matching record.
- An unknown ID returns a predictable not-found result.
- Related records can be retrieved through explicit references.
- Querying does not mutate the underlying inventory.
- The functions have unit tests.

## 6. Task: Cloudflare Pages inventory inspection UI
Provide a minimal browser-based interface, to be hosted on Cloudflare Pages, for inspecting the career inventory and its validation status.

### 1. Static frontend setup
- Add a dedicated static asset directory (for example, `public/`) containing the HTML, CSS, and JavaScript files used by Pages.
- Keep the frontend lightweight; do not introduce a large framework.
- Document how to run the frontend locally and deploy it to Pages.

### 2. Inventory status
- Display whether the inventory loaded successfully.
- Display schema-validation and cross-reference validation errors and warnings from the existing validation logic.
- Make errors actionable and identify the relevant record or field wherever possible.
- Do not reimplement validation rules in frontend JavaScript.

### 3. Inventory browsing
- List inventory records, grouped or filterable by record type.
- Allow searching by record ID and, where practical, record name or title.
- Allow selecting a record to inspect its fields and associated references.
- Display missing or unresolved references clearly.
- Handle empty results and loading or request failures gracefully.
- Do not provide inventory editing or upload functionality in this ticket.

### 4. Backend integration
- The frontend must retrieve inventory data and validation results from a defined interface.
- Keep the existing inventory loader and validator as the source of truth.
- Do not assume static Pages hosting can execute Python or read the project's local inventory file at runtime.


### Acceptance criteria
Note some of these will need to be checked manually by a human, check what you can.
- The frontend deploys successfully to Cloudflare Pages.
- The UI shows inventory load and validation status.
- Users can browse and search records and inspect a selected record's fields and references.
- Validation rules remain centralized in the existing loader/validator.
- Loading failures, validation failures, and empty search results are handled clearly.
- The deployed interface does not expose the inventory or API to unauthorized visitors.
- Local development and deployment instructions are documented.

### Out of scope
- Editing or uploading the inventory.
- LLM integration, semantic search, or resume generation.
- Authentication implementation 
- Database or durable inventory versioning.

## 7. Task: # Deploy inventory backend and verify pages integration
Ensure the deployed Cloudflare Pages application can access the inventory inspection functionality, not just the local development environment.

### Tasks
- Identify how the inventory backend currently runs locally and why it is unavailable in the deployed Pages environment.
- Document the current frontend, backend, inventory file, and validation dependencies.
- Implement the smallest compatible Cloudflare deployment architecture that supports the existing inventory inspection functionality.
- Ensure the backend can load and validate the inventory in the deployed environment.
- Configure the Pages frontend to call the deployed backend using the correct environment-specific URL.
- Configure CORS or other necessary request controls if the frontend and backend use different origins.
- Test both successful inventory retrieval and validation/error responses in the deployed environment.
- Do not add inventory editing or uploading.

### Acceptance criteria
Note some of these will need to be checked by a human. Check what you can.
- The Pages frontend can retrieve and display inventory records from the deployed backend.
- Inventory validation status and errors are visible in the deployed UI.
- The deployed backend does not depend on files or processes available only in the local development environment.
- Local development continues to work.
- Deployment instructions and required environment configuration are documented.

### Out of scope
- Changing the inventory schema or existing validation rules.
- Adding persistent job history or resume records.

## 8. Task: Port inventory API to a cloudflare worker
The current inventory API is implemented in Python and works locally, but a standard Python API server cannot run directly as a conventional Cloudflare Worker.

The application must use Cloudflare Workers for its deployed backend. The existing inventory JSON, schema, validation rules, and observable behavior are the source of truth.

Replace the Python API runtime with a Cloudflare Workers-compatible backend so the deployed Cloudflare Pages frontend can inspect the canonical career inventory.

### 1. Inspect the existing implementation
- Identify the current API framework, routes, request/response behavior, inventory loading logic, validation logic, and dependencies.
- Identify which Python components can be reused conceptually and which require replacement for Workers.
- Document the existing behavior before making changes.
- Do not redesign the API contract as part of this task.

### 2. Implement the Worker backend
- Implement the existing inventory inspection API using JavaScript or TypeScript supported by Cloudflare Workers.
- Preserve the current route behavior, response fields, HTTP status codes, and error semantics wherever practical.
- Load the canonical inventory from a source available in the deployed Worker environment; do not depend on local filesystem paths or files that are absent from the deployment.
- Reimplement the existing schema and cross-reference validation behavior, including actionable errors and warnings.
- Keep validation centralized within the backend rather than duplicating it in the Pages frontend.
- Use the existing inventory IDs and preserve all inventory content and claim boundaries.
- Do not add inventory editing or uploading.

### 3. Integrate with Pages
- Configure the Pages frontend to call the Worker API using an explicit environment configuration.
- Handle API failures and unsuccessful responses in the existing UI.
- Configure only the cross-origin request controls needed by the chosen deployment arrangement.

### 4. Test compatibility
- Compare the Worker implementation against the existing Python implementation using the same inventory and representative test cases.
- Confirm that the Worker preserves the existing API contract.
- Test the deployed Worker and Pages integration, not just local emulation.

### 5. Document the deployment
- Document how to run the Worker locally, run its tests, configure required environment variables or bindings, and deploy it.
- Document how the Pages frontend connects to the deployed Worker.
- Record any behavioral differences from the Python implementation.

### Acceptance criteria
- The inventory inspection API runs on Cloudflare Workers without requiring a conventional Python server.
- The deployed API loads the canonical inventory and returns the expected records and validation status.
- Existing API behavior and response contracts are preserved.
- Automated tests cover success and failure cases.
- The Pages UI can inspect inventory through the deployed Worker.
- Deployment instructions are sufficient for a clean setup.

### Out of scope
- Redesigning the API request or response schemas.
- Adding inventory mutation or upload features.
- Reworking the frontend beyond the changes needed for Worker integration.

## 9. Task: Configure Workers AI and verify model invocation
Configure the Worker to call Workers AI using the chosen model and return a predictable result to the application.

### Implementation requirements
- Add the AI binding to the existing Worker configuration.
- Use the Llama 3.3 model identifier.
- Keep model invocation in a small reusable module or function.
- Use a simple prompt and small input for the initial smoke test.
- Configure the Workers AI invocation with a default maximum of 2,048 output tokens. 
- Store token limit in configuration rather than hardcoding them across the application. 
- Verify that token limit is passed to the model invocation and that token-limit truncation or malformed output is handled as a controlled failure.
- Handle invocation failures and unusable model output without exposing internal details to the browser.
- Keep credentials and configuration out of source control.

### Acceptance criteria
- The Worker builds and deploys with the AI binding configured.
- A test invocation successfully calls the selected model.
- The model response is accessible to application code.
- Model failures produce a controlled, testable error.
- No API keys or secrets are committed.
- A short README section explains how to configure and test the binding.

## 10. Task: Create D1 database and initial schema
Create the initial persistence layer for analyzed job descriptions.
Database contract
Create a jobs table with these fields:
Field	            |   Type                |	Purpose
id	                |   TEXT primary key	|   Unique job-analysis ID
job_description	    |   TEXT	            |   Original submitted description
company	            |   TEXT nullable	    |   Extracted company name
role_title	        |   TEXT nullable	    |   Extracted job title
inventory_revision	|   TEXT	            |   Inventory version used
requirements_json	|   TEXT	            |   Serialized requirements
evidence_matches_json|	TEXT	            |   Serialized evidence matches
warnings_json	    |   TEXT	            |   Serialized warnings
status	            |   TEXT	            |   Analysis status
created_at	        |   TEXT	            |   UTC ISO 8601 timestamp
For the first version, the API will only return completed analyses. The status field may initially contain completed; don't build asynchronous job processing just to make the field useful.

### Implementation requirements
- Use the existing Cloudflare project configuration and migration conventions where possible.
- Add a version-controlled SQL migration.
- Add the D1 binding to the Worker.
- Document local development and deployed database setup.
- Use parameterized SQL statements.
- Don't store AI prompts, raw inventory copies, or redundant inventory snapshots in each job record.

### Acceptance criteria
- A fresh database can be created from the migration.
- The Worker can insert and retrieve a test record.
- Serialized JSON fields round-trip without data loss.
- SQL queries use bound parameters.
- The migration and setup steps are documented.

## 11. Task: Implement job-analysis API request validation
Establish the public contract for submitting a job description.

Endpoint
POST /api/jobs

Request:
{
  "jobDescription": "Full text of the job posting..."
}

jobDescription is the only required field. Company and role title should be extracted from the posting. If they cannot be extracted, throw an error so the description can be ammended. Set a maximum jobDescription length to 50,000 Unicode characters, measured after JSON parsing. Keep the limit in a named configuration constant. Enforce the limit in the Worker before invoking Workers AI or performing inventory retrieval.

Success response
Return 201 Created after a successful, completed analysis. The full response contract is:
{
  "jobId": "generated-unique-id",
  "status": "completed",
  "company": "Example Company",
  "roleTitle": "Senior Backend Engineer",
  "inventoryRevision": "inventory-version",
  "requirements": [],
  "evidenceMatches": [],
  "warnings": [],
  "createdAt": "2026-10-21T16:00:00Z"
}


The arrays will be populated by subsequent tasks. Use a real generated ID and UTC timestamp rather than the example values.

Standard error response
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "jobDescription is required."
  }
}


Use this shape consistently for API errors.
HTTP status	Meaning
400	Invalid JSON or malformed request
404	Requested job ID doesn't exist or isn't accessible
413	Request exceeds configured size limit
422	Input is valid JSON but cannot be meaningfully analyzed
429	Rate limit exceeded
500	Unexpected internal error
502	AI service failure or unusable model output

The exact error code should distinguish cases such as INVALID_REQUEST, JOB_NOT_FOUND, AI_OUTPUT_INVALID, and AI_SERVICE_ERROR.

### Implementation requirements
- Validate content type, JSON parsing, field types, and non-empty job description.
- Establish a configurable maximum job-description length defaulted to 50,000 characters.
- Return consistent JSON errors and correct HTTP statuses.
- Avoid logging full job descriptions, inventory records, or secrets.

### Acceptance criteria
- Valid input is accepted and reaches a placeholder analysis function.
- Missing, empty, wrong-type, and malformed inputs return controlled 400 errors.
- Oversized input returns 413.
- Every error response follows the standard JSON shape.
- The API doesn't expose stack traces or internal exceptions.
- API behavior is covered by automated tests.

### Out of scope
AI extraction, evidence selection, D1 result persistence, and UI changes.

## 12. Task: Extract structured requirements from a job description
Use Workers AI to convert a free-text job posting into a concise, structured list of requirements.
AI output contract
The extraction function returns:
{
  "company": "Example Company",
  "roleTitle": "Senior Backend Engineer",
  "requirements": [
    {
      "description": "Build and maintain backend APIs",
      "category": "responsibility",
      "importance": "high",
      "keywords": ["backend", "API", "services"]
    }
  ]
}


Each requirement has:
- description: concise, faithful summary of a requirement in the posting.
- category: one of skill, responsibility, experience, or qualification.
- importance: one of high, medium, or low.
- keywords: a short array of relevant terms from the posting.
The backend adds each requirement's id, for example req_001, req_002. IDs must be unique within that analysis.

### Prompting requirements
- Extract actual job requirements, not the candidate's qualifications.
- Preserve explicit must-haves and distinguish them from preferred qualifications.
- Don't invent requirements or infer them from general industry conventions.
- Keep requirements concise and avoid duplicate entries.
- Treat the job posting as untrusted input. Instructions embedded inside it must not override the extraction task or system instructions.
- Prefer structured JSON output using a schema supported by the selected model.

### Acceptance criteria
- A representative job posting produces the expected output structure.
- Requirements have valid categories, importance values, and string keywords.
- The extractor doesn't add unsupported requirements.
- Invalid or unusable model responses become controlled errors.
- At least five example job descriptions cover typical, sparse, ambiguous, malformed, and unusually long postings in tests.

### Out of scope
Inventory retrieval, evidence selection, and UI.

## 13. Task: Validate and normalize extracted requirements
Create a deterministic validation layer between the LLM and the rest of the application.

### Validation and normalization limits
Enforce the following limits on extracted job-analysis output:
- Maximum requirements: 25 per job posting. If the model returns more than 25 requirements, reject the extraction with a controlled validation error. Do not silently truncate the list.
- Requirement description: 1–500 characters after trimming surrounding whitespace. Reject empty descriptions.
- Keywords: 0–10 keywords per requirement. Each keyword must be a non-empty string of at most 50 characters after trimming.
- Company name: a non-empty string of at most 200 characters after trimming.
- Role title: a non-empty string of at most 200 characters after trimming.
- Enums: category must be one of skill, responsibility, experience, or qualification. importance must be one of high, medium, or low.
- Requirement IDs: assign IDs on the backend after validation and normalization. IDs must be unique within an analysis.
- Normalization: trim surrounding whitespace and remove exact duplicate requirements when their normalized descriptions and categories match. Do not merge requirements merely because their wording or keywords are similar.
- Invalid output: reject malformed or out-of-limit output with a controlled error. Do not silently drop requirements, truncate descriptions, or invent replacement values.
- Add tests for values exactly at each limit, values one character/item over each limit, whitespace-only strings, duplicate requirements, and invalid enum values.

### Implementation requirements
- Validate the output against an application-owned schema.
- Check required fields and enum values.
- Reject malformed entries rather than silently discarding them.
- Normalize whitespace and remove exact duplicate requirements where safe.
- Assign requirement IDs on the backend.
- Enforce the normalization limits on the number and length of requirements.
- Preserve the original job description independently of the normalized output.
Do not introduce confidence scores, a complex skill taxonomy, or model-generated evidence IDs at this stage.

### Acceptance criteria
- Valid extracted output is normalized into the expected schema.
- Every requirement has a unique ID within the analysis.
- Invalid categories, importance values, and field types are rejected.
- Empty or excessive output is handled predictably.
- Duplicate removal doesn't merge meaningfully different requirements.
- Tests cover malformed JSON, missing fields, duplicate requirements, and invalid enums.

## 14. Task: Retrieve candidate inventory evidence deterministically
Find a small, relevant candidate set of inventory records for each job requirement before involving the model in evidence matching.

### Implementation requirements
- Reuse the existing inventory loader and schema validation.
- Read existing record IDs, types, descriptions, and relevant metadata.
- Use deterministic keyword matching and appropriate record-type filtering.
- Return existing inventory records with their original IDs intact.
- Allow a requirement to return zero candidate records.
- Keep retrieval logic independent of Workers AI so it can be tested without inference calls.
- Set a configurable limit of 5 on candidates per requirement.
Start with simple token/keyword matching and existing metadata. Do not add embeddings, vector search, a separate search service, or a new database for inventory retrieval.

### Important evidence boundaries
The retrieval system must not turn a related keyword into a stronger claim than the inventory supports. For example:
- Kafka consumer experience is not evidence of Kafka producer ownership.
- Reviewing Vue code is not evidence of implementing Vue features.
- Owning a public API is not evidence of owning the underlying data pipeline.
The retrieval layer finds candidates; it doesn't decide that a candidate proves a requirement.

Acceptance criteria
- A requirement returns matching inventory records with their original IDs.
- No matches produces an empty list, not a fabricated record.
- Results are deterministic for the same inventory and requirement.
- Candidate count is bounded.
- All returned records pass the existing inventory validation rules.
- Tests cover strong matches, weak/ambiguous matches, no matches, and the evidence boundaries above.

## 15. Task: Match requirements to candidate evidence with Workers AI
Have the model assess whether the retrieved inventory records support each requirement.
AI output contract
{
  "matches": [
    {
      "requirementId": "req_001",
      "matchStrength": "strong",
      "evidenceRecordIds": ["accomplishment_123"],
      "rationale": "The record documents ownership of a public Go API.",
      "gap": null
    }
  ]
}


Each match has:
- requirementId: ID of an extracted requirement.
- matchStrength: strong, partial, or none.
- evidenceRecordIds: IDs selected only from the candidates supplied to the model.
- rationale: short explanation of relevance, grounded in the record.
- gap: a brief description of missing evidence, or null.

### Prompting requirements
- Provide only the requirement and the relevant candidate records.
- Tell the model explicitly that candidate evidence is the only source of candidate experience.
- Do not treat a shared keyword as sufficient proof.
- Do not infer ownership, seniority, scale, metrics, or production experience unless the record supports it.
- Require a none match when no evidence supports the requirement.
- Use structured output where supported, but don't trust the model's schema compliance alone.
- Keep the rationale concise; no lengthy chain-of-thought output.

### Acceptance criteria
- The response follows the expected structure.
- The model selects only candidate IDs supplied to it.
- Unsupported requirements can be marked none.
- The model does not invent experience or metrics in rationales.
- AI failures and malformed output are surfaced as controlled errors.
- Tests use fixed example inventories and requirements to check strong, partial, and no-match behavior.

## 16. Task: Enforce evidence-matching JSON schema using Workers AI response format
Update the evidence-matching Workers AI invocation to use Cloudflare Workers AI's `response_format` with `type: "json_schema"`, rather than relying on prompt instructions alone to make the model return every required JSON field.

The response must include all required fields, including `gap` when its value is `null`, and `evidenceRecordIds` when its value is an empty array.

### Implementation requirements

1. Define a reusable `MATCHING_SCHEMA` that matches the existing evidence-matching response contract:

   - Top-level object with required `matches` array.
   - Each match requires `requirementId`, `matchStrength`, `evidenceRecordIds`, `rationale`, and `gap`.
   - `matchStrength` must be `strong`, `partial`, or `none`.
   - `evidenceRecordIds` must be an array of strings.
   - `gap` must accept either a string or `null`.
   - All five match fields must appear in every match object, including when a field has an empty array or `null` value.

2. Pass the schema through the Workers AI invocation's `response_format`:

   ```js
   response_format: {
     type: "json_schema",
     schema: MATCHING_SCHEMA,
   }
   ```

5. Keep `MATCHING_INSTRUCTIONS` separate from the schema. The prompt should describe the semantic requirements for evidence matching, while the schema defines the required output structure.

6. Keep the existing input contract unchanged: the model receives the requirement and its candidate inventory records. Do not broaden the candidate set or allow the model to invent evidence IDs.

7. Keep application-side response parsing and validation. Structured output reduces formatting errors but does not replace validation of the response.

8. If the model returns an API error, invalid response, or output that cannot be parsed or validated, handle it using the existing controlled error path. Do not save the invalid result as a completed analysis. However, do log the invalid response to the console for inspection.

### Acceptance criteria

- The evidence-matching invocation passes `response_format` with `type: "json_schema"` and the matching schema.
- Every match includes all five required fields.
- A no-match response includes `evidenceRecordIds: []` and an explicit `gap` value.
- A response with no identified gap includes `"gap": null`, not an omitted field.
- Existing match-strength values and field names remain unchanged.
- Application-side parsing and validation remain in place.
- Tests cover strong, partial, and no-match outputs, including empty arrays and `null` values.
- Tests verify that invalid model output follows the existing controlled error path.
- The implementation and tests are documented in the ticket's completion notes.

### Out of scope

- Changing the evidence-matching algorithm or prompt semantics.
- Changing the requirement or evidence-match data models.
- Relaxing inventory-ID validation.
- Adding retries, fallback models, or a new orchestration layer unless required to handle a documented compatibility issue.

### Implementation note

Treat `MATCHING_SCHEMA` as the authoritative output-format contract and `MATCHING_INSTRUCTIONS` as the semantic instruction set. Do not duplicate the entire schema in the prompt. The model's response must still be treated as untrusted input and validated before persistence.

## 17. Task: Update AI model
Change the AI model to use a json version of llama 3.3 such as @cf/meta/llama-3.3-70b-json when expecting a json response. Have both the free text and json models defined as configurable constants.

## 18. Task: Normalize omitted optional evidence fields
Make evidence-matching output resilient to the model omitting `evidenceRecordIds` when it has no supporting evidence, while preserving strict validation of substantive claims.

### Implementation requirements
1. Keep the existing evidence-matching prompt and response contract.
2. Add a deterministic normalization step between parsing the Workers AI response and running validation.
3. Treat `evidenceRecordIds` as optional in the raw model response, even if the model is still asked to include it.
4. Apply these rules:
   - If `matchStrength` is `none` and `evidenceRecordIds` is omitted, normalize it to `[]`.
   - If `evidenceRecordIds` is present, require it to be an array of strings.
   - If `matchStrength` is `strong` or `partial` and `evidenceRecordIds` is omitted or empty, reject the match as invalid rather than inventing evidence or silently downgrading the match.
   - Never replace invalid, unknown, or unauthorized evidence IDs with an empty array.
5. Preserve the existing `gap` contract. Apply explicit, documented normalization rules only where the intended meaning is unambiguous; otherwise reject the response.
6. Pass the normalized result through the existing validation step before persistence.
7. Keep normalization separate from the AI invocation and business-logic validation so it can be unit-tested independently.

### Acceptance criteria
- A no-match result that omits `evidenceRecordIds` becomes a valid result with `evidenceRecordIds: []`.
- A no-match result with an explicit empty array remains valid.
- A strong or partial match without evidence IDs is rejected.
- Unknown evidence IDs are never silently discarded.
- Missing or malformed required fields are handled predictably.
- Normalized results pass through to validation.
- Unit tests cover omitted, empty, valid, malformed, and unauthorized evidence IDs.
- Existing valid model responses continue to work unchanged.

### Out of scope
- Changing evidence-selection logic.
- Automatically retrying the model or switching models.
- Relaxing evidence-reference validation.
- Changing the persisted API response contract.

## 19. Task: Expand employment candidates to include related accomplishments
When candidate retrieval selects an employment record for a job requirement, automatically include its associated accomplishment records in that requirement’s candidate group. This ensures the evidence-matching model can select specific accomplishments related to an employment record it was given.
Do not weaken evidence validation to permit IDs that were not supplied to the model.

### Requirements
1. Preserve existing retrieval behavior. Keep the current requirement-matching logic and its existing candidate selection behavior.
2. Expand selected employment records. For each requirement’s candidate group, when an employment record is selected, include its associated accomplishment records from the canonical inventory.
3. Preserve record structure and IDs. Use the existing inventory records without rewriting their contents or generating new IDs. Preserve the existing candidate representation, including record types.
4. Avoid duplicates. If an accomplishment is already in the candidate group, do not add it a second time.
5. Preserve evidence boundaries. Only include accomplishments actually associated with the selected employment record according to the canonical inventory’s relationship fields. Do not infer associations from matching text or IDs.
6. Keep validation strict. The evidence validator must continue rejecting IDs that are not in the final candidate group for that requirement.

### Acceptance criteria
- When a candidate group contains an employment record with associated accomplishments, those accomplishments are added to the group.
- Accomplishments are not added when their employment record was not selected, unless they were independently selected by the existing retrieval logic.
- Duplicate accomplishment IDs do not appear in a candidate group.
- Expansion is deterministic: identical inventory, requirements, and retrieval configuration produce the same candidate groups.
- Every added record retains its canonical ID, type, and content.
- Evidence validation accepts an associated accomplishment that was added to the candidate group.
- Evidence validation still rejects an accomplishment that exists in the inventory but is absent from that requirement’s candidate group.
- Requirements with no selected employment records continue to use the existing retrieval behavior.
- Tests cover an employment record with multiple accomplishments, an employment record with no accomplishments, an already-included accomplishment, and a candidate group near its limit.

### Implementation notes
- Inspect the canonical inventory schema to determine how employment records reference their accomplishments. Use the existing relationship fields rather than assuming a particular field name.
- Keep the expansion logic in candidate retrieval, before the candidate groups are passed to evidence matching.
- Prefer a small, deterministic helper function rather than changing the AI prompt or validation rules.
- Do not add embeddings, vector search, new dependencies, or unrelated architectural changes.

## 20. Task: Retrieve accomplishment-only evidence candidates
Change evidence candidate retrieval so that only accomplishment records can be selected as evidence for job requirements. Employment records may provide supporting context, but must not be returned as selectable evidence.

This removes employment-driven candidate expansion, keeps the candidate limit predictable, and reduces unnecessary input to Workers AI. Update `retrieveEvidenceCandidates()` and its associated tests accordingly.

### Requirements
1. Accomplishments are the only selectable evidence
   - Retrieve and rank accomplishment records directly against each requirement.
   - Do not include employment records in the candidate list.
   - Remove the call to `expandEmploymentCandidates()` from the retrieval path. Remove the helper and associated tests completely.
2. Enforce the candidate limit
   - Apply the existing deterministic relevance scoring and tie-breaking to accomplishment records.
   - Apply `limit` to the ranked accomplishment candidates.
   - Return no more than `limit` candidates per requirement.
   - Preserve the existing behavior for zero matching candidates and requirements with no relevant accomplishments.
   - Do not expand the candidate list after applying the limit.
3. Preserve canonical records
   - Keep original accomplishment IDs and record types.
   - Return the original accomplishment records rather than reconstructing or modifying them.
   - Do not modify the canonical inventory or its schema.
   - Do not create new IDs or duplicate accomplishment records.
4. Preserve employment relationships
   - Accomplishments may refer to their associated employment through `employer_id`.
   - Do not include employment records as selectable candidates merely because an accomplishment references them.
   - Do not add employment context to the AI request.
5. Preserve strict evidence validation
   - The evidence-matching validator must continue to reject IDs that were not supplied as candidates for the corresponding requirement.
   - Only accomplishment IDs may be returned as evidence.
   - Preserve existing validation rules for match strength, empty evidence selections, duplicate IDs, and missing or duplicate requirement matches.
   - Do not weaken validation to accommodate the new retrieval behavior.
6. Keep retrieval deterministic
   - Preserve the existing relevance-scoring implementation and deterministic tie-breaking.
   - Given the same inventory, requirements, and limit, retrieval must return the same candidates in the same order.

### Acceptance criteria
- Every returned evidence candidate has type `accomplishment`.
- No employment record appears in a requirement's selectable candidate list.
- Each requirement returns at most `limit` candidates.
- Candidates are ranked using the existing relevance-scoring and tie-breaking behavior.
- Relevant accomplishments can be retrieved without first selecting their associated employment record.
- Employment records with many linked accomplishments cannot cause the candidate limit to be exceeded.
- Returned records retain their canonical IDs and contents.
- An accomplishment can be selected as evidence only when its ID appears in that requirement's candidate list.
- The existing validator continues to reject unknown IDs, employment IDs, duplicate evidence IDs, and invalid match structures.
- Existing tests are updated to reflect accomplishment-only evidence.
- Tests cover an employment record with multiple linked accomplishments to verify that retrieval does not expand candidates beyond the limit.
- Tests cover an accomplishment whose associated employment record would not independently rank as a candidate.
- Tests cover fewer matching accomplishments than the limit and no matching accomplishments.
- Existing deterministic ordering and tie-breaking tests continue to pass.
- Any now-unused helper is removed, provided it has no other callers.

### Out of scope
- Changing the canonical inventory schema or record IDs.
- Changing the relevance-scoring algorithm or candidate limit.
- Introducing embeddings, vector search, or a new retrieval system.
- Changing the Workers AI model, output-token limit, or evidence-matching schema.

### Implementation notes
- Inspect `RECORD_TYPES` and `TYPES_BY_CATEGORY` before making changes. Ensure the retrieval path explicitly limits selectable evidence to accomplishments rather than relying on employment records being filtered out incidentally.
- Preserve `validateInputs()` and existing error behavior.
- Review any consumers of `retrieveEvidenceCandidates()` before removing employment candidates, especially code that assumes candidate records can have multiple types.
- Run the focused retrieval and evidence-validation tests, followed by the relevant end-to-end tests.
- If the existing AI prompt assumes employment records can be cited, update its instructions to specify that only supplied accomplishment IDs are valid evidence.
