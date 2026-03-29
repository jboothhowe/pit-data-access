/**
 * check_pit_data.ts
 *
 * Sanity-checks the pit_counts table against the source CSV.
 * Runs a series of named assertions; prints PASS / FAIL for each.
 *
 * Usage:
 *   npx tsx scripts/check_pit_data.ts
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY);
const COC_ID = 'CA-502';

// ---------------------------------------------------------------------------
// Load CSV into a lookup: year -> { colName -> number }
// ---------------------------------------------------------------------------

type CsvData = Map<number, Map<string, number>>;

function loadCsv(): CsvData {
  const raw = fs.readFileSync(
    path.resolve(__dirname, '../data/ac-pit-data.csv'),
    'utf-8',
  );
  const records: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const data: CsvData = new Map();
  for (const record of records) {
    const year = parseInt(record['Year'], 10);
    const cols = new Map<string, number>();
    for (const [k, v] of Object.entries(record)) {
      if (k === 'Year' || !v || v.trim() === '') continue;
      const n = parseInt(v.replace(/,/g, ''), 10);
      if (!isNaN(n)) cols.set(k, n);
    }
    data.set(year, cols);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(name: string, actual: number | null | undefined, expected: number) {
  if (actual === expected) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    console.log(`        expected=${expected}, got=${actual}`);
    failed++;
  }
}

async function dbSum(filters: Record<string, unknown>): Promise<number> {
  let q = supabase
    .from('pit_counts')
    .select('n')
    .eq('coc_id', COC_ID);

  for (const [col, val] of Object.entries(filters)) {
    if (val === null) {
      q = q.is(col, null);
    } else {
      q = q.eq(col, val as string | number | boolean);
    }
  }

  const { data, error } = await q;
  if (error) throw new Error(`DB query failed: ${JSON.stringify(error)}`);
  return (data ?? []).reduce((sum, row) => sum + (row.n as number), 0);
}

async function dbCount(filters: Record<string, unknown>): Promise<number> {
  let q = supabase
    .from('pit_counts')
    .select('*', { count: 'exact', head: true })
    .eq('coc_id', COC_ID);

  for (const [col, val] of Object.entries(filters)) {
    if (val === null) {
      q = q.is(col, null);
    } else {
      q = q.eq(col, val as string | number | boolean);
    }
  }

  const { count, error } = await q;
  if (error) throw new Error(`DB query failed: ${JSON.stringify(error)}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function runChecks() {
  const csv = loadCsv();

  // -------------------------------------------------------------------------
  // 1. Total row count is positive and reasonable
  // -------------------------------------------------------------------------
  console.log('\n── Row counts ──────────────────────────────────────────────');
  {
    const total = await dbCount({});
    console.log(`  Total rows in pit_counts for ${COC_ID}: ${total}`);
    if (total < 1000) {
      console.log('  WARN  Total row count seems low (expected 1000+)');
      failed++;
    } else {
      console.log('  PASS  Total row count is reasonable');
      passed++;
    }

    // Check that derived rows exist (chronic complements)
    const derivedCount = await dbCount({ is_derived: true });
    console.log(`  Derived rows (chronic=false): ${derivedCount}`);
    if (derivedCount === 0) {
      console.log('  FAIL  No derived rows found — C1 complement derivation may have failed');
      failed++;
    } else {
      console.log('  PASS  Derived rows present');
      passed++;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Direct source column values: specific (year, shelter, population) rows
  // -------------------------------------------------------------------------
  console.log('\n── Direct source column values ─────────────────────────────');

  const directChecks: Array<{
    name: string;
    csvCol: string;
    year: number;
    dbFilters: Record<string, unknown>;
  }> = [
    {
      name: 'ES 2024 Individuals',
      csvCol: 'Sheltered ES Homeless Individuals',
      year: 2024,
      dbFilters: { shelter: 'es', dimension_set: 'shelter+in_family', in_family: false, count_unit: 'person' },
    },
    {
      name: 'ES 2024 People in Families',
      csvCol: 'Sheltered ES Homeless People in Families',
      year: 2024,
      dbFilters: { shelter: 'es', dimension_set: 'shelter+in_family', in_family: true, count_unit: 'person' },
    },
    {
      name: 'TH 2024 Individuals',
      csvCol: 'Sheltered TH Homeless Individuals',
      year: 2024,
      dbFilters: { shelter: 'th', dimension_set: 'shelter+in_family', in_family: false, count_unit: 'person' },
    },
    {
      name: 'Unsheltered 2024 Individuals',
      csvCol: 'Unsheltered Homeless Individuals',
      year: 2024,
      dbFilters: { shelter: 'unsheltered', dimension_set: 'shelter+in_family', in_family: false, count_unit: 'person' },
    },
    {
      name: 'Unsheltered 2024 People in Families',
      csvCol: 'Unsheltered Homeless People in Families',
      year: 2024,
      dbFilters: { shelter: 'unsheltered', dimension_set: 'shelter+in_family', in_family: true, count_unit: 'person' },
    },
    {
      name: 'ES 2021 Individuals',
      csvCol: 'Sheltered ES Homeless Individuals',
      year: 2021,
      dbFilters: { shelter: 'es', dimension_set: 'shelter+in_family', in_family: false, count_unit: 'person' },
    },
    {
      name: 'ES 2024 Chronically Homeless Individuals',
      csvCol: 'Sheltered ES Chronically Homeless Individuals',
      year: 2024,
      dbFilters: { shelter: 'es', dimension_set: 'shelter+chronic+in_family', chronic: true, in_family: false },
    },
    {
      name: 'ES 2021 Chronically Homeless Individuals',
      csvCol: 'Sheltered ES Chronically Homeless Individuals',
      year: 2021,
      dbFilters: { shelter: 'es', dimension_set: 'shelter+chronic+in_family', chronic: true, in_family: false },
    },
    {
      name: 'ES 2024 Chronically Homeless People in Families',
      csvCol: 'Sheltered ES Chronically Homeless People in Families',
      year: 2024,
      dbFilters: { shelter: 'es', dimension_set: 'shelter+chronic+in_family', chronic: true, in_family: true },
    },
    {
      name: 'ES 2024 Veterans',
      csvCol: 'Sheltered ES Homeless Veterans',
      year: 2024,
      dbFilters: { shelter: 'es', dimension_set: 'shelter+veteran', veteran: true },
    },
    {
      name: 'ES 2024 Unaccompanied Youth Under 18',
      csvCol: 'Sheltered ES Homeless Unaccompanied Youth Under 18',
      year: 2024,
      dbFilters: { shelter: 'es', dimension_set: 'shelter+unaccompanied_youth+age', unaccompanied_youth: true, age_upper: 17 },
    },
    {
      name: 'ES 2024 Unaccompanied Youth Age 18-24',
      csvCol: 'Sheltered ES Homeless Unaccompanied Youth Age 18-24',
      year: 2024,
      dbFilters: { shelter: 'es', dimension_set: 'shelter+unaccompanied_youth+age', unaccompanied_youth: true, age_upper: 24 },
    },
    {
      name: 'ES 2024 Individuals - Black Only',
      csvCol: 'Sheltered ES Homeless Individuals - Black, African American, or African Only',
      year: 2024,
      dbFilters: {
        shelter: 'es', dimension_set: 'shelter+in_family+race+hispanic',
        in_family: false, race: 'black', hispanic: false,
      },
    },
    {
      name: 'ES 2024 Individuals - Black and Hispanic',
      csvCol: 'Sheltered ES Homeless Individuals - Black, African American, or African and Hispanic/Latina/e/o',
      year: 2024,
      dbFilters: {
        shelter: 'es', dimension_set: 'shelter+in_family+race+hispanic',
        in_family: false, race: 'black', hispanic: true,
      },
    },
  ];

  for (const check of directChecks) {
    const yearCols = csv.get(check.year);
    const expected = yearCols?.get(check.csvCol);
    if (expected === undefined) {
      console.log(`  SKIP  ${check.name} — column not in CSV for year ${check.year}`);
      continue;
    }
    const actual = await dbSum({ ...check.dbFilters, year: check.year });
    assert(check.name, actual, expected);
  }

  // -------------------------------------------------------------------------
  // 3. Aggregation checks: sum of parts should equal excluded aggregate columns
  // -------------------------------------------------------------------------
  console.log('\n── Aggregation checks (sum-of-parts = excluded aggregate) ─');

  // For each year, ES_ind + ES_fam + TH_ind + TH_fam + SH_ind + unsh_ind + unsh_fam = Overall Homeless
  const aggYears = [2024, 2023, 2021, 2019, 2015];
  for (const year of aggYears) {
    const yearCols = csv.get(year);
    const csvOverall = yearCols?.get('Overall Homeless');
    if (csvOverall === undefined) continue;

    const dbTotal = await dbSum({ year, dimension_set: 'shelter+in_family', count_unit: 'person' });
    assert(`${year}: sum shelter+in_family = Overall Homeless (${csvOverall})`, dbTotal, csvOverall);
  }

  // Youth age sum: Under 18 + Age 18-24 = Under-25 aggregate (R6 excluded column)
  const youthAggYears = [2024, 2023, 2021];
  for (const year of youthAggYears) {
    const yearCols = csv.get(year);
    const csvUnder25 = yearCols?.get('Sheltered ES Homeless Unaccompanied Youth (Under 25)');
    if (!csvUnder25) continue;

    const dbSum_ = await dbSum({
      year,
      shelter: 'es',
      dimension_set: 'shelter+unaccompanied_youth+age',
      unaccompanied_youth: true,
    });
    assert(`${year}: ES unaccompanied youth age sum = Under-25 (${csvUnder25})`, dbSum_, csvUnder25);
  }

  // Race(any) = race_only + race_and_hispanic  (R2 excluded column)
  {
    const year = 2024;
    const yearCols = csv.get(year)!;
    const csvBlackAny = yearCols.get('Sheltered ES Homeless Individuals - Black, African American, or African');
    if (csvBlackAny !== undefined) {
      const dbBlack = await dbSum({
        year,
        shelter: 'es',
        dimension_set: 'shelter+in_family+race+hispanic',
        in_family: false,
        race: 'black',
      });
      assert(`${year}: ES ind black (any) = black_only + black_and_hispanic (${csvBlackAny})`, dbBlack, csvBlackAny);
    }
  }

  // Non-Hispanic total = sum of hispanic=false rows for all shelter+in_family+race+hispanic (2024)
  {
    const year = 2024;
    const yearCols = csv.get(year)!;
    // Sum of all atomic shelters' non-hispanic counts from CSV using excluded R3 column
    const csvNonHisp =
      (yearCols.get('Sheltered ES Homeless Individuals - Non-Hispanic/Latina/e/o') ?? 0) +
      (yearCols.get('Sheltered ES Homeless People in Families - Non-Hispanic/Latina/e/o') ?? 0) +
      (yearCols.get('Sheltered TH Homeless Individuals - Non-Hispanic/Latina/e/o') ?? 0) +
      (yearCols.get('Sheltered TH Homeless People in Families - Non-Hispanic/Latina/e/o') ?? 0) +
      (yearCols.get('Sheltered SH Homeless Individuals - Non-Hispanic/Latina/e/o') ?? 0) +
      (yearCols.get('Unsheltered Homeless Individuals - Non-Hispanic/Latina/e/o') ?? 0) +
      (yearCols.get('Unsheltered Homeless People in Families - Non-Hispanic/Latina/e/o') ?? 0);

    const dbNonHisp = await dbSum({
      year,
      dimension_set: 'shelter+in_family+race+hispanic',
      hispanic: false,
    });
    assert(`${year}: sum hispanic=false = sum Non-Hispanic CSV columns (${csvNonHisp})`, dbNonHisp, csvNonHisp);
  }

  // -------------------------------------------------------------------------
  // 4. Chronic complement (C1): chronic_true + chronic_false = in_family total
  // -------------------------------------------------------------------------
  console.log('\n── Chronic complement (C1) ─────────────────────────────────');

  const chronicYears = [2024, 2022, 2021, 2019];
  for (const year of chronicYears) {
    for (const inFamily of [false, true]) {
      const shelters = inFamily ? ['es', 'unsheltered'] : ['es', 'sh', 'unsheltered'];
      for (const shelter of shelters) {
        const total = await dbSum({ year, shelter, dimension_set: 'shelter+in_family', in_family: inFamily, count_unit: 'person' });
        if (total === 0) continue; // no data for this combo

        const chronicTrue = await dbSum({ year, shelter, dimension_set: 'shelter+chronic+in_family', chronic: true, in_family: inFamily });
        const chronicFalse = await dbSum({ year, shelter, dimension_set: 'shelter+chronic+in_family', chronic: false, in_family: inFamily });

        if (chronicTrue === 0) continue; // no chronic data for this combo/year

        const famLabel = inFamily ? 'fam' : 'ind';
        assert(
          `${year} ${shelter} ${famLabel}: chronic_true(${chronicTrue}) + chronic_false(${chronicFalse}) = total(${total})`,
          chronicTrue + chronicFalse,
          total,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. No zero counts in the database
  // -------------------------------------------------------------------------
  console.log('\n── Data integrity ──────────────────────────────────────────');
  {
    const { count, error } = await supabase
      .from('pit_counts')
      .select('*', { count: 'exact', head: true })
      .eq('coc_id', COC_ID)
      .lte('n', 0);

    if (error) throw new Error(`DB query failed: ${JSON.stringify(error)}`);
    assert('No rows with n <= 0', count, 0);
  }

  // No row has more than one population flag set
  {
    const { data, error } = await supabase
      .from('pit_counts')
      .select('id, veteran, unaccompanied_youth, parenting_youth, children_of_parenting_youth, chronic')
      .eq('coc_id', COC_ID)
      .not('veteran', 'is', null);

    if (error) throw new Error(`DB query failed: ${JSON.stringify(error)}`);

    const violations = (data ?? []).filter(
      (r) =>
        [r.veteran, r.unaccompanied_youth, r.parenting_youth, r.children_of_parenting_youth, r.chronic]
          .filter((v) => v !== null).length > 1,
    ).length;
    assert('No rows with multiple population flags set', violations, 0);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n────────────────────────────────────────────────────────────');
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runChecks().catch((err) => {
  console.error(err);
  process.exit(1);
});
