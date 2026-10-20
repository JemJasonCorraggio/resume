# Prompts
## 1. Task: Build My Master Career Accomplishment and Skills Inventory

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

## 2. Task: Use Master Career Inventory to Define Inventory Schema
master-career-inventory.json is a file that details a person's career history. Use this file as a baseline to define a schema in Python to be used to input and update a person's career history. Document the expected structure of the inventory: employment history, accomplishments, skills, leadership examples, projects, education, career preferences, and verification questions.

Acceptance criteria

- Required fields and field types are defined.
- IDs and references have documented meanings.
- Optional fields and permitted null values are explicit.
- The schema is versioned.
- Known limitations and negative qualifications can be represented without inventing experience.

## 3. Task: Add Inventory Versioning
Store the JSON inventory in the project in a directory called data. Add a method to upload a new version of the inventory and update the version number. Keep it separate from application code.

Acceptance criteria
- The inventory parses as valid JSON.
- The original IDs are preserved.
- The inventory revision is recorded.
- The README explains how to update the fixture.
