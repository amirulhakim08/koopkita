import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) redirect("/log-masuk");
  const session = await getSession();
  redirect(session ? homeFor(session.profile) : "/log-masuk");
}
