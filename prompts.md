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