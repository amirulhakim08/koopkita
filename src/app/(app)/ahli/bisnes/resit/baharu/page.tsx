import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DirectReceiptEditor } from "@/features/business/direct-receipt-editor";
import type { CustomerLite } from "@/features/business/customer-match";
import type { CatalogOption } from "@/features/business/line-items";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Resit Jualan Langsung" };

export default async function NewDirectReceiptPage() {
  const { userId } = await requireActiveMember();
  const supabase = await createClient();
  const { data: business } = await supabase.from("business_profiles").select("id, sst_enabled, sst_rate_bp, default_notes, suspended_at").eq("owner_id", userId).maybeSingle();
  if (!business || business.suspended_at) redirect("/ahli/bisnes?tab=profil");
  const [{ data: customers }, { data: catalog }] = await Promise.all([
    supabase.from("business_customers").select("id, name, phone").eq("business_id", business.id).order("name"),
    supabase.from("business_catalog_items").select("id, name, price_sen").eq("business_id", business.id).eq("active", true).order("name"),
  ]);
  return (
    <>
      <Link href="/ahli/bisnes?tab=resit" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Bisnes Saya</Link>
      <PageHeader title="Resit jualan langsung" description="Untuk jualan yang dibayar terus. Tidak perlu invois." />
      <DirectReceiptEditor customers={(customers ?? []) as CustomerLite[]} catalog={(catalog ?? []) as CatalogOption[]} userId={userId}
        taxRateBp={business.sst_enabled ? business.sst_rate_bp : 0} defaultNotes={business.default_notes} />
    </>
  );
}
