---
name: zenityx-lanes
description: Sets up and operates LANES — a workflow for running multiple Claude Code sessions in parallel on one repository without collisions. Installs file-ownership zones enforced by CI, a done()-triggered auto-merge gate, a stranded-work sweeper, an unpushed-work hook, and a layered rules system that resists context rot. Use when the user says "LANES", "ตั้งระบบ LANES", "set up LANES", asks to run several Claude sessions or agents in parallel on one repo, asks how to stop parallel agents from overwriting each other, or asks to audit an existing multi-session setup.
---

# LANES — ทำงานหลาย session พร้อมกันบนรีโปเดียว โดยไม่ชนกัน

> พิสูจน์บนงานจริง: **merge 250 ครั้ง ไม่มีการชนกันสักครั้ง** · วันที่หนักที่สุด **commit 174 · merge 70 · งานส่ง 58 งวด**

**LANES = ห้าเสาที่ต้องมีครบ ถึงจะทำงานขนานได้จริง**

| | | คืออะไร |
|---|---|---|
| **L** | **Lanes** | เขตไฟล์ต่อแผนก — **ด่านใน CI บล็อกจริง ไม่ใช่ข้อตกลง** |
| **A** | **Auto-merge** | commit ขึ้นต้น `done(...)` → ตรวจ 5 ด่าน → merge เอง |
| **N** | **Notes** | บทเรียนสะสม + บันทึกการตัดสินใจ **อยู่ในไฟล์ ไม่ใช่ในบทสนทนา** |
| **E** | **Evidence** | ทุกตัวเลขต้องพิสูจน์ได้ · **ด่านต้องพิสูจน์ว่าแดงได้จริง** |
| **S** | **Scope** | งานไม่จบด้วย commit → subagent · เพดาน session พร้อมกัน 3–5 |

🔑 **เสาที่คนมองข้ามบ่อยที่สุดคือ E** — ทีมส่วนใหญ่มี L กับ A แล้วคิดว่าพอ
แต่ **สิ่งที่ทำให้ระบบนี้ไม่พังคือ "ห้ามเชื่อสิ่งที่ยังไม่ได้วัด"** ไม่ใช่ตัวด่าน

---

## เมื่อไหร่ควรใช้ LANES — และเมื่อไหร่ไม่ควร

| สถานการณ์ | ใช้ไหม |
|---|---|
| 1 คน + 1 session ทำทีละงาน | ❌ **ไม่ต้อง** — ระบบนี้มีต้นทุน ใช้ตอนที่ยังไม่ต้องการคือขาดทุน |
| 2–5 session ทำงานคนละส่วนของรีโปเดียวกัน | ✅ **จุดคุ้มทุน** |
| งานที่แตะไฟล์เดียวกันหลายคน | ⚠️ LANES **กันไฟล์ชนกันได้ แต่กัน semantic conflict ไม่ได้** — ต้องมีคนตัดสิน |
| เกิน 8 session | 🔴 **คอขวดจะกลายเป็นคนรีวิว ไม่ใช่โมเดล** — ลดลงก่อน |

---

## ติดตั้งในรีโปใหม่ — 6 ขั้น

```
Setup Progress:
- [ ] 1. สร้าง ownership.json (เขตไฟล์)
- [ ] 2. วางสคริปต์ 4 ตัว
- [ ] 3. วาง CI workflow (auto-merge)
- [ ] 4. เขียน CLAUDE.md จากเทมเพลต
- [ ] 5. ตั้ง Stop hook
- [ ] 6. พิสูจน์ว่าด่านแดงได้จริง  ← ห้ามข้าม
```

### 1. เขตไฟล์ — `docs/team/ownership.json`

คัดลอก [`templates/ownership.json`](templates/ownership.json) แล้วแก้ให้ตรงรีโป

