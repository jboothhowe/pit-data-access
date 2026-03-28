# PIT Count Data — Dimension Definitions and Schema

**Source file:** `data/ac-pit-data.csv`
**Rows:** 18 (one per year, 2007–2024, single CoC: CA-502, Oakland/Berkeley/Alameda County)
**Source columns:** 1,309 total (5 metadata + 1,304 count columns)

---

## 1. Dimension Definitions

The following dimensions are encoded in source column names. Non-demographic metadata columns (`Year`, `CoC Number`, `CoC Name`, `CoC Category`, `Count Types`) are excluded from analysis.

### 1.1 Shelter Type

**Narrow column name:** `shelter`
**Data type:** `text` (enum)
**Null meaning:** not applicable (every row has a shelter value)

Source column prefix → normalized enum value:

| Source prefix | Normalized value | Notes |
|---|---|---|
| `Overall ...` | `overall` | Aggregate of all shelter types — **redundant** |
| `Sheltered Total ...` | `sheltered_total` | Aggregate of ES + TH + SH — **redundant** |
| `Sheltered ES ...` | `es` | Emergency shelter — **atomic** |
| `Sheltered TH ...` | `th` | Transitional housing — **atomic** |
| `Sheltered SH ...` | `sh` | Safe haven — **atomic** |
| `Unsheltered ...` | `unsheltered` | Unsheltered — **atomic** |

Only the four **atomic** shelter values (`es`, `th`, `sh`, `unsheltered`) appear in retained rows. The `overall` and `sheltered_total` values appear only in redundant aggregate columns.

---

### 1.2 Household Type

**Narrow column name:** `household`
**Data type:** `text` (enum), nullable
**Null meaning:** column is not filtered by household type (the row covers all household types combined)

Source household phrase (appears after the shelter prefix in base column name) → normalized enum:

| Source phrase | Normalized value | Notes |
|---|---|---|
| `Homeless Individuals` | `individual` | People living outside family households |
| `Homeless People in Families` | `family` | People living within family household groups |
| `Homeless Family Households` | `family_households` | **Count of household units**, not people |
| `Homeless Veterans` | `veteran` | Cross-cutting subset; not a partition of the population |
| `Homeless Unaccompanied Youth (Under 25)` | `unaccompanied_youth` | Youth aged <25 without guardian |
| `Homeless Unaccompanied Youth Under 18` | `unaccompanied_youth_under18` | Age sub-group of unaccompanied youth |
| `Homeless Unaccompanied Youth Age 18-24` | `unaccompanied_youth_18_24` | Age sub-group of unaccompanied youth |
| `Homeless Parenting Youth (Under 25)` | `parenting_youth` | Youth parents aged <25 |
| `Homeless Parenting Youth Under 18` | `parenting_youth_under18` | Age sub-group of parenting youth |
| `Homeless Parenting Youth Age 18-24` | `parenting_youth_18_24` | Age sub-group of parenting youth |
| `Homeless Children of Parenting Youth` | `children_of_parenting_youth` | Children in parenting youth households |
| `Chronically Homeless` | `chronically_homeless` | Long-term homeless cross-cut |
| `Chronically Homeless Individuals` | `chronically_homeless_individuals` | Chronically homeless individuals |
| `Chronically Homeless People in Families` | `chronically_homeless_family` | Chronically homeless family members |

**Notes on household semantics:**
- `individual` and `family` form an exhaustive partition of the total count for any given shelter type. Confirmed: `es_individual + es_family = es_total`, `th_individual + th_family = th_total`, `unsheltered_individual + unsheltered_family = unsheltered_total` (all spot-checked 2021–2024). For `sh`: no `family` rows exist, and `sh_individual = sh_total`.
- All other household values (`veteran`, `unaccompanied_youth`, `parenting_youth`, etc.) are **cross-cutting subsets**, not a partition. They cannot be summed to recover the total.
- `family_households` counts **household units**, not persons. It is not additive with person-count columns.

---

### 1.3 Age Range

**Narrow column name:** `age_upper`
**Data type:** `int`, nullable
**Null meaning:** column is not filtered by age range

Source string → integer upper bound:

| Source string | Upper bound integer | Notes |
|---|---|---|
| `Under 18` | `17` | Ages 0–17 |
| `Age 18 to 24` | `24` | Ages 18–24 |
| `Age 25 to 34` | `34` | Ages 25–34 |
| `Age 35 to 44` | `44` | Ages 35–44 |
| `Age 45 to 54` | `54` | Ages 45–54 |
| `Age 55 to 64` | `64` | Ages 55–64 |
| `Over 64` | `110` | Ages 65+ (open-ended, capped at 110) |
| `Over 24` | `110` | Ages 25+ (open-ended) — **see anomaly §5.1** |

