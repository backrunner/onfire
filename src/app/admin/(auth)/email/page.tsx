import { redirect } from "next/navigation";

export default async function LegacyAdminEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  const { productId } = await searchParams;
  if (productId) {
    redirect(`/admin/management/products/${encodeURIComponent(productId)}?tab=email`);
  }
  redirect("/admin/management?tab=email");
}
