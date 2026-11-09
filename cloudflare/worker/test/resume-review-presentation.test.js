import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../../public/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../../public/styles.css", import.meta.url), "utf8");

test("resume page uses Letter proportions and compact Arial-compatible typography", () => {
  assert.match(styles, /width:\s*min\(100%,\s*8\.5in\)/);
  assert.match(styles, /aspect-ratio:\s*8\.5\s*\/\s*11/);
  assert.match(styles, /padding:\s*\.6in\s+7%/);
  assert.match(styles, /font-family:\s*Arial,\s*"Liberation Sans",\s*sans-serif/);
  assert.match(styles, /--resume-font-size:\s*9pt/);
  assert.match(styles, /font:\s*700\s+18pt\/1\.05\s+Arial/);
  assert.match(styles, /font-size:\s*10\.5pt/);
});

test("header keeps contact and clickable links in opposing columns", () => {
  assert.match(app, /make\("div",\s*"resume-header-columns"\)/);
  assert.match(app, /for \(const item of resume\.header\.contact \|\| \[\]\)/);
  assert.match(app, /make\("div",\s*"resume-contact-item",\s*item\)/);
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
