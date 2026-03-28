# PIT Count Data — Dimension Definitions and Schema

**Source file:** `data/ac-pit-data.csv`
**Rows:** 18 (one per year, 2007–2024, single CoC: CA-502, Oakland/Berkeley/Alameda County)
**Source columns:** 1,309 total (5 metadata + 1,304 count columns)

---

## Design principles

1. Every row represents a maximally disaggregated, atomic count for a specific combination of dimensions.
2. Every dimension is itself maximally atomic — categories that are genuinely separate facts about a person live in separate columns, even when the data does not support combining them. Supported combinations are expressed via dimension set constraints, not by collapsing facts into a single compound column.
3. Null means "not disaggregated in source data for this combination" — never "unknown."
4. A missing row means "not reported for this year" — never "zero." Many dimension combinations are only available for a subset of years (e.g. granular age buckets only exist for 2023–2024; gender/race/youth breakdowns are absent for 2007–2012; chronic data begins around 2013). When a source column is null for a given year, **do not insert a row with count = 0** — simply omit the row. Consumers should treat the absence of a row as "data not available" and avoid inferring a zero count.

This replaces the original monolithic `household` enum with a set of boolean flags, and replaces the original combined `race` column (which conflated race identity and Hispanic ethnicity) with separate `race` and `hispanic` columns.

---

## Feedback evaluation (COMMENTS-ON-DIMENSIONS-1.md)

### Accepted: unbundle household into atomic dimensions

The original `household` text enum packed 14 semantically distinct facts into a single column. The source data supports clean decomposition:

- `in_family` (boolean): individual vs. in-family partition — accepted as-is.
- `veteran` (boolean): accepted as-is.
- `unaccompanied_youth` + `age` (reusing existing age column): accepted — see §1.4.
- `parenting_youth` + `age` (reusing existing age column): accepted — see §1.5.
- `children_of_parenting_youth` (boolean): accepted — see §1.6.
- `chronic` (boolean): accepted — see §1.7.
- `full_household → count_unit`: accepted as concept; renamed to `count_unit` (text: `'person'`/`'household'`) for clarity, which was already proposed in the prior schema. The `family_households` source rows become `in_family=true, count_unit='household'`.

### Accepted: reuse age column for youth age ranges

The source data provides `Unaccompanied Youth Under 18` and `Unaccompanied Youth Age 18-24` as distinct columns. Confirmed: `under_18 + 18–24 = Under-25 total` for all spot-checked years (ES 2021: 8+58=66; 2024: 15+71=86; parenting youth 2024: verified similarly). The Under-25 aggregate rows (`unaccompanied_youth` and `parenting_youth` with no sub-dimension) are therefore redundant and excluded (new rule R6). Retained rows use the existing `age_upper` column to encode the 17 and 24 bounds.

### Accepted: race and hispanic as separate columns

The source uses a "race_only" / "race_and_hispanic" decomposition. These map cleanly to a two-column model: `race` (the racial identity) and `hispanic` (boolean for Hispanic/Latina/e/o identification). `hispanic` is removed from the race enum entirely. See §1.11.

### Accepted: age range handling for early years (§5.1 resolution)

`Over 24` is retained as a real data row for 2013–2022, where it is the sole representation of everyone aged 25+. It is excluded as a redundant aggregate in 2024, where granular age buckets also exist (verified: ES 2024 Over 24 = sum of Age 25–34 through Over 64). This resolves the anomaly without data loss.

### Rejected / clarified: `accompanied_youth: true/null`

This flag does not map to any source column. In standard HUD PIT terminology, "accompanied" youth refers to youth who are with a parent or guardian — which is not a reported category in this dataset. The closest source category is `Homeless Children of Parenting Youth`, which counts the children (likely <18) living with their homeless youth parents. This is represented as `children_of_parenting_youth` (boolean). If the intent was to refer to this population, the proposed boolean is adopted under that name.

Source: https://www.hud.gov/sites/dfiles/OCHCO/documents/2023-11cpdn.pdf

### Note: `chronic: true/false/null` and derived complements

`false` does not appear in the source data — only chronically-homeless-positive populations are reported. However, `chronic=false` rows are **derived** by subtracting the chronic count from the corresponding total individual/family count for the same shelter type (see §10). So `false` does appear in the final fact table, just not as a source column.

---

## 1. Dimension Definitions

Non-demographic metadata columns (`Year`, `CoC Number`, `CoC Name`, `CoC Category`, `Count Types`) are excluded from analysis.

### 1.1 Shelter Type

**Column name:** `shelter`
**Data type:** `text` (enum), NOT NULL
**Null meaning:** N/A — every retained row has a shelter value

| Source prefix | Normalized value | Notes |
|---|---|---|
| `Overall ...` | *(excluded)* | Aggregate of all shelter types — redundant |
| `Sheltered Total ...` | *(excluded)* | Aggregate of ES + TH + SH — redundant |
| `Sheltered ES ...` | `es` | Emergency shelter — atomic |
| `Sheltered TH ...` | `th` | Transitional housing — atomic |
| `Sheltered SH ...` | `sh` | Safe haven — atomic |
| `Unsheltered ...` | `unsheltered` | Unsheltered — atomic |

Only `es`, `th`, `sh`, `unsheltered` appear in retained rows.

---

### 1.2 In-Family Status

**Column name:** `in_family`
**Data type:** `boolean`, nullable
**Null meaning:** count is not disaggregated by family status (e.g. veteran or youth cross-cuts)

| Source phrase | Value |
|---|---|
| `Homeless Individuals` | `false` |
| `Homeless People in Families` | `true` |
| `Homeless Family Households` | `true` (but `count_unit = 'household'` — placed in `shelter+family_unit`, not `shelter+in_family`) |
| `Chronically Homeless Individuals` | `false` |
| `Chronically Homeless People in Families` | `true` |
| Any veteran / youth / children_of_parenting_youth row | `null` |

