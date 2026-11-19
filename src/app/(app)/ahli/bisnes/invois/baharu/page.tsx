import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { InvoiceEditor } from "@/features/business/invoice-editor";
import type { CustomerLite } from "@/features/business/customer-match";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayKL } from "@/lib/format";

export const metadata = { title: "Invois Baharu" };

export default async function NewInvoicePage() {
  const { userId } = await requireActiveMember();
  const supabase = await createClient();
  const { data: business } = await supabase.from("business_profiles").select("id, sst_enabled, sst_rate_bp, default_notes, suspended_at").eq("owner_id", userId).maybeSingle();
  if (!business || business.suspended_at) redirect("/ahli/bisnes?tab=profil");
  const { data: customers } = await supabase.from("business_customers").select("id, name, phone").eq("business_id", business.id).order("name");
  const today = todayKL();
  const due = new Date(`${today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 14);
  return (
    <>
      <Link href="/ahli/bisnes" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Bisnes Saya</Link>
      <PageHeader title="Invois baharu" />
      <InvoiceEditor customers={(customers ?? []) as CustomerLite[]} taxRateBp={business.sst_enabled ? business.sst_rate_bp : 0}
        draft={{ issue_date: today, due_date: due.toISOString().slice(0, 10), notes: business.default_notes }} />
    </>
  );
}
