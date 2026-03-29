-- Enable RLS on all tables
ALTER TABLE pit_dimension_set_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pit_counts ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "public read pit_dimension_set_defs"
    ON pit_dimension_set_defs
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "public read pit_counts"
    ON pit_counts
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Materialized views are not tables and do not support RLS.
-- pit_coverage is read-only by definition (no INSERT/UPDATE/DELETE).
-- Access is implicitly public since it contains no sensitive data and
-- cannot be written to by any client role.
