"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { tocApi, ApiClientError } from "@/lib/api/toc-client";
import { useTocCredentials } from "@/lib/hooks/use-toc-credentials";
import type { TocTicketDetail } from "@/lib/toc/portal";
import { TocPortalShell } from "@/components/toc/portal-shell";
import { TicketDetail } from "@/components/toc/ticket-detail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Card className="py-4">
        <CardContent className="space-y-2.5 px-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-44" />
        </CardContent>
      </Card>
      <Card className="py-4">
        <CardContent className="space-y-4 px-4">
          <Skeleton className="ml-auto h-16 w-3/4 rounded-2xl" />
          <Skeleton className="h-16 w-3/4 rounded-2xl" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function TicketDetailBody({ ticketId }: { ticketId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { isValid } = useTocCredentials();

  const [detail, setDetail] = useState<TocTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"notFound" | "failed" | null>(null);

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await tocApi.get<TocTicketDetail>(
          `/api/toc/tickets/${ticketId}`
        );
        setDetail(data);
        setError(null);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) return;
        if (!silent) {
          setError(
            err instanceof ApiClientError && err.status === 404
              ? "notFound"
              : "failed"
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [ticketId]
  );

  useEffect(() => {
    if (isValid && ticketId) void fetchDetail();
  }, [isValid, ticketId, fetchDetail]);

  const goBack = () => router.push("/");

  if (loading) return <DetailSkeleton />;

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={goBack}
        >
          <ArrowLeft className="size-4" />
          {t.toc.detail.back}
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="font-medium">
              {error === "notFound"
                ? t.toc.errors.ticketNotFound
                : t.toc.errors.loadFailed}
            </p>
            {error !== "notFound" && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t.toc.errors.loadFailedMessage}
                </p>
                <Button variant="outline" size="sm" onClick={() => void fetchDetail()}>
                  {t.toc.errors.retry}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TicketDetail
      ticket={detail.ticket}
      replies={detail.replies}
      onBack={goBack}
      onRefresh={() => void fetchDetail(true)}
    />
  );
}

export default function TocTicketDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <TocPortalShell>
      <TicketDetailBody ticketId={params.id} />
    </TocPortalShell>
  );
}
