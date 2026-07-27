#!/usr/bin/env node
/**
 * ด่านคุมขนาดของกติกา — กัน CHARTER บวมกลับ
 *
 * 🔴 ที่มา (2026-07-27): `CHARTER.md` โตจาก 18,487 → 116,034 **ไบต์** ใน 8 วัน (6.3 เท่า)
 *    ⇒ ทุก session ต้องอ่าน ~17,500 tokens **ก่อนเริ่มงานแม้แต่บรรทัดเดียว**
 *    ⇒ นั่นคือกับดัก context rot ที่กติกาเหล่านั้นตั้งใจจะกันเอง
 *
 * 🔑 **ด่านนี้ไม่ได้ห้ามเขียนบทเรียนเพิ่ม — มันบังคับว่าบทเรียนต้องไปอยู่ `lessons/<หมวด>.md`**
 *    หลักตัดสิน: "ไม่รู้แล้วงานพังทันที" = CHARTER · "ไม่รู้แล้วเสียเวลา 1 ชม." = lessons/
 *
 * ⚠️ นับเป็น **ตัวอักษร** ไม่ใช่ไบต์ — ภาษาไทย 1 ตัวอักษร = 3 ไบต์ใน UTF-8
 *    ถ้านับไบต์จะได้เพดานที่เข้มกับภาษาไทยกว่าภาษาอังกฤษ 3 เท่าโดยไม่ตั้งใจ
 *
 * รัน: node scripts/team/check-charter-size.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

/** เพดานต่อไฟล์ (ตัวอักษร) — ตั้งจากขนาดจริงหลังแยก + ที่ว่างให้โตได้พอสมควร */
const LIMITS = {
  'CLAUDE.md': 6000,
  'docs/team/CHARTER.md': 30000,
  'docs/team/ROADMAP.md': 40000,
};

/** ไฟล์บทเรียน: ไม่มีเพดานรวม แต่แต่ละหมวดไม่ควรโตจนอ่านทีเดียวไม่ไหว */
const LESSON_LIMIT = 40000;
const LESSONS = ['measuring', 'data-safety', 'layout', 'numbers'];

let bad = 0;
const line = (ok, name, n, limit) =>
  console.log(`  ${ok ? '✅' : '🔴'} ${name.padEnd(34)} ${String(n).padStart(7)} / ${limit} ตัวอักษร  (~${Math.round(n / 3).toLocaleString()} tokens)`);

console.log('── ไฟล์ที่ทุก session ต้องอ่าน ──');
for (const [file, limit] of Object.entries(LIMITS)) {
  if (!existsSync(file)) { console.log(`  ⚠️  ${file} ไม่มีอยู่`); continue; }
  const n = readFileSync(file, 'utf8').length;
  const ok = n <= limit;
  if (!ok) bad++;
  line(ok, file, n, limit);
}

console.log('── บทเรียนแยกหมวด (อ่านเมื่อเกี่ยวข้อง) ──');
for (const k of LESSONS) {
  const file = `docs/team/lessons/${k}.md`;
  if (!existsSync(file)) { console.log(`  🔴 ${file} หายไป — ดัชนีใน CHARTER จะชี้ไปที่ว่าง`); bad++; continue; }
  const n = readFileSync(file, 'utf8').length;
  const ok = n <= LESSON_LIMIT;
  if (!ok) bad++;
  line(ok, file, n, LESSON_LIMIT);
}

if (bad) {
  console.log(`\n🔴 เกินเพดาน ${bad} ไฟล์`);
  console.log('   ✅ ทางแก้ที่ถูก: **ย้ายบทเรียนไป docs/team/lessons/<หมวด>.md**');
  console.log('   🚫 ทางแก้ที่ผิด: ตัดเนื้อหาทิ้ง หรือขยายเพดาน');
  console.log('      (บทเรียนทุกข้อในไฟล์เหล่านี้มาจากความผิดพลาดที่เกิดขึ้นจริงและมีราคาที่จ่ายไปแล้ว)');
  process.exit(1);
}
console.log('\n✅ ทุกไฟล์อยู่ในเพดาน');