**Note:** `individual` and `family` person rows (in_family=false/true, count_unit='person') are an exhaustive partition of the total for any given shelter type. Confirmed spot-checks (2021–2024): `es_individual + es_family = es_total`, same for TH and unsheltered. Safe haven has no family rows — `sh_individual = sh_total` (family contribution is implicitly zero).

`family_households` rows (count_unit='household') are separated into the `shelter+family_unit` dimension set because they count household units, not persons, and cannot be summed with person-count rows.

---

### 1.3 Veteran Status

**Column name:** `veteran`
**Data type:** `boolean`, nullable
**Null meaning:** count is not filtered to veterans

| Source phrase | Value |
|---|---|
| `Homeless Veterans` | `true` |
| All other rows | `null` |

Veterans are a cross-cutting subset of the total population — they are not a partition of individual/family and cannot be summed with other cross-cuts without double-counting.

---

### 1.4 Unaccompanied Youth

**Column name:** `unaccompanied_youth`
**Data type:** `boolean`, nullable
**Null meaning:** count is not filtered to unaccompanied youth

| Source phrase | `unaccompanied_youth` | `age_upper` |
|---|---|---|
| `Homeless Unaccompanied Youth (Under 25)` | `true` | `null` — **excluded as redundant (R6)** |
| `Homeless Unaccompanied Youth Under 18` | `true` | `17` |
| `Homeless Unaccompanied Youth Age 18-24` | `true` | `24` |

The Under-25 aggregate is excluded because `under_18 + 18–24 = Under-25 total` (confirmed 2021–2024 across ES, TH, SH, unsheltered). Only the age-disaggregated rows are retained. The `age_upper` column is reused; the associated age ranges are a subset of the general age dimension (only 17 and 24 appear here, not the full adult range).

---

### 1.5 Parenting Youth

**Column name:** `parenting_youth`
**Data type:** `boolean`, nullable
**Null meaning:** count is not filtered to parenting youth

**Definition (HUD CPD-23-11, August 2023, p. 44):**
> "Parenting Youth – A youth who identifies as the parent or legal guardian of one or more children who are present with or sleeping in the same place as that youth parent, where there is no person age 25 or older in the household."

This is a *young person (under 25) who is a parent* — not a parent of any age who has a young child. The age sub-breakdowns (`Under 18` and `Age 18-24`) refer to the age of the parenting youth themselves, not their children. Source: https://www.hud.gov/sites/dfiles/OCHCO/documents/2023-11cpdn.pdf

| Source phrase | `parenting_youth` | `age_upper` |
|---|---|---|
| `Homeless Parenting Youth (Under 25)` | `true` | `null` — **excluded as redundant (R6)** |
| `Homeless Parenting Youth Under 18` | `true` | `17` |
| `Homeless Parenting Youth Age 18-24` | `true` | `24` |

Same redundancy logic as unaccompanied youth: the Under-25 aggregate equals the sum of the two age sub-groups (confirmed 2021–2024). Note: SH has no parenting youth rows at all (source data does not report them for safe haven).

---

### 1.6 Children of Parenting Youth

**Column name:** `children_of_parenting_youth`
**Data type:** `boolean`, nullable
**Null meaning:** count is not filtered to children of parenting youth

| Source phrase | Value |
|---|---|
| `Homeless Children of Parenting Youth` | `true` |
| All other rows | `null` |

These rows count the children (typically under 18) living with their homeless youth parents. They appear only at the `shelter+children_of_parenting_youth` level with no further sub-dimensions (no age, gender, or race breakdown in source data).

**Clarification on `accompanied_youth`:** This column is proposed instead of the suggested `accompanied_youth` flag. The label "accompanied youth" does not correspond to any source column. In HUD PIT data, "accompanied" youth typically refers to youth who are with a parent/guardian — the inverse of "unaccompanied youth" — but this population is not separately reported in the source. The children in parenting-youth households (`children_of_parenting_youth`) are a distinct concept and are named accordingly.

---

### 1.7 Chronic Homelessness

**Column name:** `chronic`
**Data type:** `boolean`, nullable
**Null meaning:** count is not filtered to chronically homeless individuals

| Source phrase | `chronic` | `in_family` |
|---|---|---|
| `Chronically Homeless` (no individual/family split) | `true` | `null` — **excluded as redundant (R7)** |
| `Chronically Homeless Individuals` | `true` | `false` |
| `Chronically Homeless People in Families` | `true` | `true` |

`Chronically Homeless` (the aggregate) is confirmed redundant: `chronically_homeless_individuals + chronically_homeless_family = chronically_homeless` (ES spot-checks: 2021: 845+91=936; 2022: 884+95=979; 2023: 968+89=1057; 2024: 1180+203=1383). For SH, which has no family component, `chronically_homeless_individuals = chronically_homeless` (2021–2024: 14, 12, 11, 8).

**Derived complement (`chronic = false`):** Because `chronic` individuals are a strict subset of the total individual (and family) count, `chronic = false` rows can be safely derived:
- `non_chronic_individual = total_individual − chronic_individual` (for each shelter type where both exist)
- `non_chronic_family = total_family − chronic_family` (ES and unsheltered only; SH has no family)

Spot-checked for positivity across all available years (2019–2024):
- ES: non_chronic_ind ranges from 298 to 842; non_chronic_fam ranges from 190 to 254. All positive. ✓
- SH: non_chronic_ind ranges from 3 to 12. All positive. ✓
- Unsheltered: non_chronic_ind ranges from 3,796 to 5,108; non_chronic_fam ranges from 24 to 290. All positive. ✓

These derived rows are stored with `is_derived = true` and `source_column` set to a synthetic description (e.g., `'<derived> Sheltered ES Non-Chronically Homeless Individuals'`). They belong to the `shelter+chronic+in_family` dimension set alongside the `chronic=true` source rows. See §10 for the derivation procedure.

Chronic breakdowns exist only for `es`, `sh`, and `unsheltered`. `Sheltered TH Chronically Homeless` does not exist in the source (TH does not typically serve chronically homeless under HUD definitions), so no TH complement is possible.

---

### 1.8 Count Unit