```json
{
  "coordinatorLocked": ["src/lib/", "src/config/", "package.json"],
  "alwaysAllowed": ["docs/team/status/"],
  "domains": {
    "frontend": ["src/components/frontend/", "src/pages/Home.tsx"],
    "api":      ["src/api/"]
  },
  "domainDenied": {}
}
```

🔑 **หลักแบ่งเขต: แบ่งตาม "ใครเป็นเจ้าของการตัดสินใจ" ไม่ใช่ตามชนิดไฟล์**
⚠️ **ยกไฟล์กลางให้รายไฟล์ได้** — ถ้าไฟล์นั้นมีผู้ใช้แผนกเดียว ให้ใส่ชื่อไฟล์เต็มใน `domains`
(exact-file grant ชนะ prefix lock) · พิสูจน์ก่อนยกด้วย `git grep -ln "<ชื่อไฟล์>" -- src`

### 2. สคริปต์

```bash
mkdir -p scripts/team
cp scripts/check-ownership.mjs scripts/check-charter-size.mjs \
   scripts/gen-zone-brief.mjs                                  <repo>/scripts/team/
cp scripts/board-sweep.sh scripts/check-work-pushed.sh          <repo>/scripts/
chmod +x <repo>/scripts/*.sh
```

| สคริปต์ | ทำอะไร |
|---|---|
| `check-ownership.mjs` | ตรวจว่า branch แตะเฉพาะเขตตัวเอง — **ใช้ใน CI** |
| `check-charter-size.mjs` | กันไฟล์กติกาบวมจนเกิด context rot |
| `gen-zone-brief.mjs` | **สร้างบรีฟรายเขต** — ตัดค่าตั้งต้นของ session ใหม่ (ดูข้างล่าง) |
| `board-sweep.sh` | หา **งานที่เสร็จแล้วแต่ค้าง** และ worktree ที่ทีมมองไม่เห็น |
| `check-work-pushed.sh` | Stop hook — เตือนตอน session จบทั้งที่ยังไม่ push |

### 3. CI

คัดลอก [`templates/auto-merge.yml`](templates/auto-merge.yml) ไป `.github/workflows/`
**แก้ 3 จุด:** คำสั่ง build · คำสั่ง test · คำสั่ง typecheck

🔴 **ห้ามให้ workflow ลบ branch หลัง merge** — เกิดจริง: robot ลบ branch แล้วงานที่ยัง push ไม่เสร็จหายไป 3 ครั้งในวันเดียว

### 4. `CLAUDE.md`

คัดลอก [`templates/CLAUDE.md`](templates/CLAUDE.md) — **แก้เฉพาะชื่อแผนกกับ path**

⚠️ **กฎที่ต้องรู้ทุกครั้งต้องอยู่ใน `CLAUDE.md`** (โหลดอัตโนมัติ)
**ห้ามย้ายไปสกิล** เพราะสกิลโหลดตอนถูกเรียกเท่านั้น — กฎที่ห้ามพลาดจะพลาดได้

### 5. Stop hook — `.claude/settings.json`

```json
{"hooks":{"Stop":[{"hooks":[{"type":"command",
  "command":"bash \"$CLAUDE_PROJECT_DIR/scripts/check-work-pushed.sh\" 2>/dev/null || true",
  "timeout":15}]}]}}
```

### 6. 🔴 พิสูจน์ว่าด่านแดงได้จริง — **ขั้นที่ห้ามข้าม**

```bash
# ① ownership: แกล้งแตะไฟล์นอกเขต แล้วต้องตีกลับ
printf 'M\tsrc/lib/anything.ts\n' > /tmp/d.txt
node scripts/team/check-ownership.mjs parallel/frontend-x /tmp/d.txt   # ต้อง: ไฟล์กลาง: src/lib/…

# ② ownership: แตะไฟล์ในเขต แล้วต้องผ่าน  ← เคสควบคุมด้านบวก ห้ามข้าม
printf 'M\tsrc/components/frontend/X.tsx\n' > /tmp/d.txt
node scripts/team/check-ownership.mjs parallel/frontend-x /tmp/d.txt   # ต้อง: ownership OK

# ③ size guard: เติมขยะแล้วต้องตีกลับ / ลบออกแล้วต้องผ่าน

# ④ บรีฟรายเขต: แก้ ownership.json แล้วไม่รันตัวสร้าง → --check ต้องตีกลับ
node scripts/team/gen-zone-brief.mjs --check
```

