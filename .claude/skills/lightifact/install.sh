#!/usr/bin/env bash
# lightifact 스킬을 현재 사용자의 Claude Code 스킬 디렉터리에 설치한다.
# 설치 후 어떤 프로젝트에서든 "이거 공유해줘" / "/lightifact" 로 사용 가능.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${HOME}/.claude/skills/lightifact"

mkdir -p "$DEST"
cp "$SRC/SKILL.md" "$SRC/share.mjs" "$DEST/"

echo "✅ 설치 완료: $DEST"
echo "   대상 서버: ${LIGHTIFACT_URL:-__LIGHTIFACT_URL__}"
echo "   로컬로 쓰려면: export LIGHTIFACT_URL=http://localhost:4321"
