(() => {
  "use strict";

  const apiUrl = window.CAREER_INVENTORY_API_URL || "/api/inventory";
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
  let inventory = null;
  let records = [];
  let recordById = new Map();
  let selectedKey = null;

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
      const response = await fetch(apiUrl, { credentials: "include", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.loaded !== true || !payload.inventory) {
        throw new Error(payload.error || `Inventory API returned HTTP ${response.status}.`);
      }
      inventory = payload.inventory;
      records = collectRecords(inventory);
      recordById = new Map(records.filter((item) => item.record.id).map((item) => [item.id, item]));
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
})();