**Age data availability by year:**

- 2007–2012: No age breakdown data (all age columns null).
- 2013–2022: Only `Under 18`, `Age 18 to 24`, and `Over 24` are populated. The `Over 24` column is the sole representation of all ages above 24.
- 2023: Only granular ages populated (`Age 25 to 34` through `Over 64`); `Over 24` is null.
- 2024: Both `Over 24` and all granular ages are populated; `Over 24` = sum of `Age 25 to 34` through `Over 64` (confirmed).

Age breakdowns exist only for `individual` and `family` household types.

---

### 1.4 Gender

**Narrow column name:** `gender`
**Data type:** `text` (enum), nullable
**Null meaning:** column is not filtered by gender

Source string → normalized enum value:

| Source string | Normalized value |
|---|---|
| `Woman` | `woman` |
| `Man` | `man` |
| `Transgender` | `transgender` |
| `Gender Questioning` | `gender_questioning` |
| `Non Binary` | `non_binary` |
| `More Than One Gender` | `more_than_one_gender` |
| `Culturally Specific Identity` | `culturally_specific_identity` |
| `Different Identity` | `different_identity` |

Gender values are an **exhaustive partition** of the total. Confirmed for 2024: sum of all 8 gender values = `Overall Homeless` total.

Gender breakdowns exist for household types: `individual`, `family`, `veteran`, `unaccompanied_youth`, `parenting_youth`.

---

### 1.5 Race / Ethnicity

The source data uses a two-axis model:
- **Race (any):** counts all people who selected that race, regardless of other selections (includes multi-racial).
- **Race (only):** counts people who selected only that single race.
- **Race + Hispanic:** counts people who selected that race AND identified as Hispanic/Latina/e/o.

These three columns are related by the identity: **race(any) = race_only + race_and_hispanic** (confirmed 2024 for Black: 3,912 = 3,825 + 87).

Additionally:
- **Hispanic** total = sum of all `race_and_hispanic` combinations + `Hispanic/Latina/e/o Only` (confirmed 2024: 2,129 = 138+10+87+3+19+354+58+1,460).
- **Non-Hispanic** total = sum of all `race_only` values (confirmed 2024: 7,321 = 120+443+3,825+43+110+2,456+324).
- `race_only + race_and_hispanic` across all categories sums to `Overall Homeless` total (confirmed 2024: 9,450).

**Race dimension (`race_only` sub-type):**

**Narrow column name:** `race`
**Data type:** `text`, nullable
**Null meaning:** column is not filtered by race/ethnicity

Source string (appears as `"<Race> Only"` in column name) → canonical enum:

| Source string (base) | Canonical enum |
|---|---|
| `American Indian, Alaska Native, or Indigenous Only` | `american_indian_alaska_native_indigenous` |
| `Asian or Asian American Only` | `asian` |
| `Black, African American, or African Only` | `black` |
| `Middle Eastern or North African Only` | `middle_eastern_north_african` |
| `Native Hawaiian or Other Pacific Islander Only` | `native_hawaiian_pacific_islander` |
| `White Only` | `white` |
| `Multi-Racial Only` | `multi_racial` |
| `Hispanic/Latina/e/o Only` | `hispanic` |

**Race + Ethnicity dimension (`race_and_hispanic` sub-type):**

Source string → normalized comma-separated value (alphabetically ordered):

| Source string | Normalized value |
|---|---|
| `American Indian, Alaska Native, or Indigenous and Hispanic/Latina/e/o` | `american_indian_alaska_native_indigenous,hispanic` |
| `Asian or Asian American and Hispanic/Latina/e/o` | `asian,hispanic` |
| `Black, African American, or African and Hispanic/Latina/e/o` | `black,hispanic` |
| `Middle Eastern or North African and Hispanic/Latina/e/o` | `hispanic,middle_eastern_north_african` |
| `Native Hawaiian or Other Pacific Islander and Hispanic/Latina/e/o` | `hispanic,native_hawaiian_pacific_islander` |
| `White and Hispanic/Latina/e/o` | `hispanic,white` |
| `Multi-Racial and Hispanic/Latina/e/o` | `hispanic,multi_racial` |

---

## 2. Race Enum List

Canonical lowercase enum values for the `race` column (single-race identifiers):

```
american_indian_alaska_native_indigenous
asian
black
hispanic
middle_eastern_north_african
multi_racial
native_hawaiian_pacific_islander
white
```

When a person identifies as both a racial group and Hispanic/Latino, the `race` column value for that row is a **comma-separated, alphabetically ordered** combination:

