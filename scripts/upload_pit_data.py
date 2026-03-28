"""
Upload data/ac-pit-data.csv into the Supabase pit_data table.

Prerequisites:
    pip install psycopg2-binary pandas python-dotenv

    Create a .env file in the project root (copy .env.example and fill in values).

Usage:
    python scripts/upload_pit_data.py [--dry-run]

    --dry-run   Print the first row as a dict and exit without writing to the database.
"""

import os
import re
import sys
import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "ac-pit-data.csv")
TABLE = "pit_data"

IDENTIFIER_COLS = {"Year", "CoC Number", "CoC Name", "CoC Category", "Count Types"}


def sanitize(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def build_col_map(raw_cols: list[str]) -> dict[str, str]:
    """Map original CSV column names to sanitized SQL column names."""
    seen: dict[str, int] = {}
    result: dict[str, str] = {}
    for raw in raw_cols:
        s = sanitize(raw)
        if s in seen:
            seen[s] += 1
            s = f"{s}_{seen[s]}"
        else:
            seen[s] = 0
        result[raw] = s
    return result


def load_csv(path: str) -> tuple[pd.DataFrame, dict[str, str]]:
    df = pd.read_csv(path, dtype=str)
    col_map = build_col_map(list(df.columns))
    df = df.rename(columns=col_map)
    # Convert identifier columns to appropriate types; leave metrics as-is
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    # Replace empty strings with None so they become SQL NULL
    df = df.where(df.notna() & (df != ""), other=None)
    # Numeric metric columns: cast to float (NaN → None already handled above)
    non_id_cols = [c for c in df.columns if c not in {"year", "coc_number", "coc_name", "coc_category", "count_types"}]
    df[non_id_cols] = df[non_id_cols].apply(pd.to_numeric, errors="coerce")
    return df, col_map


def upsert(conn, df: pd.DataFrame) -> None:
    cols = list(df.columns)
    placeholders = ", ".join(["%s"] * len(cols))
    col_names = ", ".join(cols)
    # ON CONFLICT on year: update all non-year columns
    update_cols = [c for c in cols if c != "year"]
    update_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)

    sql = (
        f"INSERT INTO {TABLE} ({col_names}) VALUES ({placeholders}) "
        f"ON CONFLICT (year) DO UPDATE SET {update_clause}"
    )

    records = [
        tuple(None if pd.isna(v) else v for v in row)
        for row in df.itertuples(index=False, name=None)
    ]

    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, sql, records, page_size=50)
    conn.commit()
    print(f"Upserted {len(records)} rows into {TABLE}.")


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("Error: SUPABASE_DB_URL not set. Check your .env file.")
        sys.exit(1)

    print(f"Loading {DATA_FILE} ...")
    df, _ = load_csv(DATA_FILE)
    print(f"  {len(df)} rows × {len(df.columns)} columns")

    if dry_run:
        print("\n-- dry run: first row --")
        print(df.iloc[0].to_dict())
        return

    print(f"Connecting to database ...")
    conn = psycopg2.connect(db_url)
    try:
        upsert(conn, df)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