**Column name:** `count_unit`
**Data type:** `text`, NOT NULL, DEFAULT `'person'`
**Values:** `'person'` or `'household'`

All rows count persons except rows derived from `Homeless Family Households` source columns, which count household units (family groups), not individuals. Example: `Overall Homeless Family Households = 237` while `Overall Homeless People in Families = 699` (2024) — these measure different things and cannot be summed.

`count_unit = 'household'` rows have `in_family = true` and belong to the dedicated `shelter+family_unit` dimension set (3 source columns: ES, TH, unsheltered — SH has no family rows). They are kept separate from `shelter+in_family`, which contains only person-count rows, so that `SUM(count) WHERE dimension_set = 'shelter+in_family'` is always a homogeneous person total.

---

### 1.9 Age Range

**Column name:** `age_upper`
**Data type:** `smallint`, nullable
**Null meaning:** count is not disaggregated by age

| Source string | Upper bound | Lower bound (implicit) | Notes |
|---|---|---|---|
| `Under 18` | `17` | 0 | |
| `Age 18 to 24` | `24` | 18 | |
| `Age 25 to 34` | `34` | 25 | 2023–2024 only |
| `Age 35 to 44` | `44` | 35 | 2023–2024 only |
| `Age 45 to 54` | `54` | 45 | 2023–2024 only |
| `Age 55 to 64` | `64` | 55 | 2023–2024 only |
| `Over 64` | `110` | 65 | 2023–2024 only |
| `Over 24` | `110` | 25 | 2013–2022 retained; 2024 excluded as redundant |

**Year coverage:**
- 2007–2012: No age data (all age columns null in source).
- 2013–2022: Only `Under 18` (17), `Age 18 to 24` (24), and `Over 24` (110) populated. `Over 24` is the sole 25+ representation for these years and is retained.
- 2023: Only granular ages (34–110) populated; `Over 24` is null.
- 2024: Granular ages populated; `Over 24` is also populated but is confirmed equal to their sum and is therefore excluded.

**Consequence:** In years 2013–2022, `age_upper = 110` means "ages 25 and older (no finer breakdown available)." In 2023+, `age_upper = 110` means "ages 65 and older." These are different intervals. The `source_column` field distinguishes them; alternatively a query can filter `year <= 2022` vs `year >= 2023` when `age_upper = 110`.

Age breakdowns exist for `in_family` rows (individual and family household types) and for `unaccompanied_youth` / `parenting_youth` rows (only age_upper = 17 or 24 for the youth categories).

---

### 1.10 Gender

**Column name:** `gender`
**Data type:** `text` (enum), nullable
**Null meaning:** count is not disaggregated by gender

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

Gender values are an exhaustive partition of the total. Confirmed for 2024: sum of all 8 gender values = total for the corresponding shelter/household combination.

Gender breakdowns exist for `in_family` rows (individual and family), and for `veteran`, `unaccompanied_youth`, and `parenting_youth` cross-cuts.

---

### 1.11 Race and Hispanic Ethnicity

**Two separate columns.** The source data uses a two-axis model that maps cleanly to independent `race` and `hispanic` columns.

---

**Column name:** `race`
**Data type:** `text` (enum), nullable
**Null meaning:** count is not disaggregated by race (includes Hispanic-only rows where no racial group is specified)

| Source string (from `... Only` or `... and Hispanic/Latina/e/o` columns) | Canonical enum |
|---|---|
| `American Indian, Alaska Native, or Indigenous` | `american_indian_alaska_native_indigenous` |
| `Asian or Asian American` | `asian` |
| `Black, African American, or African` | `black` |
| `Middle Eastern or North African` | `middle_eastern_north_african` |
| `Native Hawaiian or Other Pacific Islander` | `native_hawaiian_pacific_islander` |
| `White` | `white` |
| `Multi-Racial` | `multi_racial` |
| `Hispanic/Latina/e/o Only` (no race specified) | `null` |

`hispanic` is removed from the race enum. It is now a separate boolean column.

---

**Column name:** `hispanic`
**Data type:** `boolean`, nullable
**Null meaning:** count is not disaggregated by Hispanic/Latino ethnicity

| Source column suffix | `race` | `hispanic` |
|---|---|---|
| `<Race> Only` | `<canonical race>` | `false` |
| `<Race> and Hispanic/Latina/e/o` | `<canonical race>` | `true` |
| `Hispanic/Latina/e/o Only` | `null` | `true` |

**Verification:** This two-column model fully covers the source data without loss:
- `race(any) = race_only + race_and_hispanic` was the identity used to exclude race(any) columns. In the new model, this is `(race=X, hispanic=false) + (race=X, hispanic=true) = race(any) for X`. The exclusion rule R2 still applies.
- `Non-Hispanic` total = sum of all `(hispanic=false)` rows (confirmed 2024: 7,321).
- `Hispanic` total = sum of all `(hispanic=true)` rows across all race values including null (confirmed 2024: 2,129).

Race/hispanic breakdowns exist for `in_family` rows, and for `veteran`, `unaccompanied_youth`, and `parenting_youth` cross-cuts.

---

## 2. Race Enum List

Canonical lowercase enum values for the `race` column:

```
american_indian_alaska_native_indigenous
asian
black
middle_eastern_north_african
multi_racial
native_hawaiian_pacific_islander
white
```

`hispanic` is NOT in this enum. It is captured separately in the `hispanic` boolean column.

**SQL storage:** `text` enum is recommended given the small, non-overlapping vocabulary. If using a PostgreSQL enum type, declare it separately. Alternatively use `text` with a CHECK constraint.

---

## 3. Age Range Mapping

| Source string | Normalized upper bound | Lower bound | Retained years |
|---|---|---|---|
| `Under 18` | `17` | 0 | 2013–2024 (null 2007–2012) |
| `Age 18 to 24` | `24` | 18 | 2013–2024 (null 2007–2012) |
| `Over 24` | `110` | 25 | 2013–2022 retained; **excluded 2024** |
| `Age 25 to 34` | `34` | 25 | 2023–2024 only |
| `Age 35 to 44` | `44` | 35 | 2023–2024 only |
| `Age 45 to 54` | `54` | 45 | 2023–2024 only |
| `Age 55 to 64` | `64` | 55 | 2023–2024 only |
| `Over 64` | `110` | 65 | 2023–2024 only |

