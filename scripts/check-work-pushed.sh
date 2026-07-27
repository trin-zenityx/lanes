#!/bin/bash
# ตรวจว่างานใน worktree นี้ push ถึง remote จริงหรือยัง
# ใช้เป็น Stop hook — ไม่บล็อกอะไร แค่เตือนก่อน session จบ
# เกิดจากปัญหาจริง 2026-07-26: หลาย session ทำงานเสร็จแล้วนอนอยู่ใน worktree
# จน Trin ต้องไปไล่อ่านเอง

cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
WARN=""

# ① มีไฟล์ค้างไม่ได้ commit
if [ "$DIRTY" -gt 0 ]; then
  WARN="${WARN}• มีไฟล์ค้างยังไม่ commit ${DIRTY} ไฟล์"$'\n'
fi

# ② commit แล้วแต่ยังไม่ push (มี upstream)
if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  AHEAD=$(git log --oneline '@{u}..HEAD' 2>/dev/null | wc -l | tr -d ' ')
  [ "$AHEAD" -gt 0 ] && WARN="${WARN}• commit ${AHEAD} ก้อนยังไม่ถึง remote — รัน git push"$'\n'
else
  # ③ ไม่มี upstream เลย = ยังไม่เคย push · เตือนเฉพาะเมื่อมี commit ที่ main ยังไม่มี
  UNMERGED=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
  if [ "$UNMERGED" -gt 0 ]; then
    WARN="${WARN}• branch นี้ยังไม่เคย push (${UNMERGED} commit) — รัน git push -u origin HEAD:parallel/<แผนก>-<งาน>"$'\n'
  fi
fi

# ④ อยู่บน branch worktree อัตโนมัติ ทั้งที่มีงานแล้ว
case "$BRANCH" in
  claude/*)
    UNMERGED=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
    [ "$UNMERGED" -gt 0 ] && WARN="${WARN}• อยู่บน ${BRANCH} ซึ่งไม่ใช่ branch ของทีม — coordinator มองไม่เห็นงานนี้"$'\n'
  ;;
esac

[ -z "$WARN" ] && exit 0

printf '{"systemMessage":"⚠️ งานยังไม่ถึงมือ coordinator\\n%s\\nCLAUDE.md ข้อ 3: git commit ผ่าน ≠ ของถึงมือคนอื่น"}' \
  "$(printf '%s' "$WARN" | sed 's/"/\\"/g' | awk '{printf "%s\\n", $0}')"
