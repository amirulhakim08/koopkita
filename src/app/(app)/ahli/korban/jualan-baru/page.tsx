import Link from "next/link";
import { Beef } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { BankDetails } from "@/components/bank-details";
import { Button } from "@/components/ui/button";
import { SaleForm } from "@/features/qurban/sale-form";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBankSettings } from "@/lib/queries";
import { todayKL } from "@/lib/format";

export const metadata = { title: "Tambah Jualan Korban" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ kempen?: string }> }) {
  await requireActiveMember();
  const { kempen } = await searchParams;
  const supabase = await createClient();
  const today = todayKL();
  const [{ data: campaigns }, { data: progress }, bank] = await Promise.all([
    supabase.from("campaigns").select("*").eq("status", "open").lte("start_date", today).gte("closing_date", today).order("year", { ascending: false }),
    supabase.from("v_campaign_progress").select("campaign_id, available_slots"),
    getBankSettings(),
  ]);
  const avail = new Map((progress ?? []).map((p) => [p.campaign_id, Number(p.available_slots)]));
  const options = (campaigns ?? []).map((c) => ({
    id: c.id, name: c.name, price_per_share_sen: Number(c.price_per_share_sen), commission_per_share_sen: Number(c.commission_per_share_sen),
    full_cattle_commission_sen: Number(c.full_cattle_commission_sen), available: avail.get(c.id) ?? 0, reservation_expiry_hours: c.reservation_expiry_hours,
  }));

  return (
    <>
      <PageHeader title="Tambah jualan korban" description="Tempah slot, rekod pembeli dan peserta. Pelanggan membayar terus kepada koperasi." />
      <div className="mb-6"><BankDetails bank={bank} /></div>
      {options.length ? (
        <SaleForm campaigns={options} defaultCampaignId={kempen} />
      ) : (
        <EmptyState icon={Beef} title="Tiada kempen dibuka"
          description="Tiada kempen korban yang dibuka untuk jualan pada masa ini."
          action={<Button asChild variant="outline"><Link href="/ahli/korban">Kembali</Link></Button>} />
      )}
    </>
  );
}
