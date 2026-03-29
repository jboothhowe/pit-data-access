export const dynamic = "force-dynamic";

import { fetchShelterTimeSeries } from "@/lib/pit";
import TimeSeriesChart, {
  SeriesConfig,
} from "@/components/charts/TimeSeriesChart";

const SHELTER_SERIES: SeriesConfig[] = [
  { key: "unsheltered", label: "Unsheltered",          color: "#ef4444" },
  { key: "es",          label: "Emergency Shelter",    color: "#3b82f6" },
  { key: "th",          label: "Transitional Housing", color: "#22c55e" },
  { key: "sh",          label: "Safe Haven",           color: "#f97316" },
];

export default async function HomePage() {
  const data = await fetchShelterTimeSeries();

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Alameda County Homeless Count
        </h1>
        <p className="text-sm text-gray-500">
          Point-in-Time counts 2007–2024 · CoC CA-502 (Oakland / Berkeley / Alameda County)
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
          Total persons by shelter type
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 p-6 shadow-sm">
          {data.length === 0 ? (
            <p className="text-sm text-gray-400 py-12 text-center">
              No data found. Verify that RLS policies are applied and data has been uploaded.
            </p>
          ) : (
            <TimeSeriesChart data={data} series={SHELTER_SERIES} height={380} />
          )}
        </div>
        <p className="text-xs text-gray-400">
          Each line is the sum of individuals and people in families for that
          shelter type. Aggregate shelter categories are excluded to avoid
          double-counting.
        </p>
      </section>
    </main>
  );
}
