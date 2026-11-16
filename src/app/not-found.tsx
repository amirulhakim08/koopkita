import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary"><SearchX className="size-7" /></span>
      <h1 className="text-xl font-bold">Halaman tidak dijumpai</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Rekod ini tidak wujud atau anda tidak mempunyai akses kepadanya.</p>
      <Button asChild variant="outline"><Link href="/">Kembali ke halaman utama</Link></Button>
    </div>
  );
}
