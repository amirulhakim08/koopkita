import { PageHeader } from "@/components/page-header";
import { NotificationList } from "@/features/notifications/notification-list";
import { requireActiveMember } from "@/lib/auth";

export const metadata = { title: "Notifikasi" };

export default async function MemberNotificationsPage() {
  await requireActiveMember();
  return (
    <>
      <PageHeader title="Notifikasi" />
      <NotificationList />
    </>
  );
}
