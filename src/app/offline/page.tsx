import { WifiOff } from "lucide-react";

export const metadata = { title: "Luar Talian" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
        <WifiOff className="size-7" />
      </span>
      <h1 className="text-xl font-bold">Tiada sambungan internet</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        KoopKITA memerlukan sambungan internet. Untuk melindungi data kewangan dan peribadi, rekod tidak disimpan untuk
        kegunaan luar talian. Sila cuba semula apabila anda kembali dalam talian.
      </p>
    </main>
  );
}
