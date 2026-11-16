import Link from "next/link";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pasang Aplikasi" };

export default function InstallPage() {
  return (
    <div className="space-y-6">
      <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary"><Smartphone className="size-7" /></span>
      <h1 className="text-2xl font-bold">Pasang KoopKITA pada telefon anda</h1>
      <div className="space-y-4 text-sm">
        <section className="rounded-xl border p-4">
          <h2 className="mb-2 font-semibold">iPhone / iPad (Safari)</h2>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Buka KoopKITA dalam Safari.</li>
            <li>Tekan butang <strong>Kongsi</strong> (petak dengan anak panah ke atas).</li>
            <li>Pilih <strong>Tambah ke Skrin Utama</strong>, kemudian <strong>Tambah</strong>.</li>
          </ol>
        </section>
        <section className="rounded-xl border p-4">
          <h2 className="mb-2 font-semibold">Android (Chrome)</h2>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Buka KoopKITA dalam Chrome.</li>
            <li>Tekan menu <strong>⋮</strong> di penjuru atas kanan.</li>
            <li>Pilih <strong>Pasang aplikasi</strong> atau <strong>Tambah ke skrin utama</strong>.</li>
          </ol>
        </section>
        <section className="rounded-xl border p-4">
          <h2 className="mb-2 font-semibold">Komputer (Chrome / Edge)</h2>
          <p className="text-muted-foreground">Klik ikon pasang di hujung bar alamat, kemudian <strong>Pasang</strong>.</p>
        </section>
        <p className="text-xs text-muted-foreground">Untuk keselamatan, rekod kewangan dan data peribadi tidak disimpan pada peranti untuk kegunaan luar talian.</p>
      </div>
      <Button asChild className="w-full"><Link href="/">Teruskan ke KoopKITA</Link></Button>
    </div>
  );
}