For youth categories (`unaccompanied_youth`, `parenting_youth`), only `Under 18` → 17 and `Age 18-24` → 24 appear.

---

## 4. Dimension Set Catalog

A **dimension set** identifies the specific combination of non-null dimensions encoded in a source column. Always filter to a single dimension set before aggregating to avoid double-counting.

### 4.1 All dimension sets in source data (pre-exclusion)

These are the 14 dimension sets identified from the 1,304 count columns, using the original monolithic household model for reference:

| Dimension set tag (original) | Example source column | Column count |
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

**Total: 1,304 count columns.**

### 4.2 Retained dimension sets (new atomic model, post-exclusion)

After applying all exclusion rules (§9) and adopting the unbundled dimension model, **506 source columns** are retained across **16 dimension sets**:

| Dimension set tag | Example source column | Source cols | Notes |
|---|---|---|---|
| `shelter+in_family` | `Sheltered ES Homeless Individuals` | 7 | Person counts only (4 individual + 3 family); see below |
| `shelter+family_unit` | `Sheltered ES Homeless Family Households` | 3 | Household unit counts; ES, TH, unsheltered only (no SH family) |
| `shelter+in_family+age` | `Sheltered ES Homeless Individuals - Under 18` | 56 | |
| `shelter+in_family+gender` | `Sheltered ES Homeless Individuals - Woman` | 56 | |
| `shelter+in_family+race+hispanic` | `Sheltered ES Homeless Individuals - Black, African American, or African Only` | 105 | |
| `shelter+veteran` | `Sheltered ES Homeless Veterans` | 4 | |
| `shelter+veteran+gender` | `Sheltered ES Homeless Veterans - Woman` | 32 | |
| `shelter+veteran+race+hispanic` | `Sheltered ES Homeless Veterans - Black, African American, or African Only` | 60 | |
| `shelter+unaccompanied_youth+age` | `Sheltered ES Homeless Unaccompanied Youth Under 18` | 8 | |
| `shelter+unaccompanied_youth+gender` | `Sheltered ES Homeless Unaccompanied Youth (Under 25) - Woman` | 32 | |
| `shelter+unaccompanied_youth+race+hispanic` | `Sheltered ES Homeless Unaccompanied Youth (Under 25) - Black, African American, or African Only` | 60 | |
| `shelter+parenting_youth+age` | `Sheltered ES Homeless Parenting Youth Under 18` | 6 | ES, TH, unsheltered only (no SH) |
| `shelter+parenting_youth+gender` | `Sheltered ES Homeless Parenting Youth (Under 25) - Woman` | 24 | |
| `shelter+parenting_youth+race+hispanic` | `Sheltered ES Homeless Parenting Youth (Under 25) - Black, African American, or African Only` | 45 | |
| `shelter+children_of_parenting_youth` | `Sheltered ES Homeless Children of Parenting Youth` | 3 | ES, TH, unsheltered only (no SH) |
| `shelter+chronic+in_family` | `Sheltered ES Chronically Homeless Individuals` | 5 | ES, SH, unsheltered only; +5 derived rows (§10) |

**Total retained source columns: 506.** The fact table will contain additional derived rows (see §10): 5 `chronic=false` rows per year derived from the `shelter+chronic+in_family` set.

**Notes on dimension set structure:**
- `shelter+in_family` is **7 columns** (person counts only): 4 individual (all shelter types) + 3 family person (ES, TH, unsheltered — SH has no family). `SUM(count) WHERE dimension_set = 'shelter+in_family'` is always a homogeneous person total.
- `shelter+family_unit` is the dedicated set for the 3 `Family Households` source columns (count_unit='household'). Never mix with `shelter+in_family` in aggregations.
- `shelter+in_family+race+hispanic` merges what were previously two dimension sets (`race_only` and `race_and_hispanic`). The `hispanic` boolean cleanly distinguishes them.
- `shelter+unaccompanied_youth+gender` and `shelter+parenting_youth+gender` retain the Under-25 aggregate population for gender/race breakdowns — those aggregate rows are not redundant (no finer gender/race breakdown exists within youth). Only the bare totals with no sub-dimension (R6) are excluded.
- `shelter+chronic+in_family` has 5 source columns (not 8) because TH has no chronically homeless data and SH has no family chronic component. Five derived `chronic=false` rows are added per year via §10.

---

## 5. Anomalies and Ambiguities

### 5.1 `Over 24` age range — resolved

`Over 24` coexists with granular adult ages in 2024 only, where it is confirmed redundant (sum of Age 25–34 through Over 64). It is the sole 25+ representation for 2013–2022 and is retained for those years. Rows with `age_upper = 110` and `year <= 2022` represent "ages 25+" while the same value in `year >= 2023` represents "ages 65+". The `source_column` field makes this unambiguous. Consumers grouping across years at `age_upper = 110` should be aware of the different intervals.

### 5.2 `Sheltered SH Homeless People in Families` — column absent

Safe haven has no family rows. `Sheltered SH Homeless` = `Sheltered SH Homeless Individuals` (verified 2021–2024). SH also has no `parenting_youth` rows. The family contribution to SH is implicitly zero for all dimension sets.

### 5.3 `Family Households` — different unit from all other counts

`Homeless Family Households` counts household units, not persons (`in_family = true, count_unit = 'household'`). These 3 source columns (ES, TH, unsheltered) are placed in the dedicated `shelter+family_unit` dimension set to prevent accidental mixing with person-count rows in `shelter+in_family`.

### 5.4 `Chronically Homeless` coverage is sparse

Chronic columns exist only for ES, SH, and unsheltered (not TH). No gender, race, or age sub-dimensions exist for any chronically homeless population. Consumers should document this limitation.

### 5.5 `Chronically Homeless` aggregate vs. individual/family split — resolved

