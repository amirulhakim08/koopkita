import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth";
import { REPORTS } from "@/features/reports/reports";

export const metadata = { title: "Laporan" };

export default async function ReportsPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Laporan & eksport" description="Muat turun laporan dalam format CSV (tarikh dd/mm/yyyy, amaun dalam RM). Setiap eksport direkodkan dalam log audit." />
      <Alert tone="warning" className="mb-6">Sesetengah laporan mengandungi data peribadi. Simpan fail dengan selamat dan padam apabila tidak diperlukan (Akta PDP 2010).</Alert>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(REPORTS).map(([key, r]) => (
          <Card key={key}>
            <CardContent className="flex h-full flex-col gap-3 p-5">
              <span className="w-fit rounded-lg bg-secondary p-2 text-primary"><FileSpreadsheet className="size-5" /></span>
              <div className="flex-1">
                <p className="font-semibold">{r.title}</p>
                <p className="text-sm text-muted-foreground">{r.description}</p>
              </div>
              <Button asChild variant="outline" size="sm"><a href={`/api/eksport/${key}`}><Download /> Muat turun CSV</a></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
