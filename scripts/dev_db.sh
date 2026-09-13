#!/usr/bin/env bash
# Levanta un PostgreSQL local con PostGIS y pgRouting para desarrollo.
# No sustituye a Supabase: reproduce sus extensiones para poder correr el
# pipeline completo sin proyecto remoto.
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/var/lib/postgresql/16/uri}
PGPORT=${PGPORT:-5433}

if [ ! -d "$PGDATA/base" ]; then
    mkdir -p "$PGDATA" /var/run/postgresql
    chown -R postgres:postgres "$PGDATA" /var/run/postgresql
    su postgres -c "$PGBIN/initdb -D $PGDATA -E UTF8 --locale=C"
fi

su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/pg.log -o '-p $PGPORT' start" || true
sleep 2
su postgres -c "$PGBIN/psql -p $PGPORT -tAc \"SELECT 1 FROM pg_roles WHERE rolname='uri'\"" \
    | grep -q 1 || su postgres -c "$PGBIN/psql -p $PGPORT -c \"CREATE ROLE uri LOGIN SUPERUSER PASSWORD 'uri'\""
su postgres -c "$PGBIN/psql -p $PGPORT -tAc \"SELECT 1 FROM pg_database WHERE datname='uri'\"" \
    | grep -q 1 || su postgres -c "$PGBIN/createdb -p $PGPORT -O uri uri"

echo "listo: postgresql://uri:uri@127.0.0.1:$PGPORT/uri"