`Chronically Homeless` (no split) is confirmed redundant where `Chronically Homeless Individuals` and `Chronically Homeless People in Families` both exist (ES 2021–2024: all confirmed). Excluded as R7. For SH, `Chronically Homeless Individuals = Chronically Homeless` (no family) — also excluded.

### 5.6 `Sheltered TH` has no Chronically Homeless

TH does not have any `Chronically Homeless` columns in the source data. This is expected under HUD definitions (TH is not typically used for chronically homeless individuals). Not a data error.

### 5.7 `Unaccompanied Youth` and `Parenting Youth` gender/race vs. age granularity mismatch

Gender and race breakdowns for youth use the Under-25 aggregate population (e.g., `Homeless Unaccompanied Youth (Under 25) - Woman`). Age breakdowns for youth use the Under-18 and 18–24 sub-groups. There are no rows that combine both age and gender (or race) for youth. This is a source data limitation — it cannot be resolved in the narrow table. Dimension sets `shelter+unaccompanied_youth+age` and `shelter+unaccompanied_youth+gender` are independent slices that cannot be combined.

### 5.8 Early years (2007–2012) — sparse data

For 2007–2012, only top-level totals are populated. Age, gender, race, and household sub-dimensions are largely null. Additionally, 2007 and 2008 have identical values across many columns (e.g., `Overall Homeless = 4,838` in both years). This may be a data entry artifact and should be flagged to the data owner.

---

## 6. Proposed SQL Schema

```sql
CREATE TABLE pit_counts (
    id                    serial PRIMARY KEY,

    -- Metadata
    year                  smallint NOT NULL,
    coc_id                text     NOT NULL,  -- e.g. 'CA-502'

    -- Shelter (always present)
    shelter               text     NOT NULL,
        -- Values: 'es', 'th', 'sh', 'unsheltered'

    -- In-family status (null = not disaggregated by household type)
    in_family             boolean,
        -- true  = person lives within a family household
        -- false = person lives as an individual (outside family household)
        -- null  = row is a cross-cutting subset (veteran, youth, etc.)

    -- Cross-cutting population flags (null = not filtered to this population)
    veteran               boolean,
        -- true = counted as homeless veteran; null = not filtered
    unaccompanied_youth   boolean,
        -- true = counted as unaccompanied youth (<25); null = not filtered
    parenting_youth       boolean,
        -- true = counted as parenting youth (<25); null = not filtered
    children_of_parenting_youth boolean,
        -- true = counted as child of homeless parenting youth; null = not filtered
    chronic               boolean,
        -- true  = counted as chronically homeless (from source data)
        -- false = derived complement: non-chronically homeless (see §10)
        -- null  = not filtered to chronic status

    -- Age (null = not disaggregated by age)
    age_upper             smallint,
        -- Upper bound of age range: 17, 24, 34, 44, 54, 64, 110
        -- For in_family rows: full adult range 2023+; only 17/24/110 for 2013–2022
        -- For unaccompanied_youth/parenting_youth rows: only 17 and 24
        -- NOTE: age_upper=110 means "25+" for year<=2022, "65+" for year>=2023
        --       (use source_column to disambiguate if needed)

    -- Gender (null = not disaggregated by gender)
    gender                text,
        -- Values: 'woman', 'man', 'transgender', 'gender_questioning', 'non_binary',
        --         'more_than_one_gender', 'culturally_specific_identity', 'different_identity'

    -- Race (null = not disaggregated by race, OR Hispanic-only respondent with no race specified)
    race                  text,
        -- Values: 'american_indian_alaska_native_indigenous', 'asian', 'black',
        --         'middle_eastern_north_african', 'multi_racial',
        --         'native_hawaiian_pacific_islander', 'white'
        -- null when hispanic=true and no racial group selected ('Hispanic/Latina/e/o Only')

    -- Hispanic/Latino ethnicity (null = not disaggregated by ethnicity)
    hispanic              boolean,
        -- true  = respondent identified as Hispanic/Latina/e/o
        -- false = respondent did not identify as Hispanic/Latina/e/o (race-only rows)
        -- null  = row is not disaggregated by ethnicity

    -- Count
    count                 int      NOT NULL,

    -- Count unit (all rows are person-counts except family_households source rows)
    count_unit            text     NOT NULL DEFAULT 'person',
        -- 'person'    = count represents individuals (all rows except family_household source)
        -- 'household' = count represents household units (dimension_set='shelter+family_unit' only)

    -- Provenance and double-count prevention
    dimension_set         text     NOT NULL,
        -- Identifies the combination of non-null dimensions. Always filter to a single
        -- dimension_set before aggregating to prevent double-counting.
        -- Values: see §4.2. Key note: 'shelter+in_family' contains person counts only;
        --         'shelter+family_unit' contains household unit counts — never mix the two.

    source_column         text     NOT NULL,
        -- For source rows: exact column name from the CSV (e.g. 'Sheltered ES Homeless Individuals').
        -- For derived rows: synthetic description (e.g. '<derived> Sheltered ES Non-Chronically Homeless Individuals').

    is_derived            boolean  NOT NULL DEFAULT false
        -- false = row loaded directly from a source CSV column.
        -- true  = row computed as an implicit complement (§10). Currently only chronic=false rows.
);

-- Recommended indexes
CREATE INDEX pit_counts_year_coc         ON pit_counts (year, coc_id);
CREATE INDEX pit_counts_dimension_set    ON pit_counts (dimension_set);
CREATE INDEX pit_counts_shelter          ON pit_counts (shelter);
CREATE INDEX pit_counts_in_family        ON pit_counts (in_family);
CREATE INDEX pit_counts_race_hispanic    ON pit_counts (race, hispanic);
```

