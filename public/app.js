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
  const openDraftForm = document.querySelector("#open-draft-form");
  const openDraftButton = document.querySelector("#open-draft-button");
  const savedDraftId = document.querySelector("#saved-draft-id");
  let inventory = null;
  let records = [];
  let recordById = new Map();
  let selectedKey = null;
  let currentAnalysis = null;
  let resumeReviewJobId = null;
  let currentResumeDraft = null;
  let editingResume = null;
  let hasUnsavedResumeEdits = false;
  let isSavingResume = false;

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function markResumeChanged() {
    hasUnsavedResumeEdits = true;
    const status = document.querySelector("#resume-save-status");
    status.textContent = "Unsaved changes";
    status.className = "status status-warning";
    renderResumeEditControls();
  }

  function confirmDiscardResumeChanges() {
    if (isSavingResume) return false;
    if (!hasUnsavedResumeEdits) return true;
    const discard = window.confirm(
      "Discard unsaved resume changes and continue? Choose Cancel to stay here and save them.",
    );
    if (!discard) return false;
    cancelResumeEditing();
    return true;
  }

  function editableField(tag, className, value, label, onChange, multiline = false) {
    if (!editingResume) return make(tag, className, value);
    const control = make(multiline ? "textarea" : "input", `${className} resume-edit-control`);
    if (multiline) control.value = value;
    else {
      control.type = "text";
      control.value = value;
    }
    control.setAttribute("aria-label", label);
    if (multiline) {
      control.rows = Math.max(3, Math.min(8, String(value).split("\n").length + 1));
    }
    control.addEventListener("input", () => {
      onChange(control.value);
      markResumeChanged();
    });
    return control;
  }

  function editAction(label, action, className = "button button-secondary") {
    const button = make("button", className, label);
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  }

  function manualContentNote(kind) {
    return make(
      "span",
      "resume-manual-note",
      kind === "added"
        ? "Manually added · no generated evidence"
        : "Manually edited · original evidence retained, not revalidated",
    );
  }

  function renderResumeEditControls() {
    const editButton = document.querySelector("#resume-edit-button");
    const saveButton = document.querySelector("#resume-save-button");
    const cancelButton = document.querySelector("#resume-cancel-button");
    const hasDraft = Boolean(currentResumeDraft);
    editButton.hidden = !hasDraft || Boolean(editingResume);
    saveButton.hidden = !editingResume;
    cancelButton.hidden = !editingResume;
    saveButton.disabled = !hasUnsavedResumeEdits;
    document.querySelector("#resume-cancel-button").disabled = isSavingResume;
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

  function recordEvidenceContent(record) {
    if (!record || typeof record !== "object") return "";
    const preferred = ["description", "summary", "text", "statement", "title", "name", "details", "outcome"];
    for (const field of preferred) {
      if (typeof record[field] === "string" && record[field].trim()) return record[field].trim();
    }
    return Object.entries(record)
      .filter(([key]) => key !== "id")
      .map(([key, value]) => `${formatLabel(key)}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
      .join(" · ");
  }

  function evidenceControl(ids, label) {
    const wrapper = make("details", "resume-evidence");
    const unresolved = [];
    wrapper.append(make("summary", "evidence-summary", "Supporting evidence"));
    for (const id of ids) {
      const item = recordById.get(id);
      if (!item) unresolved.push(id);
      else {
        const record = make("div", "evidence-record");
        record.append(
          make("strong", "", recordEvidenceContent(item.record)),
          make("span", "evidence-record-meta", `${formatLabel(item.collection)} · ${item.id}`)
        );
        wrapper.append(record);
      }
    }
    for (const id of unresolved) {
      const missing = make("p", "evidence-missing", `Missing evidence record: ${id}`);
      missing.dataset.label = label;
      wrapper.append(missing);
    }
    wrapper.setAttribute("aria-label", `Supporting evidence for ${label}`);
    return wrapper;
  }

  function addGeneratedInlineEvidence(parent, text, ids, label) {
    const line = make("div", "generated-line");
    line.append(make("span", "", text));
    line.append(evidenceControl(ids, label));
    parent.append(line);
  }

  function warningText(warning) {
    if (typeof warning === "string") return warning;
    if (warning && typeof warning === "object") {
      return Object.entries(warning)
        .filter(([, value]) => typeof value === "string" || typeof value === "number")
        .map(([key, value]) => key === "type" ? String(value).replaceAll("_", " ") : `${formatLabel(key)}: ${value}`)
        .join(" · ");
    }
    return "";
  }

  function renderResumeWarnings(warningsElement, warnings, missingEvidence) {
    const items = [
      ...(Array.isArray(warnings) ? warnings.map(warningText).filter(Boolean) : []),
      ...missingEvidence,
    ];
    if (!items.length) {
      warningsElement.hidden = true;
      warningsElement.replaceChildren();
      return;
    }
    warningsElement.hidden = false;
    warningsElement.replaceChildren(make("h3", "", "Review warnings"));
    const list = make("ul");
    for (const item of items) list.append(make("li", "", item));
    warningsElement.append(list);
  }

  function renderAssembledResume(draft) {
    const review = document.querySelector("#resume-review");
    const container = document.querySelector("#assembled-resume");
    const warningsElement = document.querySelector("#resume-warnings");
    const status = document.querySelector("#resume-review-status");
    const resume = editingResume || draft?.resume;
    if (!resume) throw new Error("The resume service returned an incomplete draft.");

    container.replaceChildren();
    container.classList.toggle("resume-editing", Boolean(editingResume));
    const missingEvidence = [];
    const header = make("header", "resume-header");
    const headerColumns = make("div", "resume-header-columns");
    const headerLeft = make("div", "resume-header-left");
    headerLeft.append(editingResume
      ? editableField("h1", "resume-name", resume.header.name, "Name",
        (value) => { editingResume.header.name = value; })
      : make("h1", "", resume.header.name));
    const contact = make("div", "resume-contact");
    let contactIndex = 0;
    for (const item of resume.header.contact || []) {
      if (editingResume) {
        const index = contactIndex;
        contact.append(editableField("div", "resume-contact-item", item, `Contact information ${index + 1}`,
          (value) => { editingResume.header.contact[index] = value; }));
      } else {
        contact.append(make("div", "resume-contact-item", item));
      }
      contactIndex += 1;
    }
    headerLeft.append(contact);
    const headerRight = make("div", "resume-header-right");
    if (resume.header.title || editingResume) {
      headerRight.append(editingResume
        ? editableField("p", "resume-target-title", resume.header.title, "Target role title",
          (value) => {
            editingResume.header.title = value;
            editingResume.header.titleManuallyEdited = true;
          })
        : make("p", "resume-target-title", resume.header.title));
      if (resume.header.titleManuallyEdited) headerRight.append(manualContentNote("edited"));
    }
    const links = make("div", "resume-links");
    for (const [index, link] of (resume.header.links || []).entries()) {
      if (editingResume) {
        const row = make("div", "resume-link-editor");
        row.append(
          editableField("input", "", link.text, `Link ${index + 1} text`,
            (value) => { editingResume.header.links[index].text = value; }),
          editableField("input", "", link.href, `Link ${index + 1} destination`,
            (value) => { editingResume.header.links[index].href = value; }),
        );
        links.append(row);
      } else {
        const anchor = make("a", "", link.text);
        anchor.href = link.href;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        links.append(anchor);
      }
    }
    headerRight.append(links);
    headerColumns.append(headerLeft, headerRight);
    header.append(headerColumns, editableField("p", "resume-language-note", resume.languageNote, "Language note",
      (value) => { editingResume.languageNote = value; }));
    container.append(header);

    const summary = make("section", "resume-section");
    summary.append(make("h2", "", "Summary"));
    const summaryText = make("p", "resume-summary-text");
    if (editingResume) {
      summaryText.append(editableField("textarea", "", resume.summary.text, "Summary text",
        (value) => {
          editingResume.summary.text = value;
          editingResume.summary.manuallyEdited = true;
        }, true));
    } else {
      summaryText.append(document.createTextNode(resume.summary.text));
    }
    if (resume.summary.manuallyEdited) summaryText.append(manualContentNote("edited"));
    if (resume.summary.sourceRecordIds?.length) {
      summaryText.append(evidenceControl(resume.summary.sourceRecordIds, "summary"));
    } else {
      missingEvidence.push("Summary is missing supporting evidence.");
    }
    summary.append(summaryText, editingResume
      ? editableField("p", "resume-fixed-note", resume.summary.CUSMANote, "CUSMA note",
        (value) => { editingResume.summary.CUSMANote = value; })
      : make("p", "resume-fixed-note", resume.summary.CUSMANote));
    container.append(summary);

    const skills = make("section", "resume-section");
    skills.append(make("h2", "", "Skills and Languages"));
    let categoryIndex = 0;
    for (const category of resume.skillsAndLanguages.skillsCategories || []) {
      const currentCategoryIndex = categoryIndex;
      const group = make("p", "resume-skills-category");
      if (editingResume) {
        group.append(editableField("input", "resume-skill-category-name", category.name, "Skill category name",
          (value) => { editingResume.skillsAndLanguages.skillsCategories[currentCategoryIndex].name = value; }));
      } else {
        group.append(make("strong", "resume-skill-category-name", `${category.name}:`));
      }
      group.append(document.createTextNode(editingResume ? ": " : " "));
      const skillList = category.skills || [];
      for (const [index, skill] of skillList.entries()) {
        const skillItem = make("span", "resume-skill-item");
        skillItem.append(editableField("span", "", skill.name, `${category.name} skill ${index + 1}`,
          (value) => {
            const target = editingResume.skillsAndLanguages.skillsCategories[currentCategoryIndex].skills[index];
            target.name = value;
            if (Array.isArray(target.sourceRecordIds)) target.manuallyEdited = true;
          }));
        if (skill.manualAdded) skillItem.append(manualContentNote("added"));
        else if (skill.manuallyEdited) skillItem.append(manualContentNote("edited"));
        if (!skill.manualAdded && Array.isArray(skill.sourceRecordIds)) {
          skillItem.append(evidenceControl(skill.sourceRecordIds, `skill ${skill.name}`));
        }
        if (editingResume) {
          skillItem.append(editAction(`Remove ${category.name} skill ${index + 1}`, () => {
            editingResume.skillsAndLanguages.skillsCategories[currentCategoryIndex].skills.splice(index, 1);
            markResumeChanged();
            renderAssembledResume(currentResumeDraft);
          }, "button button-inline"));
        }
        group.append(skillItem);
        if (index < skillList.length - 1) group.append(document.createTextNode(", "));
      }
      skills.append(group);
      if (editingResume) {
        skills.append(editAction(`Add skill to ${category.name}`, () => {
          editingResume.skillsAndLanguages.skillsCategories[currentCategoryIndex].skills.push({
            name: "",
            manualAdded: true,
          });
          markResumeChanged();
          renderAssembledResume(currentResumeDraft);
        }, "button button-inline"));
      }
      categoryIndex += 1;
    }
    skills.append(editingResume
      ? editableField("p", "resume-fixed-note", resume.skillsAndLanguages.FMPNote, "FMP note",
        (value) => { editingResume.skillsAndLanguages.FMPNote = value; })
      : make("p", "resume-fixed-note", resume.skillsAndLanguages.FMPNote));
    container.append(skills);

    const experience = make("section", "resume-section");
    experience.append(make("h2", "", "Experience"));
    let entryIndex = 0;
    for (const entry of resume.experience || []) {
      const currentEntryIndex = entryIndex;
      const job = make("article", "resume-experience-entry");
      const companyRow = make("div", "resume-entry-row");
      companyRow.append(editingResume
        ? editableField("h3", "resume-company", entry.company, `Company ${currentEntryIndex + 1}`,
          (value) => { editingResume.experience[currentEntryIndex].company = value; })
        : make("h3", "resume-company", entry.company));
      companyRow.append(editingResume
        ? editableField("span", "resume-location", entry.location, `Location ${currentEntryIndex + 1}`,
          (value) => { editingResume.experience[currentEntryIndex].location = value; })
        : make("span", "resume-location", entry.location));
      const titleRow = make("div", "resume-entry-row resume-title-row");
      titleRow.append(editingResume
        ? editableField("p", "resume-job-title", entry.title, `Job title ${currentEntryIndex + 1}`,
          (value) => { editingResume.experience[currentEntryIndex].title = value; })
        : make("p", "resume-job-title", entry.title));
      titleRow.append(editingResume
        ? editableField("span", "resume-job-dates", entry.dates, `Employment dates ${currentEntryIndex + 1}`,
          (value) => { editingResume.experience[currentEntryIndex].dates = value; })
        : make("span", "resume-job-dates", entry.dates));
      const bullets = make("ul", "resume-bullets");
      for (const [bulletIndex, bullet] of (entry.bullets || []).entries()) {
        const item = make("li");
        if (editingResume) {
          item.append(editableField("textarea", "", bullet.text, `Accomplishment ${bulletIndex + 1} for ${entry.company}`,
            (value) => {
              const target = editingResume.experience[currentEntryIndex].bullets[bulletIndex];
              target.text = value;
              if (Array.isArray(target.sourceRecordIds)) target.manuallyEdited = true;
            }, true));
        } else {
          item.append(document.createTextNode(bullet.text));
        }
        if (bullet.manualAdded) item.append(manualContentNote("added"));
        else if (bullet.manuallyEdited) item.append(manualContentNote("edited"));
        if (!bullet.manualAdded && Array.isArray(bullet.sourceRecordIds) && bullet.sourceRecordIds.length) {
          item.append(evidenceControl(bullet.sourceRecordIds, bullet.text));
        } else if (!bullet.manualAdded) {
          missingEvidence.push(`Experience bullet is missing supporting evidence: ${bullet.text}`);
        }
        if (editingResume) {
          item.append(editAction(`Remove accomplishment ${bulletIndex + 1}`, () => {
            editingResume.experience[currentEntryIndex].bullets.splice(bulletIndex, 1);
            markResumeChanged();
            renderAssembledResume(currentResumeDraft);
          }, "button button-inline"));
        }
        bullets.append(item);
      }
      job.append(companyRow, titleRow, bullets);
      if (editingResume) {
        job.append(editAction("Add accomplishment", () => {
          editingResume.experience[currentEntryIndex].bullets.push({ text: "", manualAdded: true });
          markResumeChanged();
          renderAssembledResume(currentResumeDraft);
        }, "button button-inline"));
      }
      experience.append(job);
      entryIndex += 1;
    }
    container.append(experience);

    const education = make("section", "resume-section");
    education.append(make("h2", "", "Education"));
    const educationLine = make("p", "resume-education-line");
    if (editingResume) {
      educationLine.append(
        editableField("input", "resume-education-field", resume.education.school, "School",
          (value) => { editingResume.education.school = value; }),
        document.createTextNode(" - "),
        editableField("input", "resume-education-field", resume.education.degree, "Degree",
          (value) => { editingResume.education.degree = value; }),
        document.createTextNode(" "),
        editableField("input", "resume-education-field", resume.education.details, "Education details",
          (value) => { editingResume.education.details = value; }),
      );
    } else {
      educationLine.append(
        make("strong", "", resume.education.school),
        document.createTextNode(` - ${resume.education.degree} ${resume.education.details}`)
      );
    }
    education.append(educationLine);
    container.append(education);

    const unresolvedNodes = container.querySelectorAll(".evidence-missing");
    for (const node of unresolvedNodes) {
      missingEvidence.push(`Missing evidence for ${node.dataset.label}: ${node.textContent.replace("Missing evidence record: ", "")}`);
    }
    renderResumeWarnings(warningsElement, draft.warnings, [...new Set(missingEvidence)]);
    status.textContent = editingResume ? "Editing" : "Loaded";
    status.className = `status ${editingResume ? "status-warning" : "status-ok"}`;
    renderResumeEditControls();
    review.hidden = false;
  }

  function displayResumeDraft(draft, queryName, queryValue) {
    if (!draft || typeof draft.draftId !== "string" || !draft.resume || !Number.isSafeInteger(draft.version)) {
      throw new Error("The resume service returned an incomplete draft.");
    }
    currentResumeDraft = draft;
    editingResume = null;
    hasUnsavedResumeEdits = false;
    if (currentAnalysis?.jobId !== draft.jobId) currentAnalysis = null;
    const review = document.querySelector("#resume-review");
    const container = document.querySelector("#assembled-resume");
    const error = document.querySelector("#resume-review-error");
    const status = document.querySelector("#resume-review-status");
    review.hidden = false;
    error.hidden = true;
    document.querySelector("#resume-save-status").textContent = "";
    document.querySelector("#resume-save-status").className = "";
    document.querySelector("#resume-review-context").textContent =
      `${currentAnalysis ? `${currentAnalysis.company} · ${currentAnalysis.roleTitle} · ` : ""}Draft ${draft.draftId} · Job ${draft.jobId} · Inventory revision ${draft.inventoryRevision} · Created ${draft.createdAt}`;
    savedDraftId.value = draft.draftId;
    try {
      renderAssembledResume(draft);
      const url = new URL(window.location.href);
      url.searchParams.delete("resumeJobId");
      url.searchParams.delete("resumeDraftId");
      url.searchParams.set(queryName, queryValue);
      window.history.replaceState(null, "", url);
      review.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (renderError) {
      status.textContent = "Unavailable";
      status.className = "status status-error";
      error.textContent = renderError instanceof Error ? renderError.message : "The assembled resume could not be loaded.";
      error.hidden = false;
    }
  }

  async function loadResumeDraft(draftId) {
    const review = document.querySelector("#resume-review");
    const container = document.querySelector("#assembled-resume");
    const error = document.querySelector("#resume-review-error");
    const status = document.querySelector("#resume-review-status");
    review.hidden = false;
    container.replaceChildren();
    error.hidden = true;
    status.textContent = "Loading saved draft…";
    status.className = "status status-loading";
    currentResumeDraft = null;
    editingResume = null;
    hasUnsavedResumeEdits = false;
    renderResumeEditControls();
    try {
      const draft = await requestJson(`${apiBaseUrl}/resume-drafts/${encodeURIComponent(draftId)}`);
      displayResumeDraft(draft, "resumeDraftId", draftId);
    } catch (loadError) {
      status.textContent = "Unavailable";
      status.className = "status status-error";
      error.textContent = loadError instanceof Error ? loadError.message : "The saved resume draft could not be loaded.";
      error.hidden = false;
      renderResumeEditControls();
    }
  }

  async function loadResumeReview(jobId) {
    resumeReviewJobId = jobId;
    const review = document.querySelector("#resume-review");
    const container = document.querySelector("#assembled-resume");
    const error = document.querySelector("#resume-review-error");
    const status = document.querySelector("#resume-review-status");
    review.hidden = false;
    container.replaceChildren();
    error.hidden = true;
    status.textContent = "Loading resume…";
    status.className = "status status-loading";
    currentResumeDraft = null;
    editingResume = null;
    hasUnsavedResumeEdits = false;
    renderResumeEditControls();
    document.querySelector("#resume-back-link").href = "#analysis-results";
    try {
      const draft = await requestJson(`${apiBaseUrl}/jobs/${encodeURIComponent(jobId)}/resume`);
      displayResumeDraft(draft, "resumeJobId", jobId);
    } catch (loadError) {
      status.textContent = "Unavailable";
      status.className = "status status-error";
      error.textContent = loadError instanceof Error ? loadError.message : "The assembled resume could not be loaded.";
      error.hidden = false;
      renderResumeEditControls();
    }
  }

  function startResumeEditing() {
    if (!currentResumeDraft || editingResume) return;
    editingResume = cloneJson(currentResumeDraft.resume);
    const languageCategory = editingResume.skillsAndLanguages.skillsCategories
      .find((category) => category.categoryRole === "languages" || category.name === "Languages");
    if (languageCategory) {
      languageCategory.categoryRole = "languages";
      for (const skill of languageCategory.skills) {
        if (!skill.manualAdded) skill.contentOrigin = "fixed";
      }
    }
    hasUnsavedResumeEdits = false;
    document.querySelector("#resume-save-status").textContent = "";
    document.querySelector("#resume-save-status").className = "";
    renderAssembledResume(currentResumeDraft);
  }

  function cancelResumeEditing() {
    if (!editingResume) return;
    editingResume = null;
    hasUnsavedResumeEdits = false;
    renderAssembledResume(currentResumeDraft);
    const status = document.querySelector("#resume-save-status");
    status.textContent = "Unsaved changes discarded.";
    status.className = "status status-ok";
  }

  async function saveResumeDraft() {
    if (!currentResumeDraft || !editingResume || !hasUnsavedResumeEdits) return;
    const saveButton = document.querySelector("#resume-save-button");
    const saveStatus = document.querySelector("#resume-save-status");
    isSavingResume = true;
    saveButton.disabled = true;
    document.querySelector("#resume-cancel-button").disabled = true;
    document.querySelectorAll("#assembled-resume .resume-edit-control, #assembled-resume .button-inline")
      .forEach((control) => { control.disabled = true; });
    saveStatus.textContent = "Saving…";
    saveStatus.className = "status status-loading";
    try {
      const saved = await requestJson(`${apiBaseUrl}/resume-drafts/${encodeURIComponent(currentResumeDraft.draftId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: editingResume, version: currentResumeDraft.version }),
      });
      currentResumeDraft = saved;
      editingResume = null;
      hasUnsavedResumeEdits = false;
      isSavingResume = false;
      renderAssembledResume(currentResumeDraft);
      saveStatus.textContent = "Draft saved successfully.";
      saveStatus.className = "status status-ok";
    } catch (saveError) {
      saveStatus.textContent = saveError instanceof Error ? saveError.message : "The draft could not be saved.";
      saveStatus.className = "status status-error";
      isSavingResume = false;
      document.querySelectorAll("#assembled-resume .resume-edit-control, #assembled-resume .button-inline")
        .forEach((control) => { control.disabled = false; });
      saveButton.disabled = false;
      document.querySelector("#resume-cancel-button").disabled = false;
    }
  }

  async function generateAndReviewResume(jobId) {
    const button = document.querySelector("#generate-resume-button");
    if (!button || button.disabled) return;
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = "Generating resume…";
    try {
      if (!confirmDiscardResumeChanges()) return;
      const draft = await requestJson(`${apiBaseUrl}/jobs/${encodeURIComponent(jobId)}/generated-content`, { method: "POST" });
      displayResumeDraft(draft, "resumeDraftId", draft.draftId);
    } catch (generationError) {
      document.querySelector("#analysis-error").textContent =
        generationError instanceof Error ? generationError.message : "The resume could not be generated.";
      document.querySelector("#analysis-error").hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = previous;
    }
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
    const reviewButton = make("button", "button button-primary", "Generate and review resume");
    reviewButton.type = "button";
    reviewButton.id = "generate-resume-button";
    heading.append(reviewButton);

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
    if (!confirmDiscardResumeChanges()) return;
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
    if (!confirmDiscardResumeChanges()) return;
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

  async function openSavedDraft(event, draftIdOverride) {
    event?.preventDefault();
    if (openDraftButton.disabled || !confirmDiscardResumeChanges()) return;
    const draftId = (draftIdOverride || savedDraftId.value).trim();
    if (!draftId) {
      showAnalysisError("Enter a saved resume draft ID to reopen a draft.");
      savedDraftId.focus();
      return;
    }
    openDraftButton.disabled = true;
    try {
      await loadResumeDraft(draftId);
    } finally {
      openDraftButton.disabled = false;
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
      if (currentResumeDraft) renderAssembledResume(currentResumeDraft);
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
  openDraftForm.addEventListener("submit", openSavedDraft);
  document.querySelector("#resume-edit-button").addEventListener("click", startResumeEditing);
  document.querySelector("#resume-save-button").addEventListener("click", saveResumeDraft);
  document.querySelector("#resume-cancel-button").addEventListener("click", cancelResumeEditing);
  document.querySelector("#resume-back-link").addEventListener("click", (event) => {
    if (!confirmDiscardResumeChanges()) event.preventDefault();
  });
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedResumeEdits) return;
    event.preventDefault();
    event.returnValue = "";
  });
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
  analysisResults.addEventListener("click", (event) => {
  if (event.target.closest("#generate-resume-button") && currentAnalysis) {
    generateAndReviewResume(currentAnalysis.jobId);
  }
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
  const initialUrl = new URLSearchParams(window.location.search);
  const resumeDraftIdFromUrl = initialUrl.get("resumeDraftId");
  const resumeJobIdFromUrl = initialUrl.get("resumeJobId");
  const savedJobIdFromUrl = initialUrl.get("jobId");
  if (resumeDraftIdFromUrl) {
    savedDraftId.value = resumeDraftIdFromUrl;
    openSavedDraft(null, resumeDraftIdFromUrl);
  } else if (resumeJobIdFromUrl) {
    savedJobId.value = resumeJobIdFromUrl;
    openSavedAnalysis(null, resumeJobIdFromUrl).finally(() => loadResumeReview(resumeJobIdFromUrl));
  } else if (savedJobIdFromUrl) {
    savedJobId.value = savedJobIdFromUrl;
    openSavedAnalysis(null, savedJobIdFromUrl);
  }
})();
