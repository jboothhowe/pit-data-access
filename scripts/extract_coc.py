"""
Extract CA-502 rows across all year sheets from a point-in-time count workbook.
Produces a single output sheet with one row per year, outer-joining all columns.

Usage:
    pip install openpyxl pandas
    python extract_coc.py <input_file.xlsb> [output_file.xlsx]

    If output_file is omitted, writes to ca502_extract.xlsx in the same directory.

Note: .xlsb files require the pyxlsb library:
    pip install pyxlsb
"""

import sys
import os
import pandas as pd


COC_ID = "CA-502"
COC_COLUMN = "CoC Number"  # Column A header — adjust if named differently in your file


def detect_engine(path: str) -> str:
    return "pyxlsb" if path.lower().endswith(".xlsb") else "openpyxl"


def read_all_sheets(path: str, engine: str) -> dict[str, pd.DataFrame]:
    print(f"Reading workbook: {path}")
    sheets = pd.read_excel(path, sheet_name=None, engine=engine, dtype=str)
    print(f"Found {len(sheets)} sheets: {list(sheets.keys())}")
    return sheets


def find_coc_column(df: pd.DataFrame, sheet_name: str) -> str | None:
    """
    Find the CoC Number column. Tries the configured name first, then
    falls back to column A (index 0) if the header doesn't match.
    """
    if COC_COLUMN in df.columns:
        return COC_COLUMN
    # Try column A by position
    first_col = df.columns[0]
    print(f"  [{sheet_name}] '{COC_COLUMN}' not found — using first column '{first_col}'")
    return first_col


def extract_coc_row(df: pd.DataFrame, sheet_name: str) -> pd.DataFrame | None:
    col = find_coc_column(df, sheet_name)
    if col is None:
        print(f"  [{sheet_name}] Skipping — no usable CoC column found")
        return None

    # Strip whitespace before matching
    mask = df[col].str.strip() == COC_ID
    matched = df[mask]

    if matched.empty:
        print(f"  [{sheet_name}] No row found for {COC_ID}")
        return None

    if len(matched) > 1:
        print(f"  [{sheet_name}] Warning: {len(matched)} rows matched {COC_ID}, using first")

    row = matched.iloc[[0]].copy()
    print(f"  [{sheet_name}] Found {COC_ID} — {len(row.columns)} columns")
    return row


def infer_year(sheet_name: str) -> str:
    """Extract a 4-digit year from the sheet name if present, else use the sheet name."""
    import re
    match = re.search(r"\b(19|20)\d{2}\b", sheet_name)
    return match.group(0) if match else sheet_name


def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_coc.py <input_file.xlsb> [output_file.xlsx]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(input_path), "ca502_extract.xlsx"
    )

    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    engine = detect_engine(input_path)
    print(f"Using engine: {engine}")

    sheets = read_all_sheets(input_path, engine)

    rows = []
    for sheet_name, df in sheets.items():
        if df.empty:
            print(f"  [{sheet_name}] Empty sheet, skipping")
            continue

        row = extract_coc_row(df, sheet_name)
        if row is not None:
            row.insert(0, "Year", infer_year(sheet_name))
            rows.append(row)

    if not rows:
        print(f"\nNo rows found for {COC_ID} in any sheet. Check COC_COLUMN setting.")
        sys.exit(1)

    print(f"\nCombining {len(rows)} rows across years via outer join...")
    combined = pd.concat(rows, axis=0, join="outer", ignore_index=True)

    # Sort by year
    combined = combined.sort_values("Year").reset_index(drop=True)

    col_counts = {col: combined[col].notna().sum() for col in combined.columns}
    print(f"Output shape: {combined.shape[0]} rows × {combined.shape[1]} columns")
    print(f"Columns present in all years: {sum(1 for v in col_counts.values() if v == len(rows))}")
    print(f"Columns with partial coverage: {sum(1 for v in col_counts.values() if 0 < v < len(rows))}")

    combined.to_excel(output_path, index=False, sheet_name="CA-502")
    print(f"\nDone. Output written to: {output_path}")


if __name__ == "__main__":
    main()