```
american_indian_alaska_native_indigenous,hispanic
asian,hispanic
black,hispanic
hispanic,middle_eastern_north_african
hispanic,multi_racial
hispanic,native_hawaiian_pacific_islander
hispanic,white
```

**SQL storage options for `race`:**
- **`text` (comma-separated):** Simple to store; queryable with `WHERE race = 'black,hispanic'` for exact match or `WHERE race LIKE '%black%'` / `position('black' in race) > 0` for inclusive. Tradeoff: loose string matching risks false positives on names that share substrings (unlikely with these values but possible).
- **`text[]` (PostgreSQL array):** Enables clean `WHERE 'black' = ANY(race)` queries and `@>` containment operators. Requires array-aware application code. Tradeoff: less portable across databases; requires unnesting for certain aggregations.

Recommendation: Use `text` for simplicity given the small, non-overlapping enum vocabulary; document that queries must use exact enum strings.

---

## 3. Age Range Mapping

| Source string | Normalized upper bound | Years active |
|---|---|---|
| `Under 18` | `17` | 2013–2024 (null 2007–2012) |
| `Age 18 to 24` | `24` | 2013–2024 (null 2007–2012) |
| `Over 24` | `110` (open-ended) | 2013–2022, 2024; null in 2023 — **see anomaly §5.1** |
| `Age 25 to 34` | `34` | 2023–2024 only |
| `Age 35 to 44` | `44` | 2023–2024 only |
| `Age 45 to 54` | `54` | 2023–2024 only |
| `Age 55 to 64` | `64` | 2023–2024 only |
| `Over 64` | `110` (open-ended) | 2023–2024 only |

**Note:** Both `Over 24` and `Over 64` map to upper bound `110`. A query filtering `WHERE age_upper = 110` will return rows from both source ranges. Consumers must also filter `WHERE source_column LIKE '%Over 64%'` or use `dimension_set` to distinguish them.

---

## 4. Dimension Set Catalog

A **dimension set** identifies the specific combination of dimensions encoded in a source column. The `dimension_set` tag must be used to prevent double-counting in queries: always filter to a single dimension set before summing.

### 4.1 All dimension sets in source data (pre-exclusion)

| Dimension set tag | Example source column | Column count |
|---|---|---|
| `shelter` | `Overall Homeless` | 6 |
| `shelter+age` | `Overall Homeless - Under 18` | 48 |
| `shelter+gender` | `Overall Homeless - Woman` | 48 |
| `shelter+ethnicity` | `Overall Homeless - Hispanic/Latina/e/o` | 12 |
| `shelter+race` | `Overall Homeless - Black, African American, or African` | 42 |
| `shelter+race_only` | `Overall Homeless - Black, African American, or African Only` | 48 |
| `shelter+race_and_hispanic` | `Overall Homeless - Black, African American, or African and Hispanic/Latina/e/o` | 42 |
| `shelter+household` | `Overall Homeless Individuals` | 74 |
| `shelter+household+age` | `Overall Homeless Individuals - Under 18` | 88 |
| `shelter+household+gender` | `Overall Homeless Individuals - Woman` | 224 |
| `shelter+household+ethnicity` | `Overall Homeless Individuals - Non-Hispanic/Latina/e/o` | 56 |
| `shelter+household+race` | `Overall Homeless Individuals - Black, African American, or African` | 196 |
| `shelter+household+race_only` | `Overall Homeless Individuals - Black, African American, or African Only` | 224 |
| `shelter+household+race_and_hispanic` | `Overall Homeless Individuals - Black, African American, or African and Hispanic/Latina/e/o` | 196 |

**Total:** 1,304 count columns across 14 dimension sets.

### 4.2 Retained dimension sets (post-exclusion)

After applying the exclusion rule (Section 9), the following dimension sets are retained in the fact table:

| Dimension set tag | Example source column | Retained column count | Shelter values | Household values |
|---|---|---|---|---|
| `shelter+household` | `Sheltered ES Homeless Individuals` | 46 | es, th, sh, unsheltered | individual, family, family_households, veteran, unaccompanied_youth, unaccompanied_youth_under18, unaccompanied_youth_18_24, parenting_youth, parenting_youth_under18, parenting_youth_18_24, children_of_parenting_youth, chronically_homeless, chronically_homeless_individuals, chronically_homeless_family |
| `shelter+household+age` | `Sheltered ES Homeless Individuals - Under 18` | 56 | es, th, sh, unsheltered | individual, family |
| `shelter+household+gender` | `Sheltered ES Homeless Individuals - Woman` | 144 | es, th, sh, unsheltered | individual, family, veteran, unaccompanied_youth, parenting_youth |
| `shelter+household+race_only` | `Sheltered ES Homeless Individuals - Black, African American, or African Only` | 144 | es, th, sh, unsheltered | individual, family, veteran, unaccompanied_youth, parenting_youth |
| `shelter+household+race_and_hispanic` | `Sheltered ES Homeless Individuals - Black, African American, or African and Hispanic/Latina/e/o` | 126 | es, th, sh, unsheltered | individual, family, veteran, unaccompanied_youth, parenting_youth |

