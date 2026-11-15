"use server";
import { z } from "zod";
import { fail, type ActionState } from "@/lib/errors";
import { callRpc } from "@/lib/rpc";

export async function markAllReadAction(): Promise<void> {
  await callRpc("mark_notifications_read", { p_ids: null }, { success: "", revalidate: ["/"] });
}

export async function sendAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({
    title: z.string().trim().min(3, "Tajuk diperlukan").max(150),
    body: z.string().trim().min(3, "Mesej diperlukan").max(2000),
    link: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\/[A-Za-z0-9/_-]*$/, "Pautan dalaman sahaja (cth. /ahli/korban)").optional()),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sila semak pengumuman.", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), [i.message]])));
  const res = await callRpc<number>("send_announcement", { p_title: parsed.data.title, p_body: parsed.data.body, p_link: parsed.data.link ?? null }, {
    success: "Pengumuman dihantar.", revalidate: ["/"],
  });
  if (res?.ok) res.message = `Pengumuman dihantar kepada ${res.data} ahli.`;
  return res;
}
