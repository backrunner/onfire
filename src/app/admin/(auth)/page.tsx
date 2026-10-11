import { getAdminContext } from "@/lib/auth/admin-context";
import { getDashboard } from "@/services/admin/dashboard";
import { Dashboard } from "@/components/admin/dashboard";
import { hasPermission } from "@/lib/types";
import { notFound } from "next/navigation";

export default async function AdminDashboardPage() {
  const ctx = await getAdminContext();
  if (!hasPermission(ctx.role, "ticket.read")) notFound();
  return <Dashboard initialData={await getDashboard(ctx)} />;
}