**Total retained columns:** 516

---

## 5. Anomalies and Ambiguities

### 5.1 `Over 24` age range — temporally shifting definition

`Over 24` appears in source columns from 2013 to 2022 (and 2024) as the **only** representation of everyone aged 25 and older. In those years, no finer age breakdown above 24 exists in the data. Starting in 2023, granular age buckets (`Age 25 to 34` through `Over 64`) were reported instead.

In 2024, **both** `Over 24` and the granular ages are populated simultaneously. Spot-check confirmed that 2024 `Over 24` = sum of `Age 25 to 34` + `Age 35 to 44` + `Age 45 to 54` + `Age 55 to 64` + `Over 64` (8,596 = 1,696 + 2,439 + 2,069 + 1,733 + 659).

**Impact:** `Over 24` rows cannot be joined or compared with `Age 25 to 34` / `Over 64` rows without disambiguation. If both are loaded into the fact table, a naive `WHERE age_upper = 110` would return double-counted records in 2024. Two options:

- **Option A (recommended):** Treat `Over 24` as a redundant aggregate in all years where the granular ages also exist (2024 onward), and retain it only for years where no finer breakdown is available (2013–2022 and any future year that reverts to the coarser format). Flag rows with a `source_column` that includes `Over 24` so consumers can filter.
- **Option B:** Load both and require consumers to always filter by `source_column` or a derived `age_format` column.

This requires **human review before loading.**

### 5.2 `Sheltered SH Homeless People in Families` — column absent

Safe haven (`sh`) has no "People in Families" household type. All SH counts are individuals-only. The column `Sheltered SH Homeless People in Families` does not exist in the source. As a result, `Sheltered SH Homeless` = `Sheltered SH Homeless Individuals` (verified: both equal 11 in 2024). The redundancy rule treats `sh+no_hh+no_sub` as derivable from `sh+individual` (the family component is implicitly zero).

### 5.3 `Family Households` — different unit from all other counts

Columns with `Homeless Family Households` count **households** (family units), not persons. Examples:

- `Overall Homeless Family Households` = 237 (2024)
- `Overall Homeless People in Families` = 699 (2024)

These measure different things and cannot be added to person-count columns. In the narrow table, `household = 'family_households'` rows should be clearly documented as counting units rather than persons. Consider adding a `unit` column (`person` vs `household`) or a boolean `is_household_count` column to the schema.

### 5.4 `Chronically Homeless` — sparse sub-dimension coverage

Chronically homeless columns (`chronically_homeless`, `chronically_homeless_individuals`, `chronically_homeless_family`) have **no** gender, race, age, or ethnicity sub-dimensions. They appear only at the `shelter+household` level. This is expected (the source data does not report sub-dimensions for this population), but consumers should be aware that no demographic breakdown is available for the chronically homeless population.

Additionally, `chronically_homeless` and `chronically_homeless_individuals` coexist for some shelter types (e.g., `Sheltered SH Chronically Homeless` = 8 and `Sheltered SH Chronically Homeless Individuals` = 8 in 2024). For SH, these are the same because SH has no families. For ES, they differ:

- Spot check recommended before using these columns to confirm that `chronically_homeless` = `chronically_homeless_individuals` + `chronically_homeless_family` where both exist.

### 5.5 `Unsheltered Homeless People in Families` — unexpected TH absence

Transitional housing (`th`) has a `People in Families` household type (and `Individuals`), but the Sheltered TH dimension set does **not** include `Chronically Homeless` household types. `Sheltered TH Chronically Homeless` does not appear as a column. This differs from ES and SH which both have chronically homeless columns. This is likely intentional (TH typically does not serve chronically homeless under HUD definitions), but is worth noting for consumers expecting symmetric coverage.

### 5.6 `unaccompanied_youth_under18` and `unaccompanied_youth_18_24` — age sub-groups of a cross-cutting subset

These are age breakdowns of `unaccompanied_youth (under 25)`. Confirmed: `unaccompanied_youth_under18 + unaccompanied_youth_18_24 = unaccompanied_youth (total)` (verified 2024: 26 + 371 = 397). The same applies for parenting youth.

These sub-groups appear **only** as `shelter+household` (no further gender/race sub-dimensions), unlike the parent `unaccompanied_youth` which does have gender and race sub-dimensions.

