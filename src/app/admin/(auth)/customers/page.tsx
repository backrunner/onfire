import { SWRConfig } from "swr";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/auth/admin-context";
import { hasPermission } from "@/lib/types";
import { listCustomers } from "@/services/admin/customers";
import { getProducts } from "@/services/admin/metadata";
import { Customers } from "@/components/admin/customers";

export default async function AdminCustomersPage() {
  const ctx = await getAdminContext();
  if (!hasPermission(ctx.role, "customer.read")) notFound();
  const [initialData, products] = await Promise.all([listCustomers(ctx, { page: 1, pageSize: 25 }), getProducts(ctx)]);
  return <SWRConfig value={{ fallback: { "/api/tob/meta/products": products } }}><Customers initialData={initialData} /></SWRConfig>;
}
