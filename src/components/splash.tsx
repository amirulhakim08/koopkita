/** Full-screen KoopKITA loading screen: shown while the app opens and while the start page decides where to go. */
export function Splash({ message = "Memuatkan…" }: { message?: string }) {
  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#1b4332] text-white" role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={88} height={88} className="size-22 rounded-3xl shadow-lg ring-2 ring-white/30" />
      <div className="text-center">
        <p className="text-3xl font-extrabold tracking-tight">KoopKITA</p>
        <p className="mt-1 text-sm text-white/75">Koperasi Industri Tani Agropelancongan Kedah</p>
      </div>
      <span className="size-9 animate-spin rounded-full border-4 border-white/25 border-t-[#f2b632]" aria-hidden="true" />
      <p className="text-sm text-white/80">{message}</p>
    </main>
  );
}
