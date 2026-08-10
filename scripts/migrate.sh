#!/bin/sh

set -eu

export PGPASSWORD="${POSTGRES_PASSWORD}"

psql_base="psql -v ON_ERROR_STOP=1 -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d ${POSTGRES_DB}"

until pg_isready -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  sleep 1
done

${psql_base} -c '
  CREATE TABLE IF NOT EXISTS public.app_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
'

for migration in /migrations/*.sql; do
  filename="$(basename "${migration}")"

  case "${filename}" in
    [0-9][0-9][0-9][0-9]_*.sql) ;;
    *) continue ;;
  esac

  applied="$(${psql_base} -Atc "SELECT 1 FROM public.app_migrations WHERE filename = '${filename}'")"
  if [ "${applied}" = "1" ]; then
    echo "Migration ${filename} already applied"
    continue
  fi

  echo "Applying migration ${filename}"
  {
    echo 'BEGIN;'
    cat "${migration}"
    printf "\nINSERT INTO public.app_migrations (filename) VALUES ('%s');\n" "${filename}"
    echo 'COMMIT;'
  } | ${psql_base}
done
