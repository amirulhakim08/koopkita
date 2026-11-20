import type { Metadata } from "next";
import Link from "next/link";
import { Splash } from "@/components/splash";
import { OpenApp } from "./open-app";

/**
 * App start page (manifest start_url). Static and kept by the service worker, so the
 * KoopKITA loading screen appears at once when the app is opened — even while the
 * server is still starting — and then the app continues to "/".
 * It contains no personal data.
 */
export const dynamic = "force-static";
export const metadata: Metadata = { title: { absolute: "KoopKITA" } };

export default function OpenPage() {
  return (
    <>
      <Splash />
      <OpenApp />
      <noscript><Link href="/" className="fixed bottom-8 left-0 right-0 z-50 text-center text-white underline">Teruskan</Link></noscript>
    </>
  );
}
