"use client";

import { useParams, useRouter } from "next/navigation";
import { TicketDetail } from "@/components/admin/tickets/ticket-detail";

/** Full-page ticket detail for deep links from dashboard/search. */
export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div className="mx-auto h-[calc(100vh-var(--admin-chrome-h,3.5rem)-2rem)] max-w-4xl overflow-hidden rounded-lg border border-border bg-card lg:h-[calc(100vh-var(--admin-chrome-h,3.5rem)-3rem)]">
      <TicketDetail
        key={params.id}
        ticketId={params.id}
        fullPage
        onBack={() => router.push("/admin/tickets")}
      />
    </div>
  );
}
