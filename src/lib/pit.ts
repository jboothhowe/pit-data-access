import { createServerClient } from "./supabase";
import type { Shelter, TimeSeriesPoint } from "@/types/pit";

/**
 * Total persons per shelter type per year, summing individuals + families.
 * Uses the `shelter+in_family` dimension set (person counts only).
 * Returns one TimeSeriesPoint per year, with a key per shelter type.
 */
export async function fetchShelterTimeSeries(): Promise<TimeSeriesPoint[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("pit_counts")
    .select("year, shelter, n")
    .eq("dimension_set", "shelter+in_family")
    .eq("count_unit", "person")
    .order("year", { ascending: true });

  if (error) throw new Error(`fetchShelterTimeSeries: ${error.message}`);

  // Aggregate: sum individual + family per (year, shelter)
  const byYear = new Map<number, TimeSeriesPoint>();
  for (const row of data ?? []) {
    const { year, shelter, n: count } = row as {
      year: number;
      shelter: Shelter;
      n: number;
    };
    if (!byYear.has(year)) byYear.set(year, { year });
    const point = byYear.get(year)!;
    point[shelter] = (point[shelter] ?? 0) + count;
  }

  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}
