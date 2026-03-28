/**
 * upload_pit_data.ts
 *
 * Reads data/ac-pit-data.csv, transforms the wide format into narrow rows per
 * DIMENSIONS.md, derives chronic=false complement rows (C1), then upserts into
 * the Supabase pit_counts table.
 *
 * Usage:
 *   npx tsx scripts/upload_pit_data.ts [--dry-run]
 *
 * Requires .env.local with:
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SECRET_KEY=<secret-key>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const COC_ID = 'CA-502';
const CSV_PATH = path.resolve(__dirname, '../data/ac-pit-data.csv');
const BATCH_SIZE = 300;
const DRY_RUN = process.argv.includes('--dry-run');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Shelter = 'es' | 'th' | 'sh' | 'unsheltered';
type CountUnit = 'person' | 'household';

interface PitRow {
  year: number;
  coc_id: string;
  shelter: Shelter;
  in_family: boolean | null;
  veteran: boolean | null;
  unaccompanied_youth: boolean | null;
  parenting_youth: boolean | null;
  children_of_parenting_youth: boolean | null;
  chronic: boolean | null;
  age_upper: number | null;
  gender: string | null;
  race: string | null;
  hispanic: boolean | null;
  count: number;
  count_unit: CountUnit;
  dimension_set: string;
  source_column: string;
  is_derived: boolean;
}

// ---------------------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------------------

const RACE_MAP: Record<string, string> = {
  'American Indian, Alaska Native, or Indigenous': 'american_indian_alaska_native_indigenous',
  'Asian or Asian American': 'asian',
  'Black, African American, or African': 'black',
  'Middle Eastern or North African': 'middle_eastern_north_african',
  'Native Hawaiian or Other Pacific Islander': 'native_hawaiian_pacific_islander',
  'White': 'white',
  'Multi-Racial': 'multi_racial',
};

// Source age string → upper bound integer
const AGE_MAP: Record<string, number> = {
  'Under 18': 17,
  'Age 18 to 24': 24,
  'Over 24': 110,      // retained for year <= 2022 only (excluded for year >= 2023)
  'Age 25 to 34': 34,
  'Age 35 to 44': 44,
  'Age 45 to 54': 54,
  'Age 55 to 64': 64,
  'Over 64': 110,
};

// Source gender string → normalized value
const GENDER_MAP: Record<string, string> = {
  'Woman': 'woman',
  'Man': 'man',
  'Transgender': 'transgender',
  'Gender Questioning': 'gender_questioning',
  'Non Binary': 'non_binary',
  'More Than One Gender': 'more_than_one_gender',
  'Culturally Specific Identity': 'culturally_specific_identity',
  'Different Identity': 'different_identity',
};

// ---------------------------------------------------------------------------
// Column name parser
// ---------------------------------------------------------------------------

/**
 * Parse a single source column name into a partial PitRow (sans year/coc_id/count).
 * Returns null if the column should be excluded by any exclusion rule.
 */
