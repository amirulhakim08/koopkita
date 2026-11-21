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
    link: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\/[A-Za-z0-9/_-]*$/, "Pautan dalaman sahaja (cth. /ahli/projek)").optional()),
    target: z.enum(["all", "selected"]),
    user_ids: z.array(z.string().uuid()).max(5000),
  });
  const parsed = schema.safeParse({ ...Object.fromEntries(formData), user_ids: formData.getAll("user_ids").map(String) });
  if (!parsed.success) return fail("Sila semak notifikasi.", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), [i.message]])));
  const d = parsed.data;
  if (d.target === "selected" && d.user_ids.length === 0) return fail("Sila pilih sekurang-kurangnya seorang ahli.", { user_ids: ["Pilih ahli"] });
  const res = await callRpc<number>("send_member_notification", {
    p_title: d.title, p_body: d.body, p_link: d.link ?? null, p_user_ids: d.target === "all" ? null : d.user_ids,
  }, { success: "Notifikasi dihantar.", revalidate: ["/"] });
  if (res?.ok) res.message = `Notifikasi dihantar kepada ${res.data} ahli.`;
  return res;
}