**Notes:**
- Only one population flag (`veteran`, `unaccompanied_youth`, `parenting_youth`, `children_of_parenting_youth`, `chronic`) will be non-null per row. They are mutually exclusive in practice (no source column encodes more than one). A CHECK constraint can enforce this if desired.
- `race` and `hispanic` are always both null or both non-null (they are specified together). The single exception is `Hispanic/Latina/e/o Only` rows where `race IS NULL AND hispanic = true`.
- Never aggregate across `shelter+in_family` and `shelter+family_unit` — they measure persons and household units respectively. The `count_unit` column and `dimension_set` both signal this, but an explicit check before any `SUM` is good practice.
- Derived `chronic=false` rows are always paired with a corresponding `chronic=true` source row for the same `(year, coc_id, shelter, in_family)`. Their sum equals the total individual or family count from the `shelter+in_family` dimension set.

---

## 7. Redundant Aggregate Column List

**798 columns are excluded** (up from 788 in the prior analysis, due to 10 new columns excluded under rules R6 and R7).

### R1 — shelter = `overall` (231 columns)

All `Overall ...` prefix columns. Derivable as `es + th + sh + unsheltered`.
Confirmed (2017, 2019, 2024): `Overall Homeless` = sum of four atomic shelter totals.

### R2 — race(any) sub-dimension (154 columns)

Columns where the race suffix has no `Only` and no `and Hispanic` — e.g., `Black, African American, or African` (without qualifier). Derivable as `(race=X, hispanic=false) + (race=X, hispanic=true)`.
Confirmed 2024 (Black): 3,912 = 3,825 + 87.

### R3 — ethnicity sub-dimension (44 columns)

`Hispanic/Latina/e/o` and `Non-Hispanic/Latina/e/o` columns. Derivable from the `hispanic` boolean decomposition:
- `Non-Hispanic` = sum of `hispanic=false` rows for the same shelter/household combination (confirmed 2024: 7,321).
- `Hispanic` = sum of `hispanic=true` rows (confirmed 2024: 2,129).

### R4 — atomic shelter, no household filter, with sub-dimension (124 columns)

E.g., `Sheltered ES Homeless - Under 18`. Derivable as `(es + individual + sub-dim) + (es + family + sub-dim)`.
Confirmed (ES Under 18 2024: 247 = 15 + 232; TH Woman 2024: 301 = 174 + 127).

### R5 — atomic shelter, no household filter, no sub-dimension (4 columns)

`Sheltered ES Homeless`, `Sheltered TH Homeless`, `Sheltered SH Homeless`, `Unsheltered Homeless`. Derivable as `individual + family`.
Confirmed all four shelter types 2024.

### R6 — Youth Under-25 aggregates (7 columns) *(new)*

Columns for `Homeless Unaccompanied Youth (Under 25)` and `Homeless Parenting Youth (Under 25)` with **no sub-dimension**. Derivable as `under_18 + 18–24`.
Confirmed (ES unaccompanied youth 2021: 8+58=66; 2024: 15+71=86; parenting youth 2024: verified).

Examples excluded:
- `Sheltered ES Homeless Unaccompanied Youth (Under 25)`
- `Sheltered TH Homeless Unaccompanied Youth (Under 25)`
- `Sheltered SH Homeless Unaccompanied Youth (Under 25)` *(if present)*
- `Unsheltered Homeless Unaccompanied Youth (Under 25)`
- `Sheltered ES Homeless Parenting Youth (Under 25)`
- `Sheltered TH Homeless Parenting Youth (Under 25)`
- `Unsheltered Homeless Parenting Youth (Under 25)`

### R7 — Chronically Homeless aggregate (3 columns) *(new)*

`Chronically Homeless` (no individual/family split) for ES, SH, and unsheltered. Derivable as `chronically_homeless_individuals + chronically_homeless_family`.
Confirmed (ES 2021–2024: four spot-checks, all match). For SH, `chronically_homeless = chronically_homeless_individuals` (no family contribution).

### R1b — shelter = `sheltered_total` (231 columns)

All `Sheltered Total ...` prefix columns. Derivable as `es + th + sh`.
Confirmed (2017, 2019, 2024).

---

## 8. Retained Dimension Sets

After all exclusions, **506 source columns** are retained across **16 dimension sets**. The fact table additionally contains derived rows (see §10).

| Dimension set | Shelter values | Other dimension values | Source cols | Derived rows/yr |
|---|---|---|---|---|
| `shelter+in_family` | es, th, sh, unsheltered | in_family: true/false; count_unit: person | 7 | — |
| `shelter+family_unit` | es, th, unsheltered | in_family: true; count_unit: household | 3 | — |
| `shelter+in_family+age` | es, th, sh, unsheltered | in_family: true/false; age_upper: 17,24,34,44,54,64,110 | 56 | — |
| `shelter+in_family+gender` | es, th, sh, unsheltered | in_family: true/false; gender: 8 values | 56 | — |
| `shelter+in_family+race+hispanic` | es, th, sh, unsheltered | in_family: true/false; race: 7+null; hispanic: true/false | 105 | — |
| `shelter+veteran` | es, th, sh, unsheltered | veteran: true | 4 | — |
| `shelter+veteran+gender` | es, th, sh, unsheltered | veteran: true; gender: 8 values | 32 | — |
| `shelter+veteran+race+hispanic` | es, th, sh, unsheltered | veteran: true; race: 7+null; hispanic: true/false | 60 | — |
| `shelter+unaccompanied_youth+age` | es, th, sh, unsheltered | unaccompanied_youth: true; age_upper: 17, 24 | 8 | — |
| `shelter+unaccompanied_youth+gender` | es, th, sh, unsheltered | unaccompanied_youth: true; gender: 8 values | 32 | — |
| `shelter+unaccompanied_youth+race+hispanic` | es, th, sh, unsheltered | unaccompanied_youth: true; race: 7+null; hispanic: true/false | 60 | — |
| `shelter+parenting_youth+age` | es, th, unsheltered | parenting_youth: true; age_upper: 17, 24 | 6 | — |
| `shelter+parenting_youth+gender` | es, th, sh, unsheltered | parenting_youth: true; gender: 8 values | 24 | — |
| `shelter+parenting_youth+race+hispanic` | es, th, sh, unsheltered | parenting_youth: true; race: 7+null; hispanic: true/false | 45 | — |
| `shelter+children_of_parenting_youth` | es, th, unsheltered | children_of_parenting_youth: true | 3 | — |
| `shelter+chronic+in_family` | es, sh, unsheltered | chronic: true/false; in_family: true/false | 5 | 5 |

