import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { QuoteEditor } from "@/features/business/quote-editor";
import type { CustomerLite } from "@/features/business/customer-match";
import type { CatalogOption } from "@/features/business/line-items";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayKL } from "@/lib/format";

export const metadata = { title: "Sebut Harga Baharu" };

export default async function NewQuotePage() {
  const { userId } = await requireActiveMember();
  const supabase = await createClient();
  const { data: business } = await supabase.from("business_profiles").select("id, sst_enabled, sst_rate_bp, default_terms, suspended_at").eq("owner_id", userId).maybeSingle();
  if (!business || business.suspended_at) redirect("/ahli/bisnes?tab=profil");
  const [{ data: customers }, { data: catalog }] = await Promise.all([
    supabase.from("business_customers").select("id, name, phone").eq("business_id", business.id).order("name"),
    supabase.from("business_catalog_items").select("id, name, price_sen").eq("business_id", business.id).eq("active", true).order("name"),
  ]);
  const today = todayKL();
  const valid = new Date(`${today}T00:00:00Z`);
  valid.setUTCDate(valid.getUTCDate() + 30);
  return (
    <>
      <Link href="/ahli/bisnes?tab=sebut-harga" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Bisnes Saya</Link>
      <PageHeader title="Sebut harga baharu" description="Untuk servis, projek dan pelanggan yang perlukan harga sebelum setuju." />
      <QuoteEditor customers={(customers ?? []) as CustomerLite[]} catalog={(catalog ?? []) as CatalogOption[]}
        taxRateBp={business.sst_enabled ? business.sst_rate_bp : 0}
        draft={{ issue_date: today, valid_until: valid.toISOString().slice(0, 10), terms: business.default_terms }} />
    </>
  );
}