> 🩸 **สูตรนี้เคยผิดมาก่อน และผิดแบบที่อันตรายที่สุด**
> เวอร์ชันแรกส่ง `frontend` เป็นชื่อ branch แทน `parallel/frontend-x`
> ⇒ สคริปต์ตีกลับเพราะ **ชื่อ branch ผิดรูปแบบ** ไม่ใช่เพราะตรวจเขตแล้วเจอปัญหา
> **ขั้น ① เลย "เขียว" ด้วยเหตุผลที่ผิด และขั้น ② พังทั้งที่สคริปต์ทำงานถูก**
> 🔑 **อ่านข้อความที่ด่านพ่นออกมาเสมอ อย่าดูแค่ว่ามันตีกลับหรือไม่ตีกลับ**

> **ด่านที่ไม่เคยเห็นตัวเองแดง = ไม่ใช่ด่าน**
> และ **ด่านที่แดงเสมอก็ไม่ใช่ด่าน** — ต้องพิสูจน์ทั้งสองทาง

---

## ใช้งานประจำวัน

### วงจรของ session แผนก

```
1. อ่าน CLAUDE.md + เขตของตัวเอง          ← โหลดอัตโนมัติ
2. git fetch && git branch -r | grep parallel/   ← มีใครทำเขตเดียวกันอยู่ไหม
3. branch: parallel/<แผนก>-<งาน>          ← push ทันที = ประกาศว่ากำลังทำ
4. ทำงาน + เขียนเทสต์
5. commit สุดท้าย: done(<แผนก>-<งาน>):    ← ตัวจุด auto-merge
6. อัปเดต docs/team/status/<แผนก>.md
7. push แล้ว **ยืนยันว่าถึงจริง** (3 คำสั่งข้างล่าง)
```

**🚨 3 คำสั่งที่ต้องได้ผลว่างก่อนบอกใครว่า "ส่งแล้ว"**
```bash
git status --porcelain          # ต้องว่าง
git log --oneline @{u}..HEAD    # ต้องว่าง = ถึง remote จริง
git log --oneline origin/main..HEAD   # ต้องอยู่บน parallel/ และ push แล้ว
```
> **`git commit` ผ่าน ≠ ของถึงมือคนอื่น**

### หน้าที่ coordinator

```bash
bash scripts/board-sweep.sh    # ทำทุกครั้งก่อนบอกว่า "ไม่มีงานค้าง"
```
แสดง 3 อย่าง: branch ที่รอ merge · worktree ที่ทีมมองไม่เห็น · **งานที่ auto-merge ตีกลับแล้วค้างเงียบ**

---

## 🗂️ บรีฟรายเขต — ทำให้ค่าตั้งต้นถูกลง แทนที่จะเลี่ยงมัน

**ปัญหา:** session ใหม่ต้องจ่ายค่าตั้งต้นก่อนเขียนโค้ดบรรทัดแรก —
อ่านไฟล์กติกาทั้งใบ + เดาว่าบทเรียนไฟล์ไหนเกี่ยว + ไล่โค้ดเอง

**คนส่วนใหญ่แก้ผิดทาง:** เปิด session ประจำแผนกค้างไว้ตลอด เพื่อไม่ต้องจ่ายซ้ำ
🚫 **อย่าทำ** — เหตุผล 4 ข้อที่วัดได้อยู่ใน [`reference/delegation.md`](reference/delegation.md)

