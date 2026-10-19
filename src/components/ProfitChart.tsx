"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/types";

export interface MonthPoint {
  month: string; // short label, e.g. "Aug"
  profit: number;
}

function ProfitTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || payload[0].value === undefined) {
    return null;
  }
  return (
    <div className="card px-3 py-2 text-xs">
      <div className="cap">{label}</div>
      <div className="disp tnum mt-0.5 font-bold">{formatMoney(payload[0].value)}</div>
    </div>
  );
}

export default function ProfitChart({ data }: { data: MonthPoint[] }) {
  return (
    <div className="profit-chart h-56 w-full">
      {/* Pale bars with the latest month picked out in the accent, as in the
          mock; a losing month stays red so it can't pass for a small gain. */}
      <style>{`
        .profit-chart {
          --viz-bar: var(--bar);
          --viz-now: var(--accent);
          --viz-neg: var(--neg);
          --viz-grid: var(--line);
          --viz-text: var(--muted);
        }
      `}</style>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid
            vertical={false}
            stroke="var(--viz-grid)"
            strokeWidth={1}
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--viz-text)", fontSize: 11 }}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--viz-text)", fontSize: 11 }}
            tickFormatter={(v: number) =>
              v.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })
            }
          />
          <ReferenceLine y={0} stroke="var(--viz-grid)" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: "var(--viz-grid)", opacity: 0.35 }}
            content={<ProfitTooltip />}
          />
          <Bar dataKey="profit" maxBarSize={56}>
            {data.map((d, i) => (
              <Cell
                key={d.month}
                fill={
                  d.profit < 0
                    ? "var(--viz-neg)"
                    : i === data.length - 1
                      ? "var(--viz-now)"
                      : "var(--viz-bar)"
                }
                radius={
                  (d.profit >= 0
                    ? [6, 6, 0, 0]
                    : [0, 0, 6, 6]) as unknown as number
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
