#!/usr/bin/env node
// สร้าง/ตรวจ "ไฟล์บรีฟรายเขต" — docs/team/zones/<แผนก>.md
//
// Usage:
//   node scripts/team/gen-zone-brief.mjs          สร้าง/อัปเดตทุกเขต
//   node scripts/team/gen-zone-brief.mjs --check  ตรวจอย่างเดียว (exit 1 ถ้าไม่ตรง)
//
// ── ทำไมต้องเป็นตัวสร้าง ไม่ใช่ไฟล์พิมพ์มือ ─────────────────────────────────
// ไฟล์บรีฟที่ผิด **แย่กว่าไม่มีไฟล์บรีฟ** — คนอ่านจะเชื่อมันแล้วไม่ไปตรวจของจริง
// ⇒ ส่วนที่ derive ได้ (เขตไฟล์ · สิทธิ์รายไฟล์ · งวดล่าสุด · ไฟล์ที่แตะบ่อย)
//   **สร้างจากของจริงทุกครั้ง** (`ownership.json` + `git log`)
// ⇒ ส่วนที่ derive ไม่ได้ (กับดักของเขต) เขียนมือ และ **ตัวสร้างห้ามแตะ**
//
// 🔒 บล็อกที่เขียนมืออยู่ระหว่าง MANUAL:START / MANUAL:END — ตัวสร้างคัดลอกของเดิมมาเสมอ
// 🔒 ทุกคำสั่ง git ส่ง argument เป็น array (`execFileSync`) **ไม่ผ่าน shell**
//    — ชื่อแผนก/พาธมาจากไฟล์ config ถ้าประกอบเป็นสตริงจะกลายเป็นช่องทาง command injection
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ⚠️ `.pathname` คืนพาธที่ถูก percent-encode — พาธที่มีช่องว่างจะกลายเป็น `%20` แล้วเปิดไฟล์ไม่เจอ
//    (เจอจริงกับโฟลเดอร์โปรเจกต์ที่ชื่อมีเว้นวรรค) ⇒ ต้องผ่าน `fileURLToPath` เสมอ
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ZONES = join(ROOT, 'docs/team/zones');
const map = JSON.parse(readFileSync(join(ROOT, 'docs/team/ownership.json'), 'utf8'));
const checkOnly = process.argv.includes('--check');

const A0 = '<!-- AUTO:START — สร้างด้วย scripts/team/gen-zone-brief.mjs ห้ามแก้มือ -->';
const A1 = '<!-- AUTO:END -->';
const M0 = '<!-- MANUAL:START — เขียนมือได้ ตัวสร้างไม่แตะ -->';
const M1 = '<!-- MANUAL:END -->';

const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ทุกหัวข้อ commit ในรีโป — ดึงครั้งเดียวแล้วใช้ซ้ำทุกเขต */
const ALL_SUBJECTS = git(['log', '--format=%s', '--all']).split('\n').filter(Boolean);

/** บทเรียนไฟล์ไหนเกี่ยวกับเขตนี้ — วัดจากจำนวนครั้งที่ path ของเขตถูกอ้างถึงจริง */
function lessonsFor(prefixes) {
  const dir = join(ROOT, 'docs/team/lessons');
  // 🩸 รีโปที่เพิ่งติดตั้ง LANES **ยังไม่มีโฟลเดอร์นี้** (บทเรียนสะสมทีหลัง)
  //    ตัวสร้างรุ่นแรกพังตรงนี้ตอนติดตั้งครั้งแรกพอดี — เจอตอนทดสอบในรีโปเปล่า
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const body = readFileSync(join(dir, f), 'utf8');
    let hits = 0;
    for (const p of prefixes) {
      // นับทั้ง path เต็มและชื่อโฟลเดอร์ท้าย (เอกสารมักอ้างแบบสั้น)
      const tail = p.replace(/\/$/, '').split('/').pop();
      hits += (body.match(new RegExp(esc(p), 'g')) || []).length;
      if (tail && tail.length > 3) hits += (body.match(new RegExp('\\b' + esc(tail) + '\\b', 'g')) || []).length;
    }
    out.push({ f, hits, kb: Math.round(body.length / 1000) });
  }
  return out.sort((a, b) => b.hits - a.hits);
}

