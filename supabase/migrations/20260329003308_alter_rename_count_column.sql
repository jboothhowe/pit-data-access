-- Rename `count` → `n` to avoid collision with PostgREST's reserved aggregate
-- keyword. Without this, clients selecting the column unquoted receive aggregate
-- metadata instead of the column value.
ALTER TABLE pit_counts RENAME COLUMN count TO n;
