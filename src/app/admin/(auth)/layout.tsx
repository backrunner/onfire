import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { AdminShell } from "@/components/admin/shell/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/admin/login");
  }

  return <AdminShell>{children}</AdminShell>;
}
