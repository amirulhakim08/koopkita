"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Stage = { kind: "loading" } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "verify"; factorId: string };

export function MfaClient() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [stage, setStage] = React.useState<Stage>({ kind: "loading" });
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setError("Tidak dapat memuatkan faktor MFA.");
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setStage({ kind: "verify", factorId: verified.id });
      // remove stale unverified factors before enrolling again
      for (const f of data.all.filter((f) => f.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const enroll = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `KoopKITA ${new Date().toISOString().slice(0, 10)}` });
      if (enroll.error) return setError("Pendaftaran MFA gagal. Pastikan MFA TOTP diaktifkan dalam Supabase Auth.");
      setStage({ kind: "enroll", factorId: enroll.data.id, qr: enroll.data.totp.qr_code, secret: enroll.data.totp.secret });
    })();
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind === "loading") return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: stage.factorId, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) return setError("Kod tidak sah. Sila cuba lagi.");
    router.replace("/admin");
    router.refresh();
  }

  if (stage.kind === "loading") {
    return error ? <Alert tone="danger">{error}</Alert> : <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      {stage.kind === "enroll" && (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm">1. Imbas kod QR ini menggunakan aplikasi pengesah (Google Authenticator, Microsoft Authenticator, 1Password dsb.).</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.qr} alt="Kod QR MFA" className="mx-auto size-48 rounded-lg border bg-white p-2" />
          <p className="break-all text-center font-mono text-xs text-muted-foreground">{stage.secret}</p>
          <p className="text-sm">2. Masukkan kod 6 digit yang dipaparkan.</p>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7}
        placeholder="123456" className="h-12 text-center font-mono text-xl tracking-[0.4em]" aria-label="Kod MFA" autoFocus />
      <Button type="submit" className="w-full" size="lg" disabled={busy || code.replace(/\s/g, "").length !== 6}>
        {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Sahkan
      </Button>
    </form>
  );
}
