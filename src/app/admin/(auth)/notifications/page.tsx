import { redirect } from "next/navigation";

export default async function LegacyAdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  const { productId } = await searchParams;
  if (productId) {
    redirect(`/admin/management/products/${encodeURIComponent(productId)}?tab=notifications`);
  }
  redirect("/admin/management?tab=notifications");
}
