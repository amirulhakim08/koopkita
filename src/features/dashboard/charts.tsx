"use client";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { formatRM } from "@/lib/format";

const COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-2)", "var(--chart-5)"];
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const rmShort = (sen: number) => `RM${Math.round(sen / 100).toLocaleString("en-MY")}`;

function Empty() {
  return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Tiada data lagi</div>;
}

export function SalesChart({ data }: { data: { month: string; shares: number; revenue_sen: number }[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={rmShort} width={70} />
        <Tooltip formatter={(v) => formatRM(Number(v))} labelFormatter={(l) => `Bulan ${l}`} />
        <Bar dataKey="revenue_sen" name="Hasil jualan" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={40} />
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

const TYPE_LABEL: Record<string, string> = { standard: "Komisen biasa", full_cattle_incentive: "Insentif seekor penuh", reversal: "Pembalikan", adjustment: "Pelarasan" };

export function CommissionChart({ data }: { data: { entry_type: string; amount_sen: number }[] }) {
  const rows = data.filter((d) => Number(d.amount_sen) > 0).map((d) => ({ name: TYPE_LABEL[d.entry_type] ?? d.entry_type, value: Number(d.amount_sen) }));
  if (!rows.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
          {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => formatRM(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CampaignProgressChart({ data }: { data: { name: string; confirmed: number; reserved: number; available: number }[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 56)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={120} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="confirmed" stackId="a" name="Disahkan" fill="var(--chart-1)" />
        <Bar dataKey="reserved" stackId="a" name="Ditempah" fill="var(--chart-4)" />
        <Bar dataKey="available" stackId="a" name="Tersedia" fill="var(--secondary)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
