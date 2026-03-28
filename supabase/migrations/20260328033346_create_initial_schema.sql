-- PIT Count Data: Initial Schema
-- Covers: pit_dimension_set_defs, pit_counts, indexes, and pit_coverage materialized view.
-- See DIMENSIONS.md for full rationale.

-- ---------------------------------------------------------------------------
-- 1. Dimension set vocabulary table
-- ---------------------------------------------------------------------------

CREATE TABLE pit_dimension_set_defs (
    dimension_set  text    PRIMARY KEY,
        -- Matches the dimension_set column in pit_counts.
    dimensions     text[]  NOT NULL,
        -- Sorted array of dimension column names that are non-null in this set.
        -- 'shelter' is always included (it is never null).
        -- 'race' and 'hispanic' always appear together — treat as a single selection unit.
    count_unit     text    NOT NULL DEFAULT 'person',
        -- 'person'    = rows count individuals (all sets except shelter+family_unit)
        -- 'household' = rows count household units (shelter+family_unit only)
    description    text
);

INSERT INTO pit_dimension_set_defs
    (dimension_set,                               dimensions,                                                  count_unit,  description)
VALUES
    ('shelter+in_family',                         ARRAY['in_family','shelter'],                                'person',    'Per-shelter totals split by individual vs. in-family (persons)'),
    ('shelter+family_unit',                       ARRAY['in_family','shelter'],                                'household', 'Per-shelter count of family household units (not persons)'),
    ('shelter+in_family+age',                     ARRAY['age','in_family','shelter'],                          'person',    'Individual/family persons by age range'),
    ('shelter+in_family+gender',                  ARRAY['gender','in_family','shelter'],                       'person',    'Individual/family persons by gender'),
    ('shelter+in_family+race+hispanic',           ARRAY['hispanic','in_family','race','shelter'],              'person',    'Individual/family persons by race and Hispanic ethnicity'),
    ('shelter+veteran',                           ARRAY['shelter','veteran'],                                  'person',    'Veteran totals by shelter type'),
    ('shelter+veteran+gender',                    ARRAY['gender','shelter','veteran'],                         'person',    'Veterans by gender'),
    ('shelter+veteran+race+hispanic',             ARRAY['hispanic','race','shelter','veteran'],                'person',    'Veterans by race and Hispanic ethnicity'),
    ('shelter+unaccompanied_youth+age',           ARRAY['age','shelter','unaccompanied_youth'],                'person',    'Unaccompanied youth by age sub-group (under 18 / 18-24)'),
    ('shelter+unaccompanied_youth+gender',        ARRAY['gender','shelter','unaccompanied_youth'],             'person',    'Unaccompanied youth by gender'),
    ('shelter+unaccompanied_youth+race+hispanic', ARRAY['hispanic','race','shelter','unaccompanied_youth'],    'person',    'Unaccompanied youth by race and Hispanic ethnicity'),
    ('shelter+parenting_youth+age',               ARRAY['age','parenting_youth','shelter'],                   'person',    'Parenting youth by age sub-group (under 18 / 18-24)'),
    ('shelter+parenting_youth+gender',            ARRAY['gender','parenting_youth','shelter'],                 'person',    'Parenting youth by gender'),
    ('shelter+parenting_youth+race+hispanic',     ARRAY['hispanic','parenting_youth','race','shelter'],        'person',    'Parenting youth by race and Hispanic ethnicity'),
    ('shelter+children_of_parenting_youth',       ARRAY['children_of_parenting_youth','shelter'],              'person',    'Children of parenting youth (no further sub-dimensions available)'),
    ('shelter+chronic+in_family',                 ARRAY['chronic','in_family','shelter'],                      'person',    'Chronically vs. non-chronically homeless individuals/families');

-- ---------------------------------------------------------------------------
-- 2. Fact table
-- ---------------------------------------------------------------------------

