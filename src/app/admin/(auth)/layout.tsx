import { getAdminContext } from "@/lib/auth/admin-context";
import { getMe } from "@/services/admin/me";
import { AdminDataProvider } from "@/components/admin/admin-data-provider";
import { AdminShell } from "@/components/admin/shell/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getMe(await getAdminContext());
  return <AdminDataProvider me={me}><AdminShell>{children}</AdminShell></AdminDataProvider>;
}