**ทางที่ถูก:** `docs/team/zones/<แผนก>.md` — ใบเดียวจบ

```bash
node scripts/team/gen-zone-brief.mjs           # สร้าง/อัปเดตทุกเขต
node scripts/team/gen-zone-brief.mjs --check   # ตรวจว่าไม่เน่า (ใส่ใน CI/เทสต์)
```

| บล็อก | ที่มา | มีอะไร |
|---|---|---|
| **AUTO** | สร้างจาก `ownership.json` + `git log` ทุกครั้ง ⇒ **เน่าไม่ได้** | เขตไฟล์ · สิทธิ์รายไฟล์ · ไฟล์ที่แก้บ่อยที่สุด · งวดล่าสุด · **บทเรียนไฟล์ไหนที่ควรอ่านจริง** |
| **MANUAL** | เขียนมือ ตัวสร้างไม่แตะ | กับดักของเขตที่ derive ไม่ได้ |

> 🔴 **บรีฟที่ผิด แย่กว่าไม่มีบรีฟ** — คนอ่านจะเชื่อมันแล้วไม่ไปตรวจของจริง
> นี่คือเหตุผลที่ส่วนที่ derive ได้ **ต้องสร้างใหม่ทุกครั้ง** ไม่ใช่พิมพ์มือ

**🩸 กับดักในตัวสร้างเอง:** ตัวจัดอันดับบทเรียนรู้จักแค่ *ชื่อ path*
⇒ เขตที่บทเรียนพูดถึงด้วยคำในภาษาอื่น (เช่นคำไทย) จะได้ **0 คะแนน**
**ถ้าจัดอันดับไม่ได้ ให้ลิสต์ทุกไฟล์พร้อมเขียนกำกับว่าจัดอันดับไม่ได้ — อย่าเงียบ**
(false negative แพงกว่า false positive เสมอ)

**เจอกับดักใหม่ในเขตไหน → เขียนลงบล็อก MANUAL ของเขตนั้น**
นี่คือที่ที่ความรู้อยู่ต่อ **ไม่ใช่ในบริบทของ session**

---

## เลือกให้ถูก: ทำเอง · session · subagent

### เกณฑ์แรก — **"งานถัดไปต้องรู้ผลของงานที่ทำอยู่ไหม"**

```
ต้องรู้ผลก่อนถึงจะสั่งได้   → ทำเอง (เขียนคำสั่งไม่ได้ เพราะยังไม่รู้จะสั่งอะไร)
ไม่ต้องรู้                  → ส่งต่อทันที ไม่ต้องรอจบงานปัจจุบัน
```

> ⚠️ เกณฑ์ที่คนมักใช้คือ *"จบด้วย commit ไหม"* — **นั่นวัดที่ชนิดของผลลัพธ์ ซึ่งเป็นแกนที่ผิด**
> งานที่จบด้วย commit อาจต้องทำเอง (ถ้ามันเป็นโซ่ที่ต้องรู้ผลทีละขั้น)
> และงานที่ไม่จบด้วย commit ก็ส่งต่อได้ (ถ้ามันเป็นอิสระ)

### เกณฑ์ที่สอง — ส่งต่อแล้ว **ส่งเป็นอะไร**

| | subagent | session |
|---|---|---|
| งานแบบไหน | ไม่จบด้วย commit — วัด · กวาด `grep` · ยิงคิวรีนับ · อ่าน log ยาว | จบด้วย commit |
| ต้นทุน | คืนแค่สรุป **1,000–2,000 tokens** | หน้าต่างบริบทแยกทั้งอัน |
| **เถียงกลับได้ไหม** | ❌ | ✅ **นี่คือเหตุผลเดียวที่ยังต้องมี session** |

🔑 **เหตุผลที่ใช้ subagent ไม่ใช่แค่ประหยัด — output ยาว ๆ อยู่ในบริบทของ subagent ไม่ใช่ของ coordinator**

