import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // everything except static assets, PWA files, images and the static start page /buka
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|buka$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
