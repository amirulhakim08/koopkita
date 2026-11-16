import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sahkan E-mel" };

export default function CheckEmailPage() {
  return (
    <div className="space-y-5 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
        <MailCheck className="size-7" />
      </span>
      <h1 className="text-2xl font-bold">Permohonan dihantar</h1>
      <p className="text-sm text-muted-foreground">
        Permohonan keahlian anda telah diterima dan akan disemak oleh Super Admin. Anda boleh log masuk sebaik sahaja
        permohonan <strong>diluluskan</strong>. Jika anda menerima e-mel pengesahan, anda boleh klik pautan tersebut, tetapi
        ia tidak wajib.
      </p>
      <Button asChild variant="outline" className="w-full"><Link href="/log-masuk">Kembali ke log masuk</Link></Button>
    </div>
  );
}
