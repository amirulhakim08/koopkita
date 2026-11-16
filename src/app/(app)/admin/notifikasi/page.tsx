import { PageHeader } from "@/components/page-header";
import { NotificationList } from "@/features/notifications/notification-list";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Notifikasi" };

export default async function AdminNotificationsPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Notifikasi" />
      <NotificationList />
    </>
  );
}