### 5.7 Early years (2007–2012) — sparse data

For years 2007–2012, the CSV contains data only for the top-level counts (e.g., `Overall Homeless`, `Sheltered ES Homeless Individuals`, `Sheltered TH Homeless`). Age, gender, race, and household sub-dimensions are largely null for these years. In 2007 and 2008, several columns have **identical values** (possibly a data entry artifact — `Overall Homeless` = 4,838 in both years, `Sheltered ES Homeless` = 992 in both). This should be flagged to the data owner.

---

## 6. Proposed SQL Schema

```sql
CREATE TABLE pit_counts (
    id                serial PRIMARY KEY,

    -- Metadata
    year              int  NOT NULL,
    coc_id            text NOT NULL,   -- e.g. 'CA-502'

    -- Dimensions (null = "not disaggregated in source data", NOT "unknown")
    shelter           text NOT NULL,
        -- Values: 'es', 'th', 'sh', 'unsheltered'
        -- 'overall' and 'sheltered_total' are excluded as redundant aggregates

    household         text,
        -- Values: 'individual', 'family', 'family_households', 'veteran',
        --         'unaccompanied_youth', 'unaccompanied_youth_under18', 'unaccompanied_youth_18_24',
        --         'parenting_youth', 'parenting_youth_under18', 'parenting_youth_18_24',
        --         'children_of_parenting_youth', 'chronically_homeless',
        --         'chronically_homeless_individuals', 'chronically_homeless_family'
        -- null = total population (no household filter)

    age_upper         int,
        -- Upper bound of age range (17, 24, 34, 44, 54, 64, 110)
        -- null = not disaggregated by age
        -- NOTE: both 'Over 24' (110) and 'Over 64' (110) map here; use source_column to distinguish

    gender            text,
        -- Values: 'woman', 'man', 'transgender', 'gender_questioning', 'non_binary',
        --         'more_than_one_gender', 'culturally_specific_identity', 'different_identity'
        -- null = not disaggregated by gender

    race              text,
        -- Single race: 'american_indian_alaska_native_indigenous', 'asian', 'black',
        --              'hispanic', 'middle_eastern_north_african', 'multi_racial',
        --              'native_hawaiian_pacific_islander', 'white'
        -- Multi-identity: comma-separated, alphabetically ordered, e.g. 'black,hispanic'
        -- null = not disaggregated by race
        --
        -- This column represents either race_only OR race_and_hispanic depending on dim_set.
        -- Use dimension_set to distinguish:
        --   dimension_set = 'shelter+household+race_only'        → single-race-only respondents
        --   dimension_set = 'shelter+household+race_and_hispanic' → respondents selecting race + Hispanic

        -- ALTERNATIVE: text[] (PostgreSQL array)
        -- race  text[]
        -- Enables: WHERE 'black' = ANY(race), WHERE race @> ARRAY['black','hispanic']
        -- Tradeoff: requires unnesting for count aggregations; less portable

    -- Fact
    count             int  NOT NULL,

    -- Provenance and double-count prevention
    dimension_set     text NOT NULL,
        -- Tag identifying the combination of non-null dimensions encoded in this row.
        -- Always filter to a single dimension_set before aggregating to avoid double-counting.
        -- Values: 'shelter+household', 'shelter+household+age', 'shelter+household+gender',
        --         'shelter+household+race_only', 'shelter+household+race_and_hispanic'

    source_column     text NOT NULL,
        -- Exact source column name from the CSV, preserved for provenance.
        -- Example: 'Sheltered ES Homeless Individuals - Black, African American, or African Only'

    -- Optional: distinguish person counts from household-unit counts
    count_unit        text NOT NULL DEFAULT 'person'
        -- 'person' for all rows except household='family_households' rows
        -- 'household' for family_households rows
);

-- Recommended indexes
CREATE INDEX pit_counts_year_coc ON pit_counts (year, coc_id);
CREATE INDEX pit_counts_dimension_set ON pit_counts (dimension_set);
CREATE INDEX pit_counts_shelter_household ON pit_counts (shelter, household);
```

**Notes on the race column design:**

Using `text` (comma-separated) is recommended for this dataset given:
- The enum vocabulary is small (8 values) with no ambiguous substrings.
- `WHERE race = 'black'` for single-race queries works cleanly.
- `WHERE race LIKE '%black%'` or `position('black' in race) > 0` for "includes black" queries works without false positives.
- `WHERE race = 'black,hispanic'` for the exact bi-identity combination works cleanly.