### กติกาเพิ่มอีก 3 ข้อ

| | |
|---|---|
| **1 session = 1 เขต ไม่ใช่ 1 งาน** | กวาดงานค้างของเขตนั้นใส่ใบเดียว ⇒ จ่ายค่าตั้งต้นครั้งเดียว |
| **session ที่ยังเปิดอยู่ → ส่งข้อความ** | ถูกกว่า brief ใหม่ทั้งใบเสมอ |
| **หัวหน้าแผนกสร้าง subagent ได้ · เปิด session ใหม่ไม่ได้** | ไม่งั้นไม่มีใครรู้ว่ามีกี่สายวิ่งอยู่ · เพดาน 3–5 พังทันที |

### 🚩 coordinator ต้องเช็คตัวเอง — ด่านจับไม่ได้

**ด่านเขตไฟล์อ่านจากชื่อ branch** ⇒ **coordinator ที่ทำงานบน `main` ไม่เคยถูกด่านตรวจเลย**

เกิดจริง: coordinator ทำรวดเดียว **12 commit แตะ 27 ไฟล์** — เป็นเขตแผนกอื่น **9 ไฟล์** และไม่มีเจ้าของอีก **7 ไฟล์**
📖 รายละเอียด + เหตุผลว่าทำไม **ไม่เอา** "หัวหน้าแผนกถาวร": [`reference/delegation.md`](reference/delegation.md)

---

## รายละเอียดเพิ่ม (อ่านเมื่อต้องใช้)

| ไฟล์ | อ่านเมื่อ |
|---|---|
| [`reference/lanes-concept.md`](reference/lanes-concept.md) | อยากเข้าใจว่าทำไมแต่ละเสาถึงจำเป็น · สอนคนอื่น |
| [`reference/context-hygiene.md`](reference/context-hygiene.md) | ไฟล์กติกาเริ่มบวม · session เริ่มลืมกฎ |
| [`reference/measuring.md`](reference/measuring.md) | เขียนสคริปต์วัด/สแกน · เขียนเทสต์ · เขียนด่าน · ทำ QA |
| [`reference/numbers.md`](reference/numbers.md) | **รายงานตัวเลขให้ใครก็ตาม** |
| [`reference/failure-modes.md`](reference/failure-modes.md) | ระบบเริ่มมีอาการแปลกๆ · **ด่านเขียวแต่ไม่ได้ตรวจอะไร** |
| [`reference/delegation.md`](reference/delegation.md) | ตัดสินใจว่าทำเองหรือส่งต่อ · coordinator เริ่มทำเองมากไป |

---

## ตรวจสุขภาพระบบที่ติดตั้งไปแล้ว

เมื่อผู้ใช้ขอให้ audit ระบบเดิม ให้วัด **5 ตัวนี้ก่อนแนะนำอะไร**

```bash
# ① กติกาโตเกินไปไหม (ตัวอักษร ไม่ใช่ไบต์ — ภาษาไทย 1 ตัว = 3 ไบต์)
node scripts/team/check-charter-size.mjs

# ② มีงานเสร็จแล้วค้างไหม
bash scripts/board-sweep.sh

# ③ ทำงานขนานกี่ตัวจริงๆ  (เกิน 8 = คอขวดคือคนรีวิว)
git branch -r | grep -c parallel/

# ④ สัดส่วนงานที่เป็นการแก้ของตัวเอง (สูง = กติกาไม่ทำงาน)
git log --since="7 days ago" --oneline | grep -ciE "fix\(|revert|ผิด|หักล้าง"

# ⑤ merge ชนกันบ่อยแค่ไหน (ควรเป็น 0 — ถ้าไม่ใช่ แปลว่าเขตไฟล์ผิด)
git log --oneline --merges --since="30 days ago" | wc -l
```

**อ่านผลแล้วเทียบกับ [`reference/failure-modes.md`](reference/failure-modes.md)**
