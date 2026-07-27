#!/bin/bash
# coordinator: กวาดหางานที่ค้างอยู่ใน worktree แต่ยังไม่ถึงระบบทีม
# รันจาก repo หลัก · อ่านอย่างเดียว ไม่แตะอะไร
cd "$(git rev-parse --show-toplevel)" || exit 1
git fetch -q origin --prune 2>/dev/null

echo "═══ branch ทีมที่รอ merge ═══"
found=0
for r in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/parallel/); do
  n=$(git rev-list --count "origin/main..$r" 2>/dev/null)
  [ "$n" -gt 0 ] && { echo "  🔵 $r  (+$n)"; found=1; }
done
[ "$found" -eq 0 ] && echo "  ว่าง"

echo
echo "═══ worktree ที่มีงานยังไม่ถึงระบบทีม ═══"
found=0
git worktree list --porcelain | grep '^worktree ' | sed 's/^worktree //' | while IFS= read -r w; do
  git -C "$w" rev-parse --git-dir >/dev/null 2>&1 || continue
  b=$(git -C "$w" rev-parse --abbrev-ref HEAD 2>/dev/null)
  d=$(git -C "$w" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  u=$(git -C "$w" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
  msg=""
  [ "$d" -gt 0 ] && msg="$msg ไฟล์ค้าง=$d"
  case "$b" in
    claude/*) [ "$u" -gt 0 ] && msg="$msg 🔴 อยู่บน branch worktree ($u commit) — ทีมมองไม่เห็น";;
  esac
  [ -n "$msg" ] && printf '  %-32s %s\n' "$(basename "$w")" "$msg"
done
echo
echo "หมายเหตุ: ไฟล์ค้างใน worktree ที่ session ยังทำงานอยู่ = ปกติ · ที่ต้องตามคือ 🔴"

echo
echo "═══ 🔴 งานที่เสร็จแล้วแต่ auto-merge ตีกลับ — รอ coordinator ═══"
# 🔴 ที่มา (2026-07-27): parallel/schedule-progress-denominator เสร็จตั้งแต่เช้า
#    แต่แตะ src/hooks/ ⇒ auto-merge ตีกลับ ⇒ "หายไปเงียบๆ" จนกวาดครั้งสุดท้ายถึงเจอ
#    ⇒ ของที่รอคนต้องดังกว่าของที่ยังทำอยู่
found=0
git fetch -q origin 2>/dev/null
for b in $(git branch -r 2>/dev/null | grep -oE 'origin/parallel/[^ ]+' | sed 's|origin/||'); do
  n=$(git log --oneline "origin/main..origin/$b" 2>/dev/null | grep -c 'done(')
  [ "$n" -eq 0 ] && continue
  # เหตุผลที่ auto-merge รับไม่ได้ (ถ้าเดาได้)
  why=""
  git diff --name-status "origin/main...origin/$b" 2>/dev/null | grep -q '^D' && why="$why ลบไฟล์"
  # อ่านเขตกลางจาก ownership.json — ไม่ฝัง path ของโปรเจกต์ใดโปรเจกต์หนึ่ง
  locked=$(node -e "try{const m=require('./docs/team/ownership.json');process.stdout.write((m.coordinatorLocked||[]).filter(p=>!p.startsWith('_')).join('|'))}catch(e){}" 2>/dev/null)
  [ -n "$locked" ] && git diff --name-only "origin/main...origin/$b" 2>/dev/null \
    | grep -qE "^($locked)" && why="$why แตะไฟล์กลาง"
  [ -z "$why" ] && why=" ไม่ทราบ — ตรวจด้วย check-ownership.mjs"
  printf '  🔴 %-44s done=%s ·%s\n' "$b" "$n" "$why"
  found=$((found+1))
done
[ "$found" -eq 0 ] && echo "  ว่าง — ไม่มีงานเสร็จแล้วค้างรอ coordinator"
