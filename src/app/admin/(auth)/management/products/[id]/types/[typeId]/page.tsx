"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { swrFetcher } from "@/lib/api/client";
import { useMe } from "@/lib/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ManagementPanelSkeleton } from "@/components/admin/loading-skeletons";
import {
  ticketTypePathLabel,
  type TicketTypeAdminView,
} from "../../../../_components/ticket-type-management";

// The version manager pulls in the form-builder chain; keep it out of the
// page shell chunk so dev compiles it only when this page is visited.
const TicketTemplateVersionManagement = dynamic(
  () =>
    import("../../../../_components/ticket-template-version-management").then(
      (m) => m.TicketTemplateVersionManagement
    ),
  { loading: () => <ManagementPanelSkeleton columns={5} /> }
);

function TicketTypePageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-9 shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <ManagementPanelSkeleton columns={5} />
    </div>
  );
}

export default function TicketTypeTemplatePage() {
  const { t } = useI18n();
  const { can, isLoading: meLoading } = useMe();
  const { id: productId, typeId } = useParams<{ id: string; typeId: string }>();
  const { data: types, isLoading } = useSWR<TicketTypeAdminView[]>(
    `/api/tob/admin/ticket-types?productId=${encodeURIComponent(productId)}`,
    swrFetcher
  );
  const byId = useMemo(
    () => new Map((types ?? []).map((item) => [item.id, item])),
    [types]
  );
  const type = types?.find((item) => item.id === typeId);

  if (isLoading || meLoading) return <TicketTypePageSkeleton />;
  if (!type || type.productId !== productId || !can("ticket_template.read")) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t.management.noPermission}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild aria-label={t.common.back}>
          <Link href={`/admin/management/products/${productId}?tab=types`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{ticketTypePathLabel(type, byId)}</h1>
          <p className="text-sm text-muted-foreground">
            {t.management.ticketTemplates.title}
          </p>
        </div>
      </div>
      <TicketTemplateVersionManagement ticketTypeId={typeId} productId={productId} />
    </div>
  );
}
