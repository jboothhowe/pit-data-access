export type Shelter = "es" | "th" | "sh" | "unsheltered";
export type CountUnit = "person" | "household";

export interface PitCount {
  id: number;
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
  n: number;
  count_unit: CountUnit;
  dimension_set: string;
  source_column: string;
  is_derived: boolean;
}

export interface DimensionSetDef {
  dimension_set: string;
  dimensions: string[];
  count_unit: CountUnit;
  description: string | null;
}

export interface CoverageRow {
  year: number;
  dimension_set: string;
  row_count: number;
}

// ---------------------------------------------------------------------------
// Derived / aggregated shapes used by the UI
// ---------------------------------------------------------------------------

/** One data point in a year-keyed time series, with one numeric key per series. */
export type TimeSeriesPoint = { year: number } & Record<string, number>;
