"use strict";

const { classify } = require("../src/allowlist.js");
const { normalizeUrl, initialsOf } = require("../src/boards.js");

const CASES = [
  ["https://github.com/orgs/acme/projects/12", "board"],
  ["https://github.com/orgs/acme/projects/12/views/1?filterQuery=is%3Aopen", "board"],
  ["https://github.com/orgs/acme/projects/12/views/1?pane=issue&itemId=42", "board"],
  ["https://github.com/orgs/acme/projects/12/insights", "board"],
  ["https://github.com/orgs/acme/projects/", "board"],
  ["https://github.com/users/octocat/projects/3", "board"],
  ["https://github.com/login?return_to=%2Forgs%2Facme%2Fprojects%2F12", "auth"],
  ["https://github.com/sessions/two-factor", "auth"],
  ["https://github.com/orgs/acme/sso", "auth"],
  ["https://github.com/", "blocked"],
  ["https://github.com/acme/repo/issues/1", "blocked"],
  ["https://github.com/acme/repo/pull/1", "blocked"],
  ["https://github.com/settings/profile", "blocked"],
  ["https://github.com/notifications", "blocked"],
  ["https://evil.com/orgs/acme/projects/12", "blocked"],
  ["https://github.com.evil.com/orgs/acme/projects/12", "blocked"],
  ["http://github.com/orgs/acme/projects/12", "blocked"],
  ["file:///etc/passwd", "blocked"],
  ["javascript:alert(1)", "blocked"],
];

let failures = 0;
for (const [url, expected] of CASES) {
  const actual = classify(url);
  if (actual === expected) {
    console.log(`  ok   ${expected.padEnd(8)} ${url}`);
  } else {
    failures++;
    console.log(`  FAIL ${url} -> ${actual} (attendu ${expected})`);
  }
}

const extras = [
  ["normalizeUrl ajoute le schéma", normalizeUrl("github.com/orgs/acme/projects/12"), "https://github.com/orgs/acme/projects/12"],
  ["normalizeUrl refuse une issue", normalizeUrl("https://github.com/acme/repo/issues/1"), null],
  ["normalizeUrl refuse le vide", normalizeUrl("   "), null],
  ["initiales sur deux mots", initialsOf("Release blockers"), "RB"],
  ["initiales sur un mot", initialsOf("roadmap"), "RO"],
];

for (const [label, actual, expected] of extras) {
  if (actual === expected) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label} -> ${JSON.stringify(actual)} (attendu ${JSON.stringify(expected)})`);
  }
}

const total = CASES.length + extras.length;
console.log(failures ? `\n${failures} échec(s) sur ${total}` : `\n${total}/${total} OK`);
process.exit(failures ? 1 : 0);
