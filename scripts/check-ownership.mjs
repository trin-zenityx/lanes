#!/usr/bin/env node
// Ownership gate for auto-merge (Gate 2 of the CHARTER standing order).
// Usage: node scripts/team/check-ownership.mjs <branch-name> <diff-file>
//   <diff-file> = output of `git diff --name-status origin/main...HEAD`
// Exit 0 = in-scope, safe to auto-merge. Exit 1 = needs coordinator (reason on stdout).
import { readFileSync } from 'node:fs';

const [branch, diffFile] = process.argv.slice(2);
const map = JSON.parse(readFileSync(new URL('../../docs/team/ownership.json', import.meta.url), 'utf8'));

const m = branch.match(/^parallel\/([a-z]+)-/);
if (!m) fail(`branch "${branch}" ไม่ตรงรูปแบบ parallel/<domain>-<task>`);
const domain = m[1];
const allowed = map.domains[domain];
if (allowed === undefined) fail(`ไม่รู้จักแผนก "${domain}" ใน ownership.json`);
if (allowed.length === 0) fail(`แผนก "${domain}" เป็นงานตัดขวาง (allowlist ว่าง) — ต้องให้ coordinator merge เอง`);

const denied = map.domainDenied?.[domain] ?? [];
const lines = readFileSync(diffFile, 'utf8').trim().split('\n').filter(Boolean);
const problems = [];

for (const line of lines) {
  const [status, ...rest] = line.split('\t');
  const path = rest[rest.length - 1]; // handles renames (R100 old new)
  if (status.startsWith('D')) { problems.push(`ลบไฟล์: ${path} (การลบไฟล์ต้องผ่าน coordinator เสมอ)`); continue; }
  if (map.alwaysAllowed.some((p) => path.includes(p))) continue;
  // exact-file grant in the domain allowlist beats a prefix lock (e.g. students
  // owns src/hooks/useTeamMembers.ts even though src/hooks/ is coordinatorLocked)
  if (allowed.some((p) => path === p)) continue;
  if (map.coordinatorLocked.some((p) => path.startsWith(p) || path === p)) { problems.push(`ไฟล์กลาง: ${path}`); continue; }
  if (denied.some((p) => path.startsWith(p))) { problems.push(`นอกเขต (denied): ${path}`); continue; }
  if (!allowed.some((p) => path.startsWith(p) || path === p)) { problems.push(`นอกเขตแผนก ${domain}: ${path}`); }
}

if (problems.length) fail(`พบ ${problems.length} จุดที่ต้องให้ coordinator ตัดสิน:\n- ` + problems.join('\n- '));
console.log(`ownership OK — ทุกไฟล์อยู่ในเขตแผนก "${domain}" (${lines.length} ไฟล์)`);

function fail(msg) { console.log(`NEEDS_COORDINATOR: ${msg}`); process.exit(1); }