If using `text[]`, replace with:
```sql
race  text[]
-- WHERE 'black' = ANY(race)
-- WHERE race @> ARRAY['black', 'hispanic']
-- WHERE array_length(race, 1) = 1  -- single-race only rows
```

---

## 7. Redundant Aggregate Column List

**788 columns are excluded** from the narrow fact table because their values are derivable by summing more granular rows. They are grouped below by redundancy reason.

### 7.1 shelter = `overall` (231 columns)

All columns with the `Overall ...` prefix are sums of the four atomic shelter types (es, th, sh, unsheltered). Confirmed spot-check (2017–2019, 2024): `Overall Homeless` = `Sheltered ES Homeless` + `Sheltered TH Homeless` + `Sheltered SH Homeless` + `Unsheltered Homeless`.

Examples (representative, not exhaustive):
- `Overall Homeless`
- `Overall Homeless - Under 18`
- `Overall Homeless - Woman`
- `Overall Homeless - Black, African American, or African Only`
- `Overall Homeless Individuals`
- `Overall Homeless Individuals - Woman`
- `Overall Homeless People in Families - Black, African American, or African Only`
- `Overall Homeless Veterans - Woman`
- `Overall Chronically Homeless`
- ... (231 total)

### 7.2 shelter = `sheltered_total` (231 columns)

All columns with the `Sheltered Total ...` prefix are sums of ES + TH + SH. Confirmed spot-check (2017–2019, 2024): `Sheltered Total Homeless` = `Sheltered ES Homeless` + `Sheltered TH Homeless` + `Sheltered SH Homeless`.

Examples:
- `Sheltered Total Homeless`
- `Sheltered Total Homeless - Under 18`
- `Sheltered Total Homeless Individuals`
- `Sheltered Total Homeless Veterans - Woman`
- ... (231 total)

### 7.3 race(any) columns (154 columns)

Columns where the sub-dimension is a race name **without** the `Only` suffix and **without** `and Hispanic/Latina/e/o`. These count all people selecting that race regardless of other identities. The identity `race(any) = race_only + race_and_hispanic` holds precisely (confirmed 2024 for Black: 3,912 = 3,825 + 87). Including both would double-count multi-racial respondents.

Examples:
- `Sheltered ES Homeless Individuals - American Indian, Alaska Native, or Indigenous`
- `Sheltered ES Homeless Individuals - Asian or Asian American`
- `Sheltered ES Homeless Individuals - Black, African American, or African`
- `Sheltered ES Homeless Individuals - Middle Eastern or North African`
- `Sheltered ES Homeless Individuals - Native Hawaiian or Other Pacific Islander`
- `Sheltered ES Homeless Individuals - White`
- `Sheltered ES Homeless Individuals - Multi-Racial`
- ... (154 total, 7 race groups × all shelter/household combinations)

### 7.4 Ethnicity columns — Hispanic and Non-Hispanic (44 columns)

`Hispanic/Latina/e/o` and `Non-Hispanic/Latina/e/o` sub-dimensions are derivable from the race_only/race_and_hispanic decomposition:
- `Non-Hispanic` = sum of all `race_only` values (confirmed 2024: 7,321).
- `Hispanic` = sum of all `race_and_hispanic` values + `Hispanic/Latina/e/o Only` (confirmed 2024: 2,129).

Examples:
- `Sheltered ES Homeless - Hispanic/Latina/e/o`
- `Sheltered ES Homeless - Non-Hispanic/Latina/e/o`
- `Sheltered ES Homeless Individuals - Hispanic/Latina/e/o`
- `Sheltered ES Homeless Individuals - Non-Hispanic/Latina/e/o`
- ... (44 total, 2 ethnicity values × all shelter/household combos that have ethnicity data)

### 7.5 Atomic shelter, no household filter, with sub-dimension (124 columns)

Columns such as `Sheltered ES Homeless - Under 18` (shelter = es, household = null, age = 17) are derivable as the sum of `Sheltered ES Homeless Individuals - Under 18` + `Sheltered ES Homeless People in Families - Under 18`. Confirmed spot-check 2024: ES Under 18 = 247 = 15 (individual) + 232 (family); TH Woman = 301 = 174 + 127; Unsheltered Woman = 1,719 = 1,678 + 41.

For SH specifically, no "family" household exists, so `Sheltered SH Homeless - Under 18` = `Sheltered SH Homeless Individuals - Under 18` (family contribution = 0).

This group covers 31 sub-dimensions × 4 atomic shelter types = 124 columns:
- 8 age values × 4 shelters = 32 age columns
- 8 gender values × 4 shelters = 32 gender columns
- 8 race_only values × 4 shelters = 32 race_only columns
- 7 race_and_hispanic values × 4 shelters = 28 race_and_hispanic columns