CREATE TABLE pit_counts (
    id                            serial  PRIMARY KEY,

    -- Metadata
    year                          smallint NOT NULL,
    coc_id                        text     NOT NULL,  -- e.g. 'CA-502'

    -- Shelter (always present)
    -- Values: 'es', 'th', 'sh', 'unsheltered'
    shelter                       text     NOT NULL,

    -- In-family status (null = not disaggregated by household type)
    -- true  = person lives within a family household
    -- false = person is an individual (not in a family household)
    -- null  = row is a cross-cutting subset (veteran, youth, etc.)
    in_family                     boolean,

    -- Cross-cutting population flags (null = not filtered to this population)
    veteran                       boolean,
        -- true = counted as homeless veteran; null = not filtered to veterans
    unaccompanied_youth           boolean,
        -- true = counted as unaccompanied youth (<25); null = not filtered
    parenting_youth               boolean,
        -- true = counted as parenting youth (<25, self-identified parent); null = not filtered
    children_of_parenting_youth   boolean,
        -- true = counted as child living with a homeless parenting youth; null = not filtered
    chronic                       boolean,
        -- true  = chronically homeless (from source data)
        -- false = derived complement: non-chronically homeless (see DIMENSIONS.md §10)
        -- null  = not filtered to chronic status

    -- Age upper bound (null = not disaggregated by age)
    -- Values: 17, 24, 34, 44, 54, 64, 110
    -- NOTE: age_upper=110 means "ages 25+" for year<=2022, "ages 65+" for year>=2023.
    --       (use source_column to disambiguate when needed)
    age_upper                     smallint,

    -- Gender (null = not disaggregated by gender)
    -- Values: 'woman', 'man', 'transgender', 'gender_questioning', 'non_binary',
    --         'more_than_one_gender', 'culturally_specific_identity', 'different_identity'
    gender                        text,

    -- Race (null = not disaggregated by race, OR Hispanic-only respondent with no race specified)
    -- Values: 'american_indian_alaska_native_indigenous', 'asian', 'black',
    --         'middle_eastern_north_african', 'multi_racial',
    --         'native_hawaiian_pacific_islander', 'white'
    -- null when hispanic=true and no racial group selected ('Hispanic/Latina/e/o Only')
    race                          text,

    -- Hispanic/Latino ethnicity (null = not disaggregated by ethnicity)
    -- true  = respondent identified as Hispanic/Latina/e/o
    -- false = respondent did not identify as Hispanic/Latina/e/o (race-only rows)
    -- null  = row is not disaggregated by ethnicity
    hispanic                      boolean,

    -- Count value
    count                         int      NOT NULL,

    -- Count unit
    -- 'person'    = count represents individuals (all rows except shelter+family_unit)
    -- 'household' = count represents household units (dimension_set='shelter+family_unit' only)
    count_unit                    text     NOT NULL DEFAULT 'person',

    -- Dimension set tag — always filter to a single dimension_set before aggregating.
    -- 'shelter+in_family' = person counts only; 'shelter+family_unit' = household unit counts.
    -- Never mix these two in a SUM.
    dimension_set                 text     NOT NULL
        REFERENCES pit_dimension_set_defs (dimension_set),

    -- Source column name from CSV, or synthetic label for derived rows.
    source_column                 text     NOT NULL,

    -- true = row was computed as an implicit complement (chronic=false rows, see DIMENSIONS.md §10).
    -- false = row was loaded directly from a source CSV column.
    is_derived                    boolean  NOT NULL DEFAULT false,

    -- Uniqueness: no two rows for the same (year, coc_id, dimension_set) may share all dimension values.
    -- NULLS NOT DISTINCT ensures NULLs are treated as equal for uniqueness purposes (PostgreSQL 15+).
    CONSTRAINT pit_counts_unique_row UNIQUE NULLS NOT DISTINCT (
        year, coc_id, dimension_set,
        shelter, in_family,
        veteran, unaccompanied_youth, parenting_youth, children_of_parenting_youth, chronic,
        age_upper, gender, race, hispanic,
        count_unit
    ),

    -- Structural invariants
    CONSTRAINT pit_counts_shelter_values
        CHECK (shelter IN ('es', 'th', 'sh', 'unsheltered')),

    CONSTRAINT pit_counts_count_unit_values
        CHECK (count_unit IN ('person', 'household')),

    CONSTRAINT pit_counts_age_upper_values
        CHECK (age_upper IN (17, 24, 34, 44, 54, 64, 110)),

    -- At most one population flag may be non-null per row.
    -- (veteran, unaccompanied_youth, parenting_youth, children_of_parenting_youth, and chronic
    --  are mutually exclusive cross-cuts; no source column encodes more than one.)
    CONSTRAINT pit_counts_single_population_flag
        CHECK (
            (CASE WHEN veteran                     IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN unaccompanied_youth          IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN parenting_youth              IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN children_of_parenting_youth  IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN chronic                      IS NOT NULL THEN 1 ELSE 0 END
            ) <= 1
        ),

    -- race and hispanic must either both be non-null or both be null,
    -- with the single allowed exception: hispanic=true AND race IS NULL
    -- (= 'Hispanic/Latina/e/o Only' respondents who specified no racial group).
    CONSTRAINT pit_counts_race_hispanic_cooccur
        CHECK (
            (race IS NULL AND hispanic IS NULL)                -- neither disaggregated
            OR (race IS NOT NULL AND hispanic IS NOT NULL)     -- both present (race + ethnicity rows)
            OR (race IS NULL AND hispanic = true)              -- Hispanic-only (no race specified)
        ),

    CONSTRAINT pit_counts_race_values
        CHECK (race IN (
            'american_indian_alaska_native_indigenous',
            'asian',
            'black',
            'middle_eastern_north_african',
            'multi_racial',
            'native_hawaiian_pacific_islander',
            'white'
        ) OR race IS NULL),

    CONSTRAINT pit_counts_gender_values
        CHECK (gender IN (
            'woman', 'man', 'transgender', 'gender_questioning', 'non_binary',
            'more_than_one_gender', 'culturally_specific_identity', 'different_identity'
        ) OR gender IS NULL)
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX pit_counts_year_coc       ON pit_counts (year, coc_id);
CREATE INDEX pit_counts_dimension_set  ON pit_counts (dimension_set);
CREATE INDEX pit_counts_shelter        ON pit_counts (shelter);
CREATE INDEX pit_counts_in_family      ON pit_counts (in_family);
CREATE INDEX pit_counts_race_hispanic  ON pit_counts (race, hispanic);

-- ---------------------------------------------------------------------------
-- 4. Coverage materialized view
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW pit_coverage AS
SELECT
    year,
    dimension_set,
    count(*) AS row_count
FROM pit_counts
GROUP BY year, dimension_set
ORDER BY year, dimension_set;

-- Allows fast point lookups: WHERE year = X AND dimension_set = Y
CREATE UNIQUE INDEX pit_coverage_year_ds ON pit_coverage (year, dimension_set);
