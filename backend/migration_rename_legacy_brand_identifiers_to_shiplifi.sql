-- Migration: rename legacy platform-prefixed database objects to shiplifi_*
-- Set source_prefix to the current legacy prefix before running this script.
-- Run this after deploying the backend code that expects shiplifi_* table prefixes.

BEGIN;

DO $$
DECLARE
  rec RECORD;
  new_name TEXT;
  source_prefix TEXT := 'legacy_platform_';
BEGIN
  FOR rec IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE source_prefix || '%'
  LOOP
    new_name := replace(rec.tablename, source_prefix, 'shiplifi_');
    EXECUTE format('ALTER TABLE %I.%I RENAME TO %I', rec.schemaname, rec.tablename, new_name);
  END LOOP;

  FOR rec IN
    SELECT schemaname, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname LIKE source_prefix || '%'
  LOOP
    new_name := replace(rec.indexname, source_prefix, 'shiplifi_');
    EXECUTE format('ALTER INDEX %I.%I RENAME TO %I', rec.schemaname, rec.indexname, new_name);
  END LOOP;

  FOR rec IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
      AND sequence_name LIKE source_prefix || '%'
  LOOP
    new_name := replace(rec.sequence_name, source_prefix, 'shiplifi_');
    EXECUTE format(
      'ALTER SEQUENCE %I.%I RENAME TO %I',
      rec.sequence_schema,
      rec.sequence_name,
      new_name
    );
  END LOOP;

  FOR rec IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND con.conname LIKE source_prefix || '%'
  LOOP
    new_name := replace(rec.constraint_name, source_prefix, 'shiplifi_');
    EXECUTE format(
      'ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
      rec.schema_name,
      rec.table_name,
      rec.constraint_name,
      new_name
    );
  END LOOP;
END $$;

COMMIT;
