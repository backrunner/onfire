"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTocCredentials } from "@/lib/hooks/use-toc-credentials";
import { CredentialError } from "@/components/toc/credential-error";
import { TocHeader } from "@/components/toc/toc-header";
import { TicketDetail } from "@/components/toc/ticket-detail";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { RefreshCw } from "lucide-react";

interface TicketDetailData {
  id: string;
  subject: string;
  content: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerEmail: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

interface Reply {
  id: string;
  content: string;
  senderEmail?: string;
  senderId?: string;
  createdAt: string;
  internal?: boolean;
}

interface CustomerInfo {
  email: string;
  productName?: string;
}

function TicketDetailContent() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;
  const { credentials, isValid, missingFields } = useTocCredentials();

  const [ticket, setTicket] = useState<TicketDetailData | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const productId = credentials.productId || "";
  const token = credentials.token || "";

  const fetchTicket = useCallback(async () => {
    if (!ticketId || !token) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/toc/tickets/${ticketId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as {
        ok: boolean;
        data: { ticket: TicketDetailData; replies: Reply[] };
        error?: string;
      };

      if (data.ok) {
        setTicket(data.data.ticket);
        setReplies(data.data.replies || []);
      } else {
        setError(data.error || "Failed to load ticket");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [ticketId, token]);

  const fetchCustomerInfo = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch("/api/toc/whoami", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { ok: boolean; data: CustomerInfo };
      if (data.ok) {
        setCustomerInfo(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch customer info:", error);
    }
  }, [token]);

  useEffect(() => {
    if (isValid) {
      fetchTicket();
      fetchCustomerInfo();
    }
  }, [isValid, fetchTicket, fetchCustomerInfo]);

  if (!isValid) {
    return <CredentialError missingFields={missingFields} />;
  }

  const handleBack = () => {
    router.push(`/?productId=${productId}&token=${token}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <TocHeader
          productName={customerInfo?.productName}
          customerEmail={customerInfo?.email}
        />
        <main className="flex-1 flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen flex flex-col">
        <TocHeader
          productName={customerInfo?.productName}
          customerEmail={customerInfo?.email}
        />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-destructive">{error || "Ticket not found"}</p>
            <button
              onClick={handleBack}
              className="mt-4 text-sm text-muted-foreground hover:underline"
            >
              Back to tickets
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TocHeader
        productName={customerInfo?.productName}
        customerEmail={customerInfo?.email}
      />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl">
        <TicketDetail
          ticket={ticket}
          replies={replies}
          token={token}
          onBack={handleBack}
          onReplySuccess={fetchTicket}
        />
      </main>
    </div>
  );
}

export default function TocTicketDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-screen">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TicketDetailContent />
    </Suspense>
  );
}