function parseColumn(
  colName: string,
  year: number,
): Omit<PitRow, 'year' | 'coc_id' | 'count'> | null {

  // --- Step 1: Extract shelter prefix (R1 and R1b) ---
  let shelter: Shelter;
  let rest: string;

  if (colName.startsWith('Overall ')) {
    return null; // R1: aggregate shelter
  } else if (colName.startsWith('Sheltered Total ')) {
    return null; // R1b: aggregate shelter
  } else if (colName.startsWith('Sheltered ES ')) {
    shelter = 'es';
    rest = colName.slice('Sheltered ES '.length);
  } else if (colName.startsWith('Sheltered TH ')) {
    shelter = 'th';
    rest = colName.slice('Sheltered TH '.length);
  } else if (colName.startsWith('Sheltered SH ')) {
    shelter = 'sh';
    rest = colName.slice('Sheltered SH '.length);
  } else if (colName.startsWith('Unsheltered ')) {
    shelter = 'unsheltered';
    rest = colName.slice('Unsheltered '.length);
  } else {
    // Unknown prefix — exclude and log
    console.warn(`  SKIP (unknown shelter prefix): ${colName}`);
    return null;
  }

  // --- Step 2: Split population segment from sub-dimension ---
  // Format: "<population>" or "<population> - <sub-dim>"
  const dashIdx = rest.indexOf(' - ');
  const population = dashIdx === -1 ? rest : rest.slice(0, dashIdx);
  const subDimStr = dashIdx === -1 ? null : rest.slice(dashIdx + 3);

  // --- Step 3: Parse population segment ---
  let in_family: boolean | null = null;
  let veteran: boolean | null = null;
  let unaccompanied_youth: boolean | null = null;
  let parenting_youth: boolean | null = null;
  let children_of_parenting_youth: boolean | null = null;
  let chronic: boolean | null = null;
  let age_upper: number | null = null;
  let count_unit: CountUnit = 'person';
  let youthAgeFromPopulation: number | null = null; // set for youth age-split populations

  if (population === 'Homeless Individuals') {
    in_family = false;
  } else if (population === 'Homeless People in Families') {
    in_family = true;
  } else if (population === 'Homeless Family Households') {
    in_family = true;
    count_unit = 'household';
    // No sub-dimensions exist for family households
  } else if (population === 'Chronically Homeless') {
    // R7: excluded (aggregate; individual + family split exists)
    return null;
  } else if (population === 'Chronically Homeless Individuals') {
    chronic = true;
    in_family = false;
  } else if (population === 'Chronically Homeless People in Families') {
    chronic = true;
    in_family = true;
  } else if (population === 'Homeless Veterans') {
    veteran = true;
  } else if (population === 'Homeless Unaccompanied Youth (Under 25)') {
    unaccompanied_youth = true;
    // R6: excluded only when no sub-dimension present
    if (subDimStr === null) return null;
  } else if (population === 'Homeless Unaccompanied Youth Under 18') {
    unaccompanied_youth = true;
    youthAgeFromPopulation = 17;
  } else if (population === 'Homeless Unaccompanied Youth Age 18-24') {
    unaccompanied_youth = true;
    youthAgeFromPopulation = 24;
  } else if (population === 'Homeless Parenting Youth (Under 25)') {
    parenting_youth = true;
    // R6: excluded only when no sub-dimension present
    if (subDimStr === null) return null;
  } else if (population === 'Homeless Parenting Youth Under 18') {
    parenting_youth = true;
    youthAgeFromPopulation = 17;
  } else if (population === 'Homeless Parenting Youth Age 18-24') {
    parenting_youth = true;
    youthAgeFromPopulation = 24;
  } else if (population === 'Homeless Children of Parenting Youth') {
    children_of_parenting_youth = true;
  } else if (population === 'Homeless') {
    // R5: plain total per atomic shelter type (no household filter, no sub-dim)
    // R4: same prefix but with sub-dim → also excluded
    return null;
  } else {
    console.warn(`  SKIP (unknown population): ${colName}`);
    return null;
  }

  // Youth age-split columns carry age_upper from the population, not sub-dim
  if (youthAgeFromPopulation !== null) {
    age_upper = youthAgeFromPopulation;
    // These columns have no sub-dimension; if one was present it's an anomaly
    if (subDimStr !== null) {
      console.warn(`  SKIP (unexpected sub-dim on youth age-split): ${colName}`);
      return null;
    }
  }

  // --- Step 4: Parse sub-dimension ---
  let gender: string | null = null;
  let race: string | null = null;
  let hispanic: boolean | null = null;

  if (subDimStr !== null) {
    if (subDimStr in AGE_MAP) {
      const mappedAge = AGE_MAP[subDimStr];
      // 'Over 24' is excluded for year >= 2023: 'Over 64' also maps to age_upper=110
      // from 2023 onward (granular ages), so retaining both would produce duplicate rows.
      // DIMENSIONS.md noted Over 24 as null in 2023, but the source data has it populated.
      if (subDimStr === 'Over 24' && year >= 2023) return null;
      age_upper = mappedAge;
    } else if (subDimStr in GENDER_MAP) {
      gender = GENDER_MAP[subDimStr];
    } else if (subDimStr === 'Non-Hispanic/Latina/e/o' || subDimStr === 'Hispanic/Latina/e/o') {
      return null; // R3: ethnicity sub-dimension aggregate
    } else if (subDimStr === 'Hispanic/Latina/e/o Only') {
      race = null;
      hispanic = true;
    } else if (subDimStr.endsWith(' Only')) {
      const racePart = subDimStr.slice(0, -' Only'.length);
      const canonicalRace = RACE_MAP[racePart];
      if (!canonicalRace) {
        console.warn(`  SKIP (unknown race in Only): ${colName}`);
        return null;
      }
      race = canonicalRace;
      hispanic = false;
    } else if (subDimStr.endsWith(' and Hispanic/Latina/e/o')) {
      const racePart = subDimStr.slice(0, -' and Hispanic/Latina/e/o'.length);
      const canonicalRace = RACE_MAP[racePart];
      if (!canonicalRace) {
        console.warn(`  SKIP (unknown race in and-Hispanic): ${colName}`);
        return null;
      }
      race = canonicalRace;
      hispanic = true;
    } else if (RACE_MAP[subDimStr] !== undefined) {
      return null; // R2: race(any) — no Only or and Hispanic qualifier
    } else {
      console.warn(`  SKIP (unrecognized sub-dim): ${colName}`);
      return null;
    }
  }

  // --- Step 5: Determine dimension_set tag ---
  const dimension_set = buildDimensionSet({
    in_family, veteran, unaccompanied_youth, parenting_youth,
    children_of_parenting_youth, chronic, age_upper, gender, race, hispanic, count_unit,
  });

  if (!dimension_set) {
    console.warn(`  SKIP (could not determine dimension_set): ${colName}`);
    return null;
  }

  return {
    shelter,
    in_family,
    veteran,
    unaccompanied_youth,
    parenting_youth,
    children_of_parenting_youth,
    chronic,
    age_upper,
    gender,
    race,
    hispanic,
    count_unit,
    dimension_set,
    source_column: colName,
    is_derived: false,
  };
}