Examples:
- `Sheltered ES Homeless - Under 18`
- `Sheltered ES Homeless - Woman`
- `Sheltered ES Homeless - Black, African American, or African Only`
- `Sheltered TH Homeless - Age 18 to 24`
- `Unsheltered Homeless - White and Hispanic/Latina/e/o`
- ... (124 total)

### 7.6 Atomic shelter, no household filter, no sub-dimension (4 columns)

The four columns representing total counts per atomic shelter type with no further breakdown are also derivable as `individual + family`:

- `Sheltered ES Homeless` = `Sheltered ES Homeless Individuals` + `Sheltered ES Homeless People in Families` (confirmed 2024: 2,271 = 1,868 + 403)
- `Sheltered TH Homeless` = `Sheltered TH Homeless Individuals` + `Sheltered TH Homeless People in Families` (confirmed 2024: 825 = 635 + 190)
- `Sheltered SH Homeless` = `Sheltered SH Homeless Individuals` (confirmed 2024: 11 = 11, no family in SH)
- `Unsheltered Homeless` = `Unsheltered Homeless Individuals` + `Unsheltered Homeless People in Families` (confirmed 2024: 6,343 = 6,237 + 106)

---

## 8. Retained Dimension Sets

After excluding all redundant aggregate columns (Section 7), **516 columns** are retained. These form 5 maximally disaggregated dimension sets:

### `shelter+household` — 46 columns

Per-shelter-type totals broken down by household type. Covers all 14 household types across 4 atomic shelter types (with some gaps where certain shelter types do not serve certain populations, e.g., SH has no `family` or `parenting_youth`).

**Shelter values:** `es`, `th`, `sh`, `unsheltered`
**Household values:** `individual`, `family`, `family_households`, `veteran`, `unaccompanied_youth`, `unaccompanied_youth_under18`, `unaccompanied_youth_18_24`, `parenting_youth`, `parenting_youth_under18`, `parenting_youth_18_24`, `children_of_parenting_youth`, `chronically_homeless`, `chronically_homeless_individuals`, `chronically_homeless_family`

Example retained columns:
- `Sheltered ES Homeless Individuals`
- `Sheltered ES Homeless People in Families`
- `Sheltered ES Homeless Family Households`
- `Sheltered ES Homeless Veterans`
- `Sheltered ES Homeless Unaccompanied Youth (Under 25)`
- `Sheltered ES Homeless Chronically Homeless`
- `Unsheltered Homeless Parenting Youth (Under 25)`
- `Unsheltered Homeless Children of Parenting Youth`

### `shelter+household+age` — 56 columns

Per-shelter-type, per-household-type counts broken down by age range. Available only for `individual` and `family` household types. Age data only populated from 2013 onward (see anomaly §5.1).

**Shelter values:** `es`, `th`, `sh`, `unsheltered`
**Household values:** `individual`, `family`
**Age upper bounds:** 17, 24, 34, 44, 54, 64, 110 (and also 110 for `Over 24` in earlier years — see anomaly §5.1)

Example retained columns:
- `Sheltered ES Homeless Individuals - Under 18`
- `Sheltered ES Homeless Individuals - Age 18 to 24`
- `Unsheltered Homeless People in Families - Over 64`

### `shelter+household+gender` — 144 columns

Per-shelter-type, per-household-type counts broken down by gender. Available for `individual`, `family`, `veteran`, `unaccompanied_youth`, and `parenting_youth` household types.

**Shelter values:** `es`, `th`, `sh`, `unsheltered`
**Household values:** `individual`, `family`, `veteran`, `unaccompanied_youth`, `parenting_youth`
**Gender values:** `woman`, `man`, `transgender`, `gender_questioning`, `non_binary`, `more_than_one_gender`, `culturally_specific_identity`, `different_identity`

Example retained columns:
- `Sheltered ES Homeless Individuals - Woman`
- `Unsheltered Homeless Veterans - Transgender`
- `Sheltered TH Homeless Unaccompanied Youth (Under 25) - Non Binary`

### `shelter+household+race_only` — 144 columns

Per-shelter-type, per-household-type counts for respondents who selected **only** that single racial identity (and are not Hispanic). This is the "race alone, non-Hispanic" count.

**Shelter values:** `es`, `th`, `sh`, `unsheltered`
**Household values:** `individual`, `family`, `veteran`, `unaccompanied_youth`, `parenting_youth`
**Race values:** `american_indian_alaska_native_indigenous`, `asian`, `black`, `hispanic`, `middle_eastern_north_african`, `multi_racial`, `native_hawaiian_pacific_islander`, `white`

Note: `hispanic` appears here as `Hispanic/Latina/e/o Only` — people who identified as Hispanic and no racial group.

