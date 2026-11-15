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
      <h1 className="text-2xl font-bold">Semak e-mel anda</h1>
      <p className="text-sm text-muted-foreground">
        Kami telah menghantar pautan pengesahan. Klik pautan tersebut untuk mengesahkan e-mel anda. Selepas itu,
        permohonan anda akan berstatus <strong>Menunggu Kelulusan</strong> sehingga disemak oleh Super Admin.
      </p>
      <Button asChild variant="outline" className="w-full"><Link href="/log-masuk">Kembali ke log masuk</Link></Button>
    </div>
  );
}
