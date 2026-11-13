import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../../public/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../../public/styles.css", import.meta.url), "utf8");

test("resume preview and print use Letter pages, matching margins, and compact Arial-compatible typography", () => {
  assert.match(styles, /width:\s*8\.5in/);
  assert.match(styles, /height:\s*11in/);
  assert.match(styles, /padding:\s*\.6in/);
  assert.match(styles, /height:\s*9\.8in/);
  assert.match(styles, /@page\s*\{\s*size:\s*letter portrait;\s*margin:\s*0;/);
  assert.match(styles, /font-family:\s*Arial,\s*"Liberation Sans",\s*sans-serif/);
  assert.match(styles, /--resume-font-size:\s*9pt/);
  assert.match(styles, /font:\s*700\s+18pt\/1\.05\s+Arial/);
  assert.match(styles, /font-size:\s*10\.5pt/);
  assert.match(styles, /break-after:\s*page/);
});

test("header keeps contact and clickable links in opposing columns", () => {
  assert.match(app, /make\("div",\s*"resume-header-columns"\)/);
  assert.match(app, /for \(const item of resume\.header\.contact \|\| \[\]\)/);
  assert.match(app, /make\("div",\s*"resume-contact-item"\)/);
  assert.match(app, /link\.href = `mailto:\$\{email\[0\]\}`/);
  assert.match(app, /make\("p",\s*"resume-target-title",\s*resume\.header\.title\)/);
  assert.match(app, /anchor\.href = link\.href/);
  assert.match(styles, /\.resume-header-right\s*\{\s*text-align:\s*right/);
  assert.match(styles, /\.resume-target-title\s*\{[^}]*text-transform:\s*uppercase/s);
  assert.match(styles, /\.resume-language-note\s*\{[^}]*text-align:\s*center/s);
});

test("section labels and summary notes use the required hierarchy", () => {
  assert.deepEqual(
    [...app.matchAll(/make\("h2",\s*"",\s*"([^"]+)"\)/g)].map((match) => match[1]),
    ["Summary", "Skills and Languages", "Experience", "Education"],
  );
  assert.match(styles, /\.resume-section h2\s*\{[^}]*text-align:\s*center[^}]*text-transform:\s*uppercase/s);
  assert.match(app, /document\.createTextNode\(resume\.summary\.text\)/);
  assert.match(app, /make\("p",\s*"resume-fixed-note",\s*resume\.summary\.CUSMANote\)/);
  assert.match(styles, /\.resume-fixed-note\s*\{[^}]*font-weight:\s*700/);
});

test("skills stay in ordered comma-separated category paragraphs with Languages and FMP note", () => {
  assert.match(app, /for \(const category of resume\.skillsAndLanguages\.skillsCategories \|\| \[\]\)/);
  assert.match(app, /make\("p",\s*"resume-skills-category"\)/);
  assert.match(app, /make\("strong",\s*"resume-skill-category-name",\s*`\$\{category\.name\}:`\)/);
  assert.match(app, /group\.append\(document\.createTextNode\(", "\)\)/);
  assert.match(app, /skillItem\.append\(evidenceControl\(skill\.sourceRecordIds, `skill \$\{skill\.name\}`\)\)/);
  assert.match(app, /make\("p",\s*"resume-fixed-note",\s*resume\.skillsAndLanguages\.FMPNote\)/);
  assert.match(styles, /\.resume-skills-category\s*\{[^}]*margin:\s*0 0 3pt/);
});

test("experience and education are rendered from assembled content in compact rows", () => {
  assert.match(app, /for \(const entry of resume\.experience \|\| \[\]\)/);
  assert.match(app, /make\("h3",\s*"resume-company",\s*entry\.company\)/);
  assert.match(app, /make\("span",\s*"resume-location",\s*entry\.location\)/);
  assert.match(app, /make\("p",\s*"resume-job-title",\s*entry\.title\)/);
  assert.match(app, /make\("span",\s*"resume-job-dates",\s*entry\.dates\)/);
  assert.match(app, /document\.createTextNode\(bullet\.text\)/);
  assert.match(app, /make\("strong",\s*"",\s*resume\.education\.school\)/);
  assert.match(app, /resume\.education\.degree\} \$\{resume\.education\.details/);
  assert.match(styles, /\.resume-entry-row\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.resume-job-title\s*\{[^}]*font-style:\s*italic/);
  assert.match(styles, /\.resume-bullets\s*\{[^}]*padding-left:\s*1\.25em/);
  assert.match(styles, /\.resume-location,\s*\.resume-job-dates\s*\{[^}]*text-align:\s*right/);
});

test("evidence controls and review warnings remain connected to generated content", () => {
  assert.match(app, /evidenceControl\(resume\.summary\.sourceRecordIds,\s*"summary"\)/);
  assert.match(app, /evidenceControl\(bullet\.sourceRecordIds,\s*bullet\.text\)/);
  assert.match(app, /renderResumeWarnings\(warningsElement,\s*draft\.warnings/);
  assert.match(app, /Missing evidence record:/);
});

test("saved drafts can be reopened and edited without replacing the styled review", () => {
  assert.match(app, /\/resume-drafts\/\$\{encodeURIComponent\(draftId\)\}/);
  assert.match(app, /method:\s*"PUT"/);
  assert.match(app, /JSON\.stringify\(\{ resume: editingResume, version: currentResumeDraft\.version \}\)/);
  assert.match(app, /resumeDraftId/);
  assert.match(app, /beforeunload/);
  assert.match(app, /confirmDiscardResumeChanges/);
  assert.match(app, /manuallyEdited/);
  assert.match(app, /manualAdded/);
  assert.match(app, /classList\.toggle\("resume-editing"/);
  assert.match(app, /paginateResume\(document\.querySelector\("#assembled-resume"\)\)/);
  assert.match(app, /Page \$\{index \+ 1\} of \$\{pageNodes\.length\}/);
});

test("pagination does not detach a focused editor and flushes after editing focus leaves", () => {
  assert.match(app, /function hasFocusedResumeEditor\(container\)/);
  assert.match(app, /resumePaginationPending\s*=\s*true/);
  assert.match(app, /function measureResumePagination\(container\)[\s\S]*container\.cloneNode\(true\)/);
  assert.match(app, /if \(hasFocusedResumeEditor\(container\)\) \{[\s\S]*scheduleResumePaginationMeasurement\(container\)/);
  assert.match(app, /if \(resumePaginationPending && hasFocusedResumeEditor\(container\)\) \{\s*measureResumePagination\(container\)/);
  assert.match(app, /resumePaginationPending\s*&&\s*!hasFocusedResumeEditor\(container\)/);
  assert.match(app, /paginateResume\(container\)/);
});

test("inventory refresh updates resume evidence without rebuilding an active editor", () => {
  assert.match(app, /if \(editingResume\) refreshResumeEvidenceDisplays\(\);\s*else renderAssembledResume\(currentResumeDraft\)/);
  assert.match(app, /function refreshResumeEvidenceDisplays\(\)[\s\S]*renderEvidenceControl/);
  assert.match(app, /wrapper\.dataset\.recordIds = JSON\.stringify\(ids\)/);
});

test("saved-only PDF export excludes review UI and preserves the draft filename privacy", () => {
  assert.match(app, /if \(!currentResumeDraft \|\| editingResume \|\| hasUnsavedResumeEdits \|\| isSavingResume\) return/);
  assert.match(app, /document\.title = `resume-draft-\$\{safeDraftId\}`/);
  assert.match(app, /window\.print\(\)/);
  assert.match(app, /Choose Save as PDF in the browser print dialog/);
  assert.match(styles, /\.resume-review-heading,[^}]*#resume-review-error\s*\{\s*display:\s*none !important/s);
  assert.match(styles, /\.resume-evidence,\s*\.resume-manual-note,\s*\.button-inline/);
});

test("editing covers fixed and generated text fields and keeps add/remove controls draft-local", () => {
  for (const field of [
    "editingResume.header.name",
    "editingResume.header.contact[index]",
    "editingResume.header.links[index].text",
    "editingResume.header.links[index].href",
    "editingResume.header.title",
    "editingResume.languageNote",
    "editingResume.summary.text",
    "editingResume.summary.CUSMANote",
    "editingResume.skillsAndLanguages.skillsCategories",
    "editingResume.skillsAndLanguages.FMPNote",
    "editingResume.experience[currentEntryIndex].company",
    "editingResume.experience[currentEntryIndex].location",
    "editingResume.experience[currentEntryIndex].title",
    "editingResume.experience[currentEntryIndex].dates",
    "editingResume.experience[currentEntryIndex].bullets",
    "editingResume.education.school",
    "editingResume.education.degree",
    "editingResume.education.details",
  ]) {
    assert.ok(app.includes(field), `expected an editing control for ${field}`);
  }
  assert.match(app, /editingResume\.skillsAndLanguages\.skillsCategories\[currentCategoryIndex\]\.skills\.push/);
  assert.match(app, /editingResume\.experience\[currentEntryIndex\]\.bullets\.push/);
  assert.match(app, /function cancelResumeEditing/);
  assert.match(app, /function saveResumeDraft/);
});