**Total source columns retained: 506.** Per year loaded, 5 additional `chronic=false` rows are derived from the `shelter+chronic+in_family` set (3 shelter types × individual + ES/unsheltered family; SH contributes individual-only).

---

## 9. Exclusion Rule

A source column is excluded (placed in the redundant list) if **any** of the following holds:

**R1 — Aggregate shelter:** Shelter type is `overall` or `sheltered_total`.
- `overall` = es + th + sh + unsheltered (confirmed).
- `sheltered_total` = es + th + sh (confirmed).

**R2 — Race(any) sub-dimension:** Column suffix is a plain race name without `Only` or `and Hispanic/Latina/e/o`. Derivable as `(race=X, hispanic=false) + (race=X, hispanic=true)` (confirmed).

**R3 — Ethnicity sub-dimension:** Column encodes `Hispanic/Latina/e/o` or `Non-Hispanic/Latina/e/o`. Derivable from the `hispanic` boolean rows (confirmed).

**R4 — Atomic shelter, no household filter, with sub-dimension:** Shelter is atomic, no household type specified, and a sub-dimension (age/gender/race/hispanic) is present. Derivable as `(same shelter + individual + sub-dim) + (same shelter + family + sub-dim)` (confirmed; SH family contribution is zero).

**R5 — Atomic shelter, no household filter, no sub-dimension:** Plain total per atomic shelter type. Derivable as `individual + family` (confirmed).

**R6 — Youth Under-25 aggregates (new):** Column is `Homeless Unaccompanied Youth (Under 25)` or `Homeless Parenting Youth (Under 25)` with **no sub-dimension**. Derivable as `under_18 + 18–24` for the same shelter type (confirmed 2021–2024).

**R7 — Chronically Homeless aggregate (new):** Column is `Chronically Homeless` (no individual/family split) for a shelter type where both `Chronically Homeless Individuals` and `Chronically Homeless People in Families` exist (ES, SH, unsheltered). Derivable as `individuals + family` (confirmed). For SH: family component = 0.

**Re-application note:** These rules depend purely on column name structure — not on data values — and can be applied mechanically to new yearly data. The only exception is R4/R5, which assume `individual + family = total`; verify this identity holds before applying to any new shelter/household combination introduced in future source data.

---

## 10. Complement Derivation

After loading all source rows, derive implicit complement rows for dimensions where one side of an exhaustive partition is present in the source and the other can be safely computed by subtraction.

### C1 — Chronic complement

**Condition:** A shelter type has both a `chronic=true, in_family=X` source row and a corresponding `in_family=X` total row in the `shelter+in_family` dimension set.

**Derivation:**
```
chronic=false count = in_family total (from shelter+in_family)
                    − chronic=true count (from shelter+chronic+in_family)
                    [for matching shelter and in_family values]
```

**Scope:** ES individual, ES family, SH individual, unsheltered individual, unsheltered family. TH is excluded (no chronic source data). SH family is excluded (no family rows for SH).

**Verified safe (all complements positive, 2019–2024):**
- ES non-chronic individuals: 298–842
- ES non-chronic family: 190–254
- SH non-chronic individuals: 3–12
- Unsheltered non-chronic individuals: 3,796–5,108
- Unsheltered non-chronic family: 24–290

**Derived row attributes:**
- `chronic = false`
- `in_family` = same as the source row being complemented
- `shelter` = same shelter type
- `dimension_set = 'shelter+chronic+in_family'`
- `is_derived = true`
- `source_column = '<derived> <Shelter Prefix> Non-Chronically Homeless <Individuals|People in Families>'`
- All other dimension columns null (consistent with the source `chronic=true` rows in this set)

**Re-application:** When loading a new year, apply C1 after loading all source rows. Verify the complement is non-negative before inserting; a negative value would indicate a data anomaly in the source (chronic count exceeding total) and should be flagged rather than inserted.

**No other complements currently derivable:**
- `veteran=false` is not derivable — veteran counts are not split by `in_family`, so subtracting from `individual` or `family` totals would be incorrect.
- `unaccompanied_youth=false` and `parenting_youth=false` are not meaningful analytic categories (the complement is the general homeless population minus a small cross-cut).
- All gender, race/hispanic, and age dimension sets already form exhaustive partitions — both sides of every complement are already present in the source data.

---

## 11. Dimension Set Storage and Discovery

### Two layers of information

**Vocabulary** (what dimension sets are defined) is static — 16 sets, fixed by the data model, updated only when the model changes. Stored in a companion lookup table.

**Coverage** (which sets have data for a given year) is empirical and varies heavily by year. Derived from the fact table, never hardcoded.

---

### Companion lookup table

```sql
CREATE TABLE pit_dimension_set_defs (
    dimension_set  text    PRIMARY KEY,
        -- matches the dimension_set column in pit_counts
    dimensions     text[]  NOT NULL,
        -- sorted array of dimension column names that are non-null in this set.
        -- 'shelter' is always included (it is never null).
        -- 'race' and 'hispanic' always appear together — treat as a single selection.
    count_unit     text    NOT NULL DEFAULT 'person',
        -- 'person'    = rows count individuals
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
```

**Note on `shelter+family_unit` vs `shelter+in_family`:** Both have `dimensions = ARRAY['in_family','shelter']` and are distinguished only by `count_unit`. Queries using array operators must include `AND count_unit = 'person'` when intending person counts. When constructing the tag string directly, the primary key is unambiguous.

---

### Coverage view

Year/dimension availability is always derived from the fact table — never hardcoded:

```sql
CREATE MATERIALIZED VIEW pit_coverage AS
SELECT year, dimension_set, count(*) AS row_count
FROM pit_counts
GROUP BY year, dimension_set
ORDER BY year, dimension_set;
```

Refresh after each data load. To check whether a dimension set has data for a given year:

