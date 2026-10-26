(() => {
  "use strict";

  const apiBaseUrl = (window.CAREER_INVENTORY_API_BASE_URL || "/api").replace(/\/+$/, "");
  const apiUrl = `${apiBaseUrl}/inventory`;
  const statusElement = document.querySelector("#load-status");
  const summaryElement = document.querySelector("#inventory-summary");
  const validationSummary = document.querySelector("#validation-summary");
  const diagnostics = document.querySelector("#diagnostics");
  const searchInput = document.querySelector("#record-search");
  const typeSelect = document.querySelector("#record-type");
  const recordsList = document.querySelector("#records");
  const resultCount = document.querySelector("#result-count");
  const emptyResults = document.querySelector("#empty-results");
  const detail = document.querySelector("#record-detail");
  const reloadButton = document.querySelector("#reload-button");
  const analysisForm = document.querySelector("#analysis-form");
  const analyzeButton = document.querySelector("#analyze-button");
  const analysisStatus = document.querySelector("#analysis-status");
  const analysisError = document.querySelector("#analysis-error");
  const analysisResults = document.querySelector("#analysis-results");
  const openJobForm = document.querySelector("#open-job-form");
  const openJobButton = document.querySelector("#open-job-button");
  const savedJobId = document.querySelector("#saved-job-id");
  let inventory = null;
  let records = [];
  let recordById = new Map();
  let selectedKey = null;
  let currentAnalysis = null;

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setStatus(text, kind) {
    statusElement.textContent = text;
    statusElement.className = `status status-${kind}`;
  }

  function formatLabel(value) {
    return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  async function requestJson(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
      });
    } catch {
      throw new Error("Could not reach the analysis service. Check your connection and try again.");
    }

    let payload;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      throw new Error(`The service returned an unreadable response (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new Error(
        typeof payload?.error?.message === "string"
          ? payload.error.message
          : `The request failed with HTTP ${response.status}. Try again or contact the site administrator.`,
      );
    }
    return payload;
  }

  function updateSavedJobUrl(jobId) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("jobId", jobId);
    window.history.replaceState(null, "", nextUrl);
  }

  function showAnalysisError(message) {
    currentAnalysis = null;
    analysisResults.hidden = true;
    analysisResults.replaceChildren();
    analysisError.textContent = message;
    analysisError.hidden = false;
    analysisStatus.textContent = "Analysis failed.";
  }

  function appendEvidenceIds(parent, ids) {
    if (!ids.length) return;
    const links = make("div", "evidence-ids");
    for (const id of ids) {
      const record = recordById.get(id);
      if (record) {
        const link = make("button", "evidence-link", id);
        link.type = "button";
        link.dataset.evidenceId = id;
        link.title = `Inspect ${record.title} in the inventory browser`;
        links.append(link);
      } else {
        links.append(make("span", "tag", `${id} · not in loaded inventory`));
      }
    }
    parent.append(links);
  }

  function renderAnalysis(job) {
    if (
      !job ||
      typeof job.jobId !== "string" ||
      typeof job.company !== "string" ||
      typeof job.roleTitle !== "string" ||
      !Array.isArray(job.requirements) ||
      !Array.isArray(job.evidenceMatches)
    ) {
      throw new Error("The service returned an incomplete analysis. Try opening the saved job again.");
    }

    currentAnalysis = job;
    analysisResults.replaceChildren();
    const heading = make("div", "analysis-header");
    const title = make("div");
    title.append(
      make("h2", "", `${job.company} · ${job.roleTitle}`),
      make("p", "saved-job-id", `Saved job ID: ${job.jobId}`),
    );
    heading.append(title);
    analysisResults.append(heading);

    const metadata = make("div", "analysis-meta");
    metadata.append(
      make("span", "", `Inventory revision: ${job.inventoryRevision || "not available"}`),
      make("span", "", `Created: ${job.createdAt || "not available"}`),
    );
    analysisResults.append(metadata);
    analysisResults.append(make(
      "p",
      "analysis-note",
      "These are requirements from the posting. Evidence assessments describe only what the supplied inventory supports; a match is not proof of an unstated qualification.",
    ));

    const description = document.createElement("details");
    const summary = make("summary", "", "Submitted job posting");
    const posting = make("p", "posting-copy", job.jobDescription || "");
    description.append(summary, posting);
    analysisResults.append(description);

    const matchesById = new Map(
      job.evidenceMatches.map((match) => [match.requirementId, match]),
    );
    const requirementList = make("div", "requirements");
    for (const requirement of job.requirements) {
      const card = make("article", "requirement-card");
      const match = matchesById.get(requirement.id);
      const matchStrength = ["strong", "partial", "none"].includes(match?.matchStrength)
        ? match.matchStrength
        : "unavailable";
      const cardHeading = make("div", "requirement-heading");
      cardHeading.append(
        make("h3", "", requirement.description),
        make(
          "span",
          `match-status match-${matchStrength}`,
          match ? `${matchStrength} evidence` : "assessment unavailable",
        ),
      );
      card.append(cardHeading);
      const tags = make("div", "requirement-tags");
      tags.append(
        make("span", "tag", formatLabel(requirement.category || "category unavailable")),
        make("span", "tag", `${formatLabel(requirement.importance || "importance unavailable")} priority`),
      );
      card.append(tags);

      if (!match) {
        card.append(make(
          "p",
          "gap-copy",
          "No evidence assessment was returned for this requirement.",
        ));
      } else {
        if (match.matchStrength === "none") {
          card.append(make(
            "p",
            "gap-copy",
            "No supporting evidence was found in the inventory. The analysis succeeded; this requirement is not established as candidate experience.",
          ));
        }
        if (typeof match.rationale === "string" && match.rationale) {
          card.append(make("p", "evidence-copy", `Assessment: ${match.rationale}`));
        }
        appendEvidenceIds(
          card,
          Array.isArray(match.evidenceRecordIds) ? match.evidenceRecordIds : [],
        );
        if (typeof match.gap === "string" && match.gap) {
          card.append(make("p", "gap-copy", `Gap: ${match.gap}`));
        }
      }
      requirementList.append(card);
    }
    if (job.requirements.length) {
      analysisResults.append(make("h3", "", "Extracted requirements and evidence"));
      analysisResults.append(requirementList);
    } else {
      analysisResults.append(make(
        "p",
        "no-requirements",
        "Analysis completed successfully, but no requirements were extracted from this posting.",
      ));
    }

    if (Array.isArray(job.warnings) && job.warnings.length) {
      const warnings = make("ul", "job-warnings");
      for (const warning of job.warnings) warnings.append(make("li", "", String(warning)));
      analysisResults.append(warnings);
    }
    analysisResults.hidden = false;
    analysisError.hidden = true;
    analysisStatus.textContent = "Analysis complete and saved.";
    savedJobId.value = job.jobId;
    updateSavedJobUrl(job.jobId);
  }

  async function submitAnalysis(event) {
    event.preventDefault();
    if (analyzeButton.disabled) return;
    const formData = new FormData(analysisForm);
    const company = String(formData.get("company") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const jobDescription = String(formData.get("jobDescription") || "");
    if (!company || !title || !jobDescription.trim()) {
      showAnalysisError("Enter a company, role title, and job posting before submitting.");
      return;
    }
    analyzeButton.disabled = true;
    analysisError.hidden = true;
    analysisResults.hidden = true;
    analysisStatus.textContent = "Analyzing posting…";
    try {
      const job = await requestJson(`${apiBaseUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, title, jobDescription }),
      });
      renderAnalysis(job);
    } catch (error) {
      showAnalysisError(error instanceof Error ? error.message : "The analysis request failed.");
    } finally {
      analyzeButton.disabled = false;
    }
  }

  async function openSavedAnalysis(event, jobIdOverride) {
    event?.preventDefault();
    if (openJobButton.disabled) return;
    const jobId = (jobIdOverride || savedJobId.value).trim();
    if (!jobId) {
      showAnalysisError("Enter a saved job ID to reopen an analysis.");
      savedJobId.focus();
      return;
    }
    openJobButton.disabled = true;
    analysisError.hidden = true;
    analysisResults.hidden = true;
    analysisStatus.textContent = "Loading saved analysis…";
    try {
      const job = await requestJson(`${apiBaseUrl}/jobs/${encodeURIComponent(jobId)}`);
      renderAnalysis(job);
    } catch (error) {
      showAnalysisError(error instanceof Error ? error.message : "The saved analysis could not be loaded.");
    } finally {
      openJobButton.disabled = false;
    }
  }

  function recordTitle(record, key) {
    for (const field of ["title", "name", "employer", "credential", "question", "statement"]) {
      if (typeof record[field] === "string" && record[field].trim()) return record[field];
    }
    return record.id || key;
  }

  function collectRecords(data) {
    const collected = [];
    for (const [collection, values] of Object.entries(data)) {
      if (!Array.isArray(values)) continue;
      values.forEach((record, index) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) return;
        const key = `${collection}:${index}`;
        collected.push({
          collection,
          index,
          key,
          id: typeof record.id === "string" ? record.id : `${collection}[${index}]`,
          title: recordTitle(record, key),
          record,
        });
      });
    }
    return collected;
  }

  function searchableText(item) {
    return `${item.id} ${item.title} ${JSON.stringify(item.record)}`.toLocaleLowerCase();
  }

  function filteredRecords() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const type = typeSelect.value;
    return records.filter((item) =>
      (!type || item.collection === type) && (!query || searchableText(item).includes(query))
    );
  }

  function renderRecordList() {
    const visible = filteredRecords();
    recordsList.replaceChildren();
    resultCount.textContent = `${visible.length} of ${records.length} records`;
    emptyResults.hidden = visible.length !== 0;

    for (const item of visible) {
      const listItem = make("li");
      const button = make("button", "record-button");
      button.type = "button";
      button.dataset.key = item.key;
      button.setAttribute("aria-current", String(item.key === selectedKey));
      button.append(
        make("span", "record-name", item.title),
        make("span", "record-meta", `${item.id} · ${formatLabel(item.collection)}`)
      );
      listItem.append(button);
      recordsList.append(listItem);
    }
  }

  function appendTextWithReferences(parent, value) {
    const text = String(value);
    const pattern = /\b(?:EMP|ACC|SK|LEAD|PROJ|EDU|VQ|SRC)-[A-Za-z0-9-]+\b/g;
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(cursor, match.index)));
      const id = match[0];
      const target = recordById.get(id);
      if (target) {
        const link = make("button", "reference-link", id);
        link.type = "button";
        link.dataset.key = target.key;
        parent.append(link);
      } else {
        parent.append(make("span", "reference-missing", `${id} · unresolved`));
      }
      cursor = match.index + id.length;
    }
    parent.append(document.createTextNode(text.slice(cursor)));
  }

  function appendValue(parent, value) {
    if (value === null) {
      parent.append(make("span", "muted", "null"));
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        parent.append(make("span", "muted", "[]"));
      } else {
        value.forEach((entry, index) => {
          if (index) parent.append(document.createTextNode("\n"));
          if (entry && typeof entry === "object") appendValue(parent, entry);
          else appendTextWithReferences(parent, entry);
        });
      }
    } else if (value && typeof value === "object") {
      const nested = document.createElement("dl");
      nested.className = "field-list";
      for (const [key, entry] of Object.entries(value)) {
        nested.append(make("dt", "", formatLabel(key)));
        const description = document.createElement("dd");
        appendValue(description, entry);
        nested.append(description);
      }
      parent.append(nested);
    } else {
      appendTextWithReferences(parent, value);
    }
  }

  function selectRecord(key) {
    const item = records.find((record) => record.key === key);
    if (!item) return;
    selectedKey = key;
    renderRecordList();
    detail.replaceChildren();
    detail.append(
      make("h2", "", item.title),
      make("p", "record-id", `${item.id} · ${formatLabel(item.collection)}`)
    );
    const fields = document.createElement("dl");
    fields.className = "field-list";
    for (const [field, value] of Object.entries(item.record)) {
      fields.append(make("dt", "", formatLabel(field)));
      const description = document.createElement("dd");
      appendValue(description, value);
      fields.append(description);
    }
    detail.append(fields);
  }

  function diagnosticTarget(message) {
    const path = message.match(/^([a-z_]+)\[(\d+)\]/);
    if (!path) return null;
    const item = records.find(
      (record) => record.collection === path[1] && record.index === Number(path[2])
    );
    if (item) return item;
    const id = message.match(/\(([A-Z]+-[A-Za-z0-9-]+)\)/)?.[1];
    return id ? recordById.get(id) || null : null;
  }

  function renderDiagnostics(validation) {
    const errors = Array.isArray(validation?.errors) ? validation.errors : [];
    const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
    validationSummary.replaceChildren();
    diagnostics.replaceChildren();
    validationSummary.append(
      make("span", errors.length ? "validation-count count-error" : "validation-count count-good",
        `${errors.length} validation error${errors.length === 1 ? "" : "s"}`),
      make("span", warnings.length ? "validation-count count-warning" : "validation-count count-good",
        `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`)
    );

    for (const [severity, messages] of [["error", errors], ["warning", warnings]]) {
      for (const message of messages) {
        const row = make("div", `diagnostic${severity === "error" ? " diagnostic-error" : ""}`);
        const category = severity === "warning"
          ? "Warning"
          : /reference/i.test(message) ? "Cross-reference" : "Schema / ID";
        row.append(make("span", "diagnostic-category", category));
        const target = diagnosticTarget(message);
        if (target) {
          const link = make("button", "diagnostic-link", message);
          link.type = "button";
          link.dataset.key = target.key;
          row.append(link);
        } else {
          row.append(make("span", "", message));
        }
        diagnostics.append(row);
      }
    }
    return { errors, warnings };
  }

  function showLoadFailure(message) {
    inventory = null;
    records = [];
    recordById = new Map();
    searchInput.disabled = true;
    typeSelect.disabled = true;
    renderRecordList();
    validationSummary.replaceChildren();
    diagnostics.replaceChildren();
    summaryElement.textContent = message;
    detail.replaceChildren(make("p", "empty-state", "Inventory details are unavailable until the API can load the inventory."));
    setStatus("Load failed", "error");
  }

  async function loadInventory() {
    reloadButton.disabled = true;
    setStatus("Loading inventory…", "loading");
    summaryElement.textContent = "Requesting the inventory and validation report.";
    try {
      const payload = await requestJson(apiUrl);
      if (payload.loaded !== true || !payload.inventory) {
        throw new Error("The inventory service returned an invalid response.");
      }
      inventory = payload.inventory;
      records = collectRecords(inventory);
      recordById = new Map(records.filter((item) => item.record.id).map((item) => [item.id, item]));
      if (currentAnalysis) renderAnalysis(currentAnalysis);
      searchInput.disabled = false;
      typeSelect.disabled = false;
      typeSelect.replaceChildren(new Option("All types", ""));
      for (const collection of [...new Set(records.map((record) => record.collection))]) {
        typeSelect.add(new Option(formatLabel(collection), collection));
      }
      const { errors, warnings } = renderDiagnostics(payload.validation);
      const schemaVersion = inventory.schema_version ? ` · schema ${inventory.schema_version}` : "";
      summaryElement.textContent =
        `${records.length} records loaded${schemaVersion}. ` +
        (errors.length ? "Validation failed; review the findings below." :
          warnings.length ? "Validation passed with warnings." : "Validation passed with no warnings.");
      setStatus(errors.length ? "Loaded · errors" : warnings.length ? "Loaded · warnings" : "Loaded · valid",
        errors.length ? "error" : warnings.length ? "warning" : "ok");
      const visible = filteredRecords();
      const next = visible.find((item) => item.key === selectedKey) || visible[0];
      if (next) selectRecord(next.key);
      else {
        selectedKey = null;
        renderRecordList();
        detail.replaceChildren(make("p", "empty-state", "No records match this search."));
      }
    } catch (error) {
      showLoadFailure(error instanceof Error ? error.message : "The inventory API request failed.");
    } finally {
      reloadButton.disabled = false;
    }
  }

  recordsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key]");
    if (button) selectRecord(button.dataset.key);
  });
  detail.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key]");
    if (button) selectRecord(button.dataset.key);
  });
  diagnostics.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key]");
    if (button) selectRecord(button.dataset.key);
  });
  analysisForm.addEventListener("submit", submitAnalysis);
  openJobForm.addEventListener("submit", openSavedAnalysis);
  analysisResults.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-evidence-id]");
    const record = button && recordById.get(button.dataset.evidenceId);
    if (!record) return;
    searchInput.value = "";
    typeSelect.value = "";
    renderRecordList();
    selectRecord(record.key);
    document.querySelector(".browser").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  searchInput.addEventListener("input", () => {
    renderRecordList();
    const visible = filteredRecords();
    if (selectedKey && !visible.some((item) => item.key === selectedKey)) {
      if (visible[0]) selectRecord(visible[0].key);
      else {
        selectedKey = null;
        detail.replaceChildren(make("p", "empty-state", "No records match this search."));
      }
    }
  });
  typeSelect.addEventListener("change", () => {
    renderRecordList();
    const visible = filteredRecords();
    if (!visible.some((item) => item.key === selectedKey)) {
      if (visible[0]) selectRecord(visible[0].key);
      else {
        selectedKey = null;
        detail.replaceChildren(make("p", "empty-state", "No records match this filter."));
      }
    }
  });
  reloadButton.addEventListener("click", loadInventory);
  loadInventory();
  const savedJobIdFromUrl = new URLSearchParams(window.location.search).get("jobId");
  if (savedJobIdFromUrl) {
    savedJobId.value = savedJobIdFromUrl;
    openSavedAnalysis(null, savedJobIdFromUrl);
  }
})();
