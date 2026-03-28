# Data Cleaning Instructions: PIT Count Wide → Narrow Table

## Background

We have a Point-in-Time (PIT) homeless count dataset extracted from a multi-sheet Excel workbook.
The raw data has been extracted into a CSV where:
- Each row represents a single CoC (Continuum of Care) district for a single year
- There is one extremely wide set of columns, where each column encodes a specific demographic aggregation (e.g. `"Unsheltered, Non-Hispanic, Black or African American, 25 to 34"`)
- Not every possible demographic combination has a column — only the combinations the source data chose to report
- It is impossible to disaggregate these combinations further (e.g. we cannot determine gender breakdown within `"Unsheltered, Black, 25-34"`)

## Goal

Transform this wide table into a narrow, normalized table where:
- Each row represents a single count for a specific demographic combination
- Demographic dimensions become separate columns with null meaning "not disaggregated in source data" (not "unknown")
- The original source column name is preserved for provenance
- Double-counting is prevented by tagging each row with a `dimension_set` label

## Your Task

### Step 1: Read and analyze the column names

Read the CSV file and extract all column names. Ignore the following non-demographic metadata columns (or any obviously non-count columns you identify):
- `Year`, `CoC Number`, `CoC Name`, `CoC Category`, and similar identifier fields

For every remaining column, parse its name to identify which demographic dimensions it encodes and what value each dimension takes. You may encounter columns that encode one, two, three, or more dimensions simultaneously.

### Step 2: Identify all dimension types

From your analysis, produce an exhaustive list of every dimension type present in the column names. We anticipate at minimum:

- **Shelter status** (e.g. Sheltered, Unsheltered, Overall/Total)
- **Race / ethnicity**
- **Age range**
- **Gender**
- **Household type** (e.g. Individual, Family/Person in Family, Veteran, Youth, Chronically Homeless)

There may be additional dimensions we haven't anticipated — identify and name them if present.

For each dimension, enumerate every distinct value that actually appears across the column names.

### Step 3: Handle special cases

#### Race / Ethnicity
The source data includes columns for people who identify with multiple racial/ethnic groups simultaneously (e.g. a count for people who are both Black and Hispanic). These must not be collapsed — they are distinct from single-race counts.

Represent race as an **alphabetically ordered, comma-separated list** of canonical race/ethnicity enum values. Examples:
- `"Black or African American"` → `black`
- `"Hispanic or Latino"` → `hispanic`  
- `"Black or African American" + "Hispanic or Latino"` → `black,hispanic`

This allows both exact queries (`WHERE race = 'black,hispanic'`) and inclusive queries (`WHERE race LIKE '%black%'` or using array operators if stored as a postgres array).

Produce a canonical list of all race enum values you find, normalized to lowercase_snake_case.

#### Age Ranges
The source data uses string ranges (e.g. `"18 to 24"`, `"25 to 34"`, `"55 to 64"`, `"65 and over"`).

Represent age as the **integer upper bound** of each range, with the lower bound implicitly being the previous upper bound + 1. Use `110` for any unbounded upper range (e.g. `"65 and over"` → `110`, or whatever the highest open-ended range is).

Produce a mapping of every source age range string → integer upper bound value.

#### "Total" / "Overall" rows
Some columns may represent totals across a dimension (e.g. a count not broken down by gender). These should produce a null in that dimension column, not a value of `"total"`.

### Step 4: Identify all dimension sets

A **dimension set** is the specific combination of dimensions that a column encodes. For example:
- A column encoding only shelter status + race → dimension set `shelter+race`
- A column encoding shelter status + race + age → dimension set `shelter+race+age`
- A column encoding only shelter status → dimension set `shelter`

Enumerate every distinct dimension set that actually appears in the data. This is critical for preventing double-counting in queries — users must be able to filter to a consistent granularity.

### Step 5: Produce the output document

Write a file called `DIMENSIONS.md` containing:

1. **Dimension definitions** — for each dimension: its column name, data type, and all possible values (with source string → normalized value mappings where applicable)

2. **Dimension set catalog** — a table of every dimension set found in the data, with:
   - The `dimension_set` tag string (e.g. `shelter+race+age`)
   - An example source column name
   - The count of columns that belong to this dimension set

3. **Race enum list** — canonical lowercase enum values for race/ethnicity

4. **Age range mapping** — source string → integer upper bound for every age range found

5. **Anomalies or ambiguities** — any column names that were difficult to parse, inconsistent, or didn't fit the dimensional model cleanly. Flag these for human review rather than silently dropping them.

6. **Proposed SQL schema** — a `CREATE TABLE` statement for the narrow `pit_counts` table using the dimensions you've identified, including:
   - `id serial primary key`
   - `year int not null`
   - `coc_id text not null`
   - One column per dimension (nullable, with a comment explaining null semantics)
   - `count int not null`
   - `dimension_set text not null`
   - `source_column text not null`

   For the race column, propose both a `text` (comma-separated) and a `text[]` (postgres array) variant and note the tradeoffs.

### Step 6: Identify and exclude redundant aggregate columns

Some columns are aggregations of other columns in the same dataset — for example, `"Total Homeless in Families"` may be the sum of `"Total Homeless in Families, Under 18"`, `"Total Homeless in Families, 18 to 24"`, etc. We want our fact table to contain only **maximally disaggregated data** and re-derive all aggregates via SQL. Storing both would cause double-counting in any naive sum.

For each dimension set you identify, check whether it is a strict subset of another dimension set's dimensions. For example:
- `shelter+household` is a subset of `shelter+household+age`
- `shelter` is a subset of `shelter+race`

A column belonging to a less-specific dimension set is a **candidate redundant aggregate** if there exist columns in the data that cover the same shelter/household/etc. values at a more granular level.

To confirm a candidate is truly redundant (not just a different slice), check whether the less-specific column's value equals the sum of the more-specific columns that share its non-null dimension values. You do not need to verify this exhaustively — spot-check 2-3 CoC rows and use judgment.

In `DIMENSIONS.md`, produce:

- A **redundant aggregate column list**: every column excluded from the fact table because it is derivable by summing more granular rows, with a note on which dimension set it aggregates over
- A **retained dimension sets list**: the dimension sets that survive after exclusion — these should be the maximally disaggregated sets for each combination of dimensions
- A clear statement of the **exclusion rule** used, so it can be re-applied if new yearly sheets are added later

Columns that are ambiguously redundant (can't confirm by spot-check, or partially overlap with more granular columns) should go in the anomalies section rather than being silently dropped.

## Notes

- Do not drop any columns silently. Every source column should either map to a row in the narrow table, appear in the redundant aggregate list, or appear in the anomalies section.
- Prefer to over-report ambiguities rather than make silent assumptions.
- The output of this task is a human-reviewable document, not a migration script — we will review `DIMENSIONS.md` before generating SQL.
