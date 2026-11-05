#!/usr/bin/env bash
# Publica las historias de docs/backlog/issues/*.md como issues de GitHub.
# Requiere GitHub CLI autenticado:  gh auth login
# Uso:  ./scripts/crear-issues.sh [owner/repo]     (por defecto, el repo del directorio actual)
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ARG=()
[ "${1:-}" ] && REPO_ARG=(--repo "$1")

command -v gh >/dev/null || { echo "Instala GitHub CLI: https://cli.github.com"; exit 1; }

echo "→ Creando etiquetas…"
for l in "epica-1:0E8A16" "historia-de-usuario:1D76DB" "prioridad-critica:B60205" "prioridad-alta:D93F0B" "prioridad-media:FBCA04" "bug:EE0701"; do
  gh label create "${l%%:*}" --color "${l##*:}" --force "${REPO_ARG[@]}" >/dev/null
done

echo "→ Creando issues…"
for f in docs/backlog/issues/HU-*.md; do
  title="$(head -1 "$f" | sed 's/^# //')"
  prio="$(grep -m1 '^\*\*Prioridad:\*\*' "$f" | sed 's/.*Prioridad:\*\* *//' | tr '[:upper:]' '[:lower:]' | sed 's/í/i/g')"
  if gh issue list --search "\"$title\" in:title" --state all "${REPO_ARG[@]}" --json title -q '.[].title' | grep -qxF "$title"; then
    echo "  ya existe: $title"; continue
  fi
  gh issue create --title "$title" --body-file <(tail -n +2 "$f") \
    --label "epica-1,historia-de-usuario,prioridad-$prio" "${REPO_ARG[@]}"
done
echo "Listo. Sugerencia: crea un tablero en GitHub Projects y agrega estos issues."