function autoBlock(dom, prefixes) {
  const denied = map.domainDenied?.[dom] ?? [];
  const locked = map.coordinatorLocked ?? [];
  // สิทธิ์รายไฟล์ = ไฟล์ที่อยู่ใน allowlist ของเขต แต่ตกอยู่ใต้ prefix ที่ถูกล็อกไว้
  const grants = prefixes.filter((p) => !p.endsWith('/') && locked.some((L) => p.startsWith(L)));
  const zoneDirs = prefixes.filter((p) => p.endsWith('/'));
  const zoneFiles = prefixes.filter((p) => !p.endsWith('/') && !grants.includes(p));

  const donePrefix = `done(${dom}-`;
  const doneAll = ALL_SUBJECTS.filter((s) => s.startsWith(donePrefix));

  // ไฟล์ที่ถูกแก้บ่อย — นับใน JS ไม่ใช่ผ่าน `| sort | uniq -c` ใน shell
  const touched = git(['log', '--name-only', '--format=', '--all', '--', ...prefixes])
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const freq = new Map();
  for (const f of touched) freq.set(f, (freq.get(f) ?? 0) + 1);
  const hot = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => `${n}× ${f}`);

  // 🩸 ตัวจับคู่นี้รู้จักแค่ *path* ⇒ **under-detect** — เขต schedule ได้ 0 ทุกไฟล์
  //    ทั้งที่ grep คำเปล่า ("เช็คอิน") เจอใน data-safety.md 2 ครั้ง
  //    กติกาทีม: "false negative แพงกว่า false positive เสมอ"
  //    ⇒ ถ้าจัดอันดับไม่ได้เลย **ให้ลิสต์ทุกไฟล์** อย่าบอกว่า "ไม่ต้องอ่านอะไร"
  const ranked = lessonsFor(prefixes);
  const matched = ranked.filter((l) => l.hits > 0);
  const les = matched.length ? matched.slice(0, 2) : ranked;
  const ranking = matched.length > 0;

  return [
    A0,
    '',
    `**งวดที่เขตนี้ปิดไปแล้ว:** ${doneAll.length} งวด`,
    '',
    '### เขตไฟล์ (แตะได้เฉพาะในนี้)',
    '```',
    ...zoneDirs,
    ...zoneFiles,
    '```',
    ...(grants.length
      ? ['### 🔓 ไฟล์กลางที่เขตนี้ได้สิทธิ์ **รายไฟล์** (สิทธิ์รายไฟล์ชนะการล็อกทั้งโฟลเดอร์)', '```', ...grants, '```']
      : []),
    ...(denied.length ? ['### 🚫 ห้ามแตะ แม้อยู่ใต้เขต', '```', ...denied, '```'] : []),
    ...(hot.length ? ['', '### ไฟล์ที่ถูกแก้บ่อยที่สุดในเขตนี้', '```', ...hot, '```'] : []),
    '',
    ranking
      ? '### 📚 อ่านบทเรียนแค่ไฟล์นี้พอ (คัดจากจำนวนครั้งที่เขตนี้ถูกอ้างถึงจริง)'
      : '### 📚 บทเรียน — ⚠️ **จัดอันดับให้ไม่ได้** (ไม่มีไฟล์ไหนอ้างถึง path ของเขตนี้เลย)',
    ...les.map((l) => `- \`docs/team/lessons/${l.f}\`${l.hits ? ` — อ้างถึงเขตนี้ ${l.hits} ครั้ง` : ''} · ~${l.kb}k ตัวอักษร`),
    '',
    ranking
      ? `> 🔑 **อ่านเฉพาะที่อยู่ในรายการนี้** — บทเรียนทั้งหมดรวมกัน ~${LESSON_TOTAL_KB}k ตัวอักษร\n> การไล่อ่านทุกไฟล์คือค่าตั้งต้นที่ไฟล์นี้มีไว้ตัดทิ้ง`
      : '> ⚠️ **ตัวจัดอันดับรู้จักแค่ชื่อ path** ⇒ เขตที่บทเรียนพูดถึงด้วยคำไทย (เช่น "เช็คอิน") จะได้ 0\n> ที่นี่จึงลิสต์ทุกไฟล์ไว้ **โดยตั้งใจ** — เลือกอ่านตามหัวข้องานที่ทำ ไม่ใช่อ่านหมด',
    ...(doneAll.length
      ? ['', '### 5 งวดล่าสุดของเขตนี้', ...doneAll.slice(0, 5).map((r) => `- \`${r.slice(0, 100)}\``)]
      : []),
    '',
    A1,
  ].join('\n');
}

const MANUAL_STUB = [
  M0,
  '',
  '## 🩸 กับดักของเขตนี้',
  '',
  '_ยังไม่มีใครเขียน — เขตนี้เจออะไรที่คนต่อไปควรรู้ ให้เติมที่นี่_',
  '',
  '## ✅ วิธีตรวจงานของเขตนี้',
  '',
  '```bash',
  'npx tsc -p tsconfig.app.json --noEmit',
  'npx vitest run',
  'npx vite build',
  '```',
  '',
  M1,
].join('\n');

mkdirSync(ZONES, { recursive: true });
const stale = [];
let written = 0;

for (const [dom, prefixes] of Object.entries(map.domains)) {
  const file = join(ZONES, `${dom}.md`);
  const head =
    `# เขต \`${dom}\`\n\n` +
    `> **อ่านไฟล์นี้ก่อน แล้วค่อยอ่าน \`docs/team/CHARTER.md\`**\n` +
    `> บล็อก AUTO สร้างจาก \`ownership.json\` + \`git log\` ทุกครั้งที่รันตัวสร้าง ⇒ ไม่มีวันเน่า\n` +
    `> บล็อก MANUAL เขียนมือ — ตัวสร้างไม่แตะ\n`;
  const prev = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const manual =
    prev.includes(M0) && prev.includes(M1)
      ? prev.slice(prev.indexOf(M0), prev.indexOf(M1) + M1.length)
      : MANUAL_STUB;
  const next = `${head}\n${autoBlock(dom, prefixes)}\n\n${manual}\n`;

  if (prev !== next) {
    if (checkOnly) stale.push(dom);
    else {
      writeFileSync(file, next);
      written++;
    }
  }
}

const total = Object.keys(map.domains).length;
if (checkOnly) {
  if (stale.length) {
    console.log(`❌ บรีฟไม่ตรงกับของจริง ${stale.length} เขต: ${stale.join(', ')}`);
    console.log('   รัน: node scripts/team/gen-zone-brief.mjs');
    process.exit(1);
  }
  console.log(`✅ บรีฟทั้ง ${total} เขตตรงกับ ownership.json + git แล้ว`);
} else {
  console.log(`✅ เขียน/อัปเดต ${written} เขต (ทั้งหมด ${total})`);
}