Example retained columns:
- `Sheltered ES Homeless Individuals - Black, African American, or African Only`
- `Unsheltered Homeless Veterans - White Only`
- `Sheltered TH Homeless Unaccompanied Youth (Under 25) - Hispanic/Latina/e/o Only`

### `shelter+household+race_and_hispanic` — 126 columns

Per-shelter-type, per-household-type counts for respondents who selected **both** a racial identity **and** Hispanic/Latina/e/o. The `race` column value is the alphabetically sorted comma-separated pair (e.g., `black,hispanic`).

**Shelter values:** `es`, `th`, `sh`, `unsheltered`
**Household values:** `individual`, `family`, `veteran`, `unaccompanied_youth`, `parenting_youth`
**Race values (combined):** `american_indian_alaska_native_indigenous,hispanic`, `asian,hispanic`, `black,hispanic`, `hispanic,middle_eastern_north_african`, `hispanic,multi_racial`, `hispanic,native_hawaiian_pacific_islander`, `hispanic,white`

Note: This set has 126 columns (not 140) because `sh` is missing `family` and `parenting_youth`, reducing coverage for those combinations.

Example retained columns:
- `Sheltered ES Homeless Individuals - Black, African American, or African and Hispanic/Latina/e/o`
- `Unsheltered Homeless Veterans - White and Hispanic/Latina/e/o`
- `Sheltered TH Homeless Parenting Youth (Under 25) - American Indian, Alaska Native, or Indigenous and Hispanic/Latina/e/o`

---

## 9. Exclusion Rule

The following rule is applied to identify redundant aggregate columns. A source column is **excluded** (placed in the redundant list) if **any** of the following conditions holds:

**Rule 1 — Aggregate shelter:** The column's shelter type is `overall` or `sheltered_total`.
- `overall` = derivable as sum of `es` + `th` + `sh` + `unsheltered` (confirmed 2017, 2018, 2019, 2024).
- `sheltered_total` = derivable as sum of `es` + `th` + `sh` (confirmed 2017, 2018, 2019, 2024).

**Rule 2 — Race(any) sub-dimension:** The column encodes a race breakdown using the "any-race" model (source column suffix is a plain race name without "Only" or "and Hispanic/Latina/e/o").
- Derivable as: `race_only` + `race_and_hispanic` for the same race/shelter/household combination (confirmed 2024 for Black).

**Rule 3 — Ethnicity sub-dimension:** The column encodes a Hispanic or Non-Hispanic ethnicity breakdown.
- `Hispanic` = sum of all `race_and_hispanic` values + `Hispanic/Latina/e/o Only` (confirmed 2024).
- `Non-Hispanic` = sum of all `race_only` values across all non-Hispanic races (confirmed 2024).

**Rule 4 — No household filter with sub-dimension:** The column has an atomic shelter type (`es`, `th`, `sh`, `unsheltered`) but no household filter, and encodes a sub-dimension (age, gender, race_only, or race_and_hispanic).
- Derivable as: `(same shelter + individual + same sub-dim)` + `(same shelter + family + same sub-dim)` (confirmed for ES, TH, Unsheltered 2024; SH family contribution is zero).

**Rule 5 — No household filter, no sub-dimension, atomic shelter:** The column is a plain total per atomic shelter type (e.g., `Sheltered ES Homeless`).
- Derivable as: `(same shelter + individual)` + `(same shelter + family)` (confirmed for all four shelter types 2024).

**Re-application note:** When adding new yearly data sheets, apply these 5 rules to each new source column's parsed shelter, household, and sub-dimension values to determine inclusion/exclusion. The rules do not depend on data values — they depend purely on the column name structure.

**Exception to Rule 4 (potential future data):** If a future year introduces columns with atomic shelter + no household + sub-dimension for a population where the individual/family partition does not cover the full total (e.g., if some people are not classified as either individual or family), Rule 4 would not apply and those columns should be retained. Always verify the `individual + family = total` identity holds before applying Rule 4 to new data.

---

## Appendix: Column Count Summary

| Category | Count |
|---|---|
| Total source columns | 1,309 |
| Metadata columns (excluded from fact table) | 5 |
| Count columns analyzed | 1,304 |
| Redundant — shelter=overall | 231 |
| Redundant — shelter=sheltered_total | 231 |
| Redundant — race(any) | 154 |
| Redundant — ethnicity (Hispanic + Non-Hispanic) | 44 |
| Redundant — atomic shelter, no household, with sub-dim | 124 |
| Redundant — atomic shelter, no household, no sub-dim | 4 |
| **Total redundant** | **788** |
| **Retained (fact table)** | **516** |
