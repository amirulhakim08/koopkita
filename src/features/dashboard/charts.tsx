"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { formatRM } from "@/lib/format";

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const rmShort = (sen: number) => `RM${Math.round(sen / 100).toLocaleString("en-MY")}`;

function Empty() {
  return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Tiada data lagi</div>;
}

/** Member's own business: sales and money received per month. */
export function BusinessChart({ data }: { data: { month: string; sales_sen: number; received_sen: number }[] }) {
  if (!data.some((d) => Number(d.sales_sen) || Number(d.received_sen))) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={rmShort} width={70} />
        <Tooltip formatter={(v) => formatRM(Number(v))} labelFormatter={(l) => `Bulan ${l}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="sales_sen" name="Jualan" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={32} />
        <Bar dataKey="received_sen" name="Diterima" fill="var(--chart-3)" radius={[6, 6, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Admin: capital collected against the target per project. */
export function ProjectCapitalChart({ data }: { data: { name: string; collected: number; remaining: number }[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 56)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={rmShort} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={130} />
        <Tooltip formatter={(v) => formatRM(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="collected" stackId="a" name="Terkumpul" fill="var(--chart-1)" />
        <Bar dataKey="remaining" stackId="a" name="Baki" fill="var(--secondary)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ShareGrowthChart({ data }: { data: { month: string; amount_sen: number }[] }) {
  if (!data.length) return <Empty />;
  const cumulative = data.reduce<{ month: string; total: number }[]>(
    (acc, d) => [...acc, { month: d.month, total: (acc.at(-1)?.total ?? 0) + Number(d.amount_sen) }],
    [],
  );
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={cumulative} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={rmShort} width={70} />
        <Tooltip formatter={(v) => formatRM(Number(v))} />
        <Line type="monotone" dataKey="total" name="Modal syer kumulatif" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