// ---------------------------------------------------------------------------
// Dimension set builder
// ---------------------------------------------------------------------------

function buildDimensionSet(dims: {
  in_family: boolean | null;
  veteran: boolean | null;
  unaccompanied_youth: boolean | null;
  parenting_youth: boolean | null;
  children_of_parenting_youth: boolean | null;
  chronic: boolean | null;
  age_upper: number | null;
  gender: string | null;
  race: string | null;
  hispanic: boolean | null;
  count_unit: CountUnit;
}): string | null {
  const hasAge = dims.age_upper !== null;
  const hasGender = dims.gender !== null;
  const hasRaceHisp = dims.race !== null || dims.hispanic !== null;

  if (dims.chronic !== null) {
    // shelter+chronic+in_family (no sub-dimensions)
    return 'shelter+chronic+in_family';
  }

  if (dims.children_of_parenting_youth !== null) {
    return 'shelter+children_of_parenting_youth';
  }

  if (dims.parenting_youth !== null) {
    if (hasAge) return 'shelter+parenting_youth+age';
    if (hasGender) return 'shelter+parenting_youth+gender';
    if (hasRaceHisp) return 'shelter+parenting_youth+race+hispanic';
    return null; // bare parenting_youth with no sub-dim should have been excluded by R6
  }

  if (dims.unaccompanied_youth !== null) {
    if (hasAge) return 'shelter+unaccompanied_youth+age';
    if (hasGender) return 'shelter+unaccompanied_youth+gender';
    if (hasRaceHisp) return 'shelter+unaccompanied_youth+race+hispanic';
    return null; // bare unaccompanied_youth with no sub-dim should have been excluded by R6
  }

  if (dims.veteran !== null) {
    if (hasAge) return null; // no shelter+veteran+age dimension set exists
    if (hasGender) return 'shelter+veteran+gender';
    if (hasRaceHisp) return 'shelter+veteran+race+hispanic';
    return 'shelter+veteran';
  }

  if (dims.in_family !== null) {
    if (dims.count_unit === 'household') return 'shelter+family_unit';
    if (hasAge) return 'shelter+in_family+age';
    if (hasGender) return 'shelter+in_family+gender';
    if (hasRaceHisp) return 'shelter+in_family+race+hispanic';
    return 'shelter+in_family';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Reading ${CSV_PATH}...`);
  const rawCsv = fs.readFileSync(CSV_PATH, 'utf-8');

  // csv-parse correctly handles quoted fields (column names containing commas)
  const records: Record<string, string>[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Found ${records.length} data rows.`);

  // Get the full column list from the first record
  const allColumns = Object.keys(records[0]);
  const metaColumns = new Set(['Year', 'CoC Number', 'CoC Name', 'CoC Category', 'Count Types']);
  const countColumns = allColumns.filter((c) => !metaColumns.has(c));

  console.log(`Count columns: ${countColumns.length}`);

  // ---------------------------------------------------------------------------
  // Parse all source rows
  // ---------------------------------------------------------------------------

  const sourceRows: PitRow[] = [];
  let skippedColumns = 0;
  let nullValueRows = 0;

  for (const record of records) {
    const year = parseInt(record['Year'], 10);
    const coc_id = record['CoC Number'];

    for (const colName of countColumns) {
      const rawValue = record[colName];

      // Omit null/empty/zero source values — design principle 4
      if (!rawValue || rawValue.trim() === '' || rawValue.trim() === '0') {
        nullValueRows++;
        continue;
      }

      const count = parseInt(rawValue.replace(/,/g, ''), 10);
      if (isNaN(count) || count <= 0) {
        nullValueRows++;
        continue;
      }

      const parsed = parseColumn(colName, year);
      if (!parsed) {
        skippedColumns++;
        continue;
      }

      sourceRows.push({
        year,
        coc_id,
        count,
        ...parsed,
      });
    }
  }

  console.log(`Source rows parsed: ${sourceRows.length}`);
  console.log(`Excluded (rules R1-R7 / null): ${skippedColumns} column×year combos skipped; ${nullValueRows} null/zero values omitted`);

  // ---------------------------------------------------------------------------
  // C1: Derive chronic=false complement rows
  // ---------------------------------------------------------------------------

  // Build lookup: (year, coc_id, shelter, in_family) → total count from shelter+in_family
  const totalByKey = new Map<string, number>();
  for (const row of sourceRows) {
    if (row.dimension_set === 'shelter+in_family' && row.count_unit === 'person') {
      const key = `${row.year}|${row.coc_id}|${row.shelter}|${String(row.in_family)}`;
      totalByKey.set(key, row.count);
    }
  }

  // Build lookup: (year, coc_id, shelter, in_family) → chronic=true count
  const chronicByKey = new Map<string, { count: number; sourceCol: string }>();
  for (const row of sourceRows) {
    if (row.dimension_set === 'shelter+chronic+in_family' && row.chronic === true) {
      const key = `${row.year}|${row.coc_id}|${row.shelter}|${String(row.in_family)}`;
      chronicByKey.set(key, { count: row.count, sourceCol: row.source_column });
    }
  }

  const derivedRows: PitRow[] = [];
  for (const [key, { count: chronicCount }] of chronicByKey.entries()) {
    const total = totalByKey.get(key);
    if (total === undefined) {
      console.warn(`  C1: No total found for chronic complement key: ${key}`);
      continue;
    }
    const nonChronicCount = total - chronicCount;
    if (nonChronicCount < 0) {
      console.warn(`  C1: Negative complement (${nonChronicCount}) for key: ${key} — skipping`);
      continue;
    }
    if (nonChronicCount === 0) continue; // design principle 4: no zero rows

    const [yearStr, coc_id, shelter, inFamilyStr] = key.split('|') as [string, string, Shelter, string];
    const in_family = inFamilyStr === 'true' ? true : false;
    const shelterLabel = shelter === 'es' ? 'Sheltered ES' :
                         shelter === 'th' ? 'Sheltered TH' :
                         shelter === 'sh' ? 'Sheltered SH' : 'Unsheltered';
    const popLabel = in_family ? 'People in Families' : 'Individuals';
    const sourceColumn = `<derived> ${shelterLabel} Non-Chronically Homeless ${popLabel}`;

    derivedRows.push({
      year: parseInt(yearStr, 10),
      coc_id,
      shelter,
      in_family,
      veteran: null,
      unaccompanied_youth: null,
      parenting_youth: null,
      children_of_parenting_youth: null,
      chronic: false,
      age_upper: null,
      gender: null,
      race: null,
      hispanic: null,
      count: nonChronicCount,
      count_unit: 'person',
      dimension_set: 'shelter+chronic+in_family',
      source_column: sourceColumn,
      is_derived: true,
    });
  }

  console.log(`Derived chronic=false rows: ${derivedRows.length}`);

  const allRows = [...sourceRows, ...derivedRows];
  console.log(`Total rows to insert: ${allRows.length}`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: sample rows ---');
    for (const row of allRows.slice(0, 5)) {
      console.log(JSON.stringify(row, null, 2));
    }
    console.log(`\nDry run complete. ${allRows.length} rows would be inserted for coc_id=${COC_ID}.`);
    return;
  }

  // ---------------------------------------------------------------------------
  // Delete existing data for this CoC, then batch insert
  // ---------------------------------------------------------------------------

  console.log(`\nDeleting existing rows for coc_id=${COC_ID}...`);
  const { error: deleteError } = await supabase
    .from('pit_counts')
    .delete()
    .eq('coc_id', COC_ID);

  if (deleteError) {
    console.error('Delete failed:', deleteError);
    process.exit(1);
  }

  console.log(`Inserting ${allRows.length} rows in batches of ${BATCH_SIZE}...`);
  let inserted = 0;

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('pit_counts').insert(batch);
    if (error) {
      console.error(`Batch insert failed at offset ${i}:`, error);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`\r  ${inserted}/${allRows.length} rows inserted`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
