import { redirect } from "next/navigation";

export default function LegacyAdminAiPage() {
  redirect("/admin/management?tab=aiCredentials");
}
