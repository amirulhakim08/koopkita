import Link from "next/link";
import { Leaf, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 size-96 rounded-full bg-white/5 blur-2xl" />
        <Link href="/" className="relative flex items-center gap-2 text-lg font-bold">
          <span className="rounded-lg bg-white/10 p-2"><Leaf className="size-5" /></span> KoopKITA
        </Link>
        <div className="relative space-y-4">
          <p className="text-3xl font-bold leading-tight">Pengurusan koperasi yang telus, selamat dan teratur.</p>
          <p className="max-w-md text-primary-foreground/80">
            Platform dalaman untuk ahli dan pentadbir Koperasi Industri Tani Agro Pelancongan Kedah Berhad.
          </p>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-primary-foreground/70">
          <ShieldCheck className="size-4" /> Akses terhad kepada ahli yang diluluskan sahaja
        </p>
      </aside>
      <main className="flex items-start justify-center px-4 py-10 sm:items-center sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold text-primary lg:hidden">
            <span className="rounded-lg bg-secondary p-2"><Leaf className="size-5" /></span> KoopKITA
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
