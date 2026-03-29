# PIT Count Data — Oakland/Berkeley/Alameda County (CoC CA-502)

Point-in-Time homeless count data for Alameda County (2007–2024), sourced from HUD's annual PIT count submissions. Data is normalized into a narrow fact table; see [`DIMENSIONS.md`](./DIMENSIONS.md) for the full schema and dimension definitions.

---

## Public API

The database is publicly readable. Anyone can query it directly.

**Base URL:** `https://your-domain.com/api/v1`
*(proxied from Supabase PostgREST — same query syntax, stable URL)*

**Authentication:** Include the publishable key as a header or query param:
```
apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>
```

### Core tables

| Endpoint | Description |
|---|---|
| `/api/v1/pit_counts` | Narrow fact table — one row per dimension combination per year |
| `/api/v1/pit_dimension_set_defs` | Lookup table of all 16 supported dimension sets |
| `/api/v1/pit_coverage` | Materialized view — which dimension sets have data for each year |

### Query syntax (PostgREST)

Filter with `column=operator.value` query params. Select columns with `select=col1,col2`.

| Operator | Meaning | Example |
|---|---|---|
| `eq` | equals | `shelter=eq.es` |
| `gte` / `lte` | ≥ / ≤ | `year=gte.2015` |
| `is` | IS NULL / IS NOT NULL | `gender=is.null` |
| `in` | IN list | `shelter=in.(es,th)` |

Full PostgREST docs: https://docs.postgrest.org/en/stable/references/api/tables_views.html

### Example queries

**Total persons by shelter type, all years** *(use `shelter+in_family` dimension set to avoid double-counting)*
```
GET /api/v1/pit_counts
  ?select=year,shelter,in_family,n
  &dimension_set=eq.shelter%2Bin_family
  &count_unit=eq.person
  &order=year.asc,shelter.asc
```

**Chronically homeless individuals by shelter type, 2019–2024**
```
GET /api/v1/pit_counts
  ?select=year,shelter,chronic,in_family,n
  &dimension_set=eq.shelter%2Bchronic%2Bin_family
  &year=gte.2019
  &order=year.asc
```

**Veterans by gender, 2024**
```
GET /api/v1/pit_counts
  ?select=shelter,gender,n
  &dimension_set=eq.shelter%2Bveteran%2Bgender
  &year=eq.2024
  &order=shelter.asc,gender.asc
```

**Which dimension sets have data for 2023?**
```
GET /api/v1/pit_coverage
  ?year=eq.2023
  &order=dimension_set.asc
```

> **Avoiding double-counting:** always filter to a single `dimension_set`. Different dimension sets slice the same people in different ways — summing across sets double-counts. See `DIMENSIONS.md §4` for the full catalog.

---

## Data pipeline

### Requirements

- Python 3.x with a virtual environment for extraction
- Node.js 18+ for upload/check scripts
- A Supabase project with the migrations applied

### Setup

```sh
# Python — extract raw data from Excel workbook
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/extract_coc.py "data/PIT-Counts-2007-2024.xlsb"

# Node — install dependencies
npm install

# Create and fill in secrets
touch .env.local
```

`.env.local` requires:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SECRET_KEY=<service-role-key>
```

### Run migrations

Apply `supabase/migrations/` in order via the Supabase SQL editor or CLI.

After applying, refresh the coverage view:
```sql
REFRESH MATERIALIZED VIEW pit_coverage;
```

### Upload data

```sh
npm run upload          # upload data/ac-pit-data.csv → pit_counts
npm run upload -- --dry-run  # preview without writing
npm run check           # sanity-check DB counts against CSV
```

---

## Development

```sh
npm run dev    # start Next.js dev server at http://localhost:3000
npm run build  # production build
npm run lint   # ESLint
```