```sql
SELECT row_count FROM pit_coverage
WHERE year = 2015 AND dimension_set = 'shelter+in_family+race+hispanic';
-- no rows → not available for that year
```

---

### Progressive disclosure: discovering compatible dimensions

When a user selects one dimension, find which additional dimensions can be added:

```sql
-- User has selected 'veteran'. What other dimensions are available to add?
SELECT DISTINCT unnest(dimensions) AS available_dimension
FROM pit_dimension_set_defs
WHERE 'veteran' = ANY(dimensions)
  AND count_unit = 'person'
ORDER BY 1;
-- Returns: age, gender, hispanic, race, shelter, veteran
-- Filter out already-selected ('veteran') and always-present ('shelter') in application code
-- Offerable additions: gender, race+hispanic
-- (age does not appear → correctly excluded, no veteran+age dimension set exists)
```

Because `race` and `hispanic` always appear together in every `dimensions` array, a UI should treat them as a single "race/ethnicity" option — selecting one implies the other. This co-occurrence can be verified:

```sql
-- Should return 0 rows if race and hispanic always co-occur:
SELECT dimension_set FROM pit_dimension_set_defs
WHERE ('race' = ANY(dimensions)) != ('hispanic' = ANY(dimensions));
```

---

### Exact-match lookup: resolving a selection to a dimension set

Given a set of selected dimensions, find the matching dimension set or confirm the combination is invalid:

```sql
-- User has selected veteran + gender. Find the dimension set:
SELECT dimension_set
FROM pit_dimension_set_defs
WHERE dimensions @> ARRAY['shelter', 'veteran', 'gender']  -- must contain all of these
  AND array_length(dimensions, 1) = 3                       -- and nothing else
  AND count_unit = 'person';
-- → 'shelter+veteran+gender'

-- User tries veteran + age. Does this exist?
SELECT dimension_set
FROM pit_dimension_set_defs
WHERE dimensions @> ARRAY['shelter', 'veteran', 'age']
  AND array_length(dimensions, 1) = 3
  AND count_unit = 'person';
-- → (no rows) — invalid combination; UI should not offer 'age' after 'veteran' is selected
```

Alternatively, construct the `dimension_set` tag directly in application code (sort selected dimension names alphabetically, join with `+`) and use a primary-key lookup:

```sql
SELECT * FROM pit_dimension_set_defs WHERE dimension_set = 'shelter+veteran+gender';
```

This is simpler when the querier has already resolved their selections. The `@>` + `array_length` approach is better when validating combinations dynamically without constructing the tag string.

---

### Full progressive disclosure flow

```
1. User picks a population flag (e.g. veteran)
      → WHERE 'veteran' = ANY(dimensions) AND count_unit = 'person'
      → unnest all dimensions, exclude 'shelter' and already-selected dims
      → offer to user: gender, race/ethnicity
         (age correctly absent — no shelter+veteran+age set exists)

2. User picks an additional dimension (e.g. gender)
      → WHERE dimensions @> ARRAY['shelter','veteran','gender']
             AND array_length(dimensions,1) = 3
             AND count_unit = 'person'
      → resolves to: dimension_set = 'shelter+veteran+gender'

3. Optionally check year coverage before querying:
      SELECT row_count FROM pit_coverage
      WHERE year = 2023 AND dimension_set = 'shelter+veteran+gender';
      -- if no row → data not available for this year

4. Query the fact table:
      SELECT shelter, gender, SUM(count)
      FROM pit_counts
      WHERE dimension_set = 'shelter+veteran+gender'
        AND year = 2023
      GROUP BY shelter, gender;
```

---

## Appendix: Column Count Summary

**Source column accounting:**

| Category | Count |
|---|---|
| Total source columns | 1,309 |
| Metadata columns (excluded) | 5 |
| Count columns analyzed | 1,304 |
| Redundant — R1 shelter=overall | 231 |
| Redundant — R1b shelter=sheltered_total | 231 |
| Redundant — R2 race(any) | 154 |
| Redundant — R3 ethnicity | 44 |
| Redundant — R4 atomic shelter, no hh, with sub-dim | 124 |
| Redundant — R5 atomic shelter, no hh, no sub-dim | 4 |
| Redundant — R6 youth Under-25 aggregates | 7 |
| Redundant — R7 chronically homeless aggregates | 3 |
| **Total redundant** | **798** |
| **Retained source columns** | **506** |

**Retained dimension sets:** 16 (split `shelter+in_family` into person and household-unit sets relative to prior draft).

**Fact table rows per year loaded** (approximate, varies by year data availability):
- Source rows: up to 506, but far fewer in practice for most years — null source values are omitted entirely rather than inserted as count=0 (see design principle 4).
- Derived rows (C1 chronic complement): 5 per year where chronic data exists (2013+); omitted for years where the source chronic column is null.
- Total: up to 511 rows per year (2023–2024); substantially fewer for earlier years.

**Year coverage summary for major dimension sets:**

| Dimension set | First available | Notes |
|---|---|---|
| `shelter+in_family` | 2007 | Core totals present all years |
| `shelter+family_unit` | ~2007 | Family household unit counts |
| `shelter+in_family+age` | 2013 | Only 3 age buckets (17, 24, 110) until 2023; full 7 buckets from 2023 |
| `shelter+in_family+gender` | ~2013 | Absent 2007–2012 |
| `shelter+in_family+race+hispanic` | ~2013 | Absent 2007–2012 |
| `shelter+veteran` | ~2007 | Coverage varies |
| `shelter+veteran+gender` / `+race+hispanic` | ~2013 | Absent earlier years |
| `shelter+unaccompanied_youth+age` | ~2013 | |
| `shelter+unaccompanied_youth+gender` / `+race+hispanic` | ~2013 | |
| `shelter+parenting_youth+*` | ~2013 | |
| `shelter+children_of_parenting_youth` | ~2013 | |
| `shelter+chronic+in_family` | ~2013 | Derived complement also starts ~2013 |

Exact first-available years vary by column; consult the source data for authoritative per-column null patterns.
