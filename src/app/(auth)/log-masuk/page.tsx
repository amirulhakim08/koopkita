import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { loginAction } from "@/features/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Log Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; ralat?: string }> }) {
  const { next, ralat } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Log Masuk</h1>
        <p className="text-sm text-muted-foreground">Selamat kembali. Log masuk ke akaun ahli anda.</p>
      </div>
      {!isSupabaseConfigured() && (
        <Alert tone="warning" title="Konfigurasi diperlukan">
          Sambungan Supabase belum dikonfigurasi. Rujuk README untuk menetapkan pemboleh ubah persekitaran.
        </Alert>
      )}
      {ralat && <Alert tone="danger">Pautan pengesahan tidak sah atau telah tamat tempoh. Sila cuba lagi.</Alert>}
      <ActionForm action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <FormField label="E-mel" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </FormField>
        <FormField label="Kata laluan" htmlFor="password" required>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </FormField>
        <div className="flex justify-end">
          <Link href="/lupa-kata-laluan" className="text-sm font-medium text-primary hover:underline">Lupa kata laluan?</Link>
        </div>
        <SubmitButton className="w-full" size="lg">Log Masuk</SubmitButton>
      </ActionForm>
      <p className="text-center text-sm text-muted-foreground">
        Belum menjadi ahli? <Link href="/daftar" className="font-semibold text-primary hover:underline">Daftar keahlian</Link>
      </p>
    </div>
  );
}
