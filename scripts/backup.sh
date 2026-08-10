#!/bin/sh

set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
env_file="${project_dir}/.env.production"
backup_dir="${project_dir}/backups"

if [ ! -f "${env_file}" ]; then
  echo "Не найден файл ${env_file}" >&2
  exit 1
fi

set -a
. "${env_file}"
set +a

mkdir -p "${backup_dir}"
timestamp="$(date +%Y-%m-%d_%H-%M-%S)"

docker compose \
  --env-file "${env_file}" \
  -f "${project_dir}/compose.production.yml" \
  exec -T db \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  | gzip > "${backup_dir}/dogmeet_${timestamp}.sql.gz"

find "${backup_dir}" -type f -name 'dogmeet_*.sql.gz' -mtime +14 -delete

echo "Резервная копия сохранена: ${backup_dir}/dogmeet_${timestamp}.sql.gz"
