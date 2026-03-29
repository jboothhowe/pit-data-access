"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TimeSeriesPoint } from "@/types/pit";

export interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

interface Props {
  data: TimeSeriesPoint[];
  series: SeriesConfig[];
  /** Key in each data point used as the X axis value */
  xKey?: string;
  height?: number;
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDark;
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function TimeSeriesChart({
  data,
  series,
  xKey = "year",
  height = 400,
}: Props) {
  const isDark = useIsDark();

  const chrome = {
    grid:       isDark ? "#374151" : "#e5e7eb",
    tick:       isDark ? "#9ca3af" : "#6b7280",
    tooltipBg:  isDark ? "#1f2937" : "#ffffff",
    tooltipBorder: isDark ? "#374151" : "#e5e7eb",
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 12, fill: chrome.tick }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={formatCount}
          tick={{ fontSize: 12, fill: chrome.tick }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          formatter={(value, name) => {
            const s = series.find((s) => s.key === name);
            const formatted =
              typeof value === "number" ? value.toLocaleString() : String(value);
            return [formatted, s?.label ?? name];
          }}
          labelFormatter={(label) => `Year: ${label}`}
          contentStyle={{
            fontSize: 13,
            borderRadius: 6,
            backgroundColor: chrome.tooltipBg,
            borderColor: chrome.tooltipBorder,
            color: chrome.tick,
          }}
        />
        <Legend
          formatter={(value) =>
            series.find((s) => s.key === value)?.label ?? value
          }
          wrapperStyle={{ fontSize: 13, paddingTop: 12, color: chrome.tick }}
        />
        {series.map(({ key, color }) => (
          <Line
            key={key}
            dataKey={key}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
