"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useTocCredentials } from "@/lib/hooks/use-toc-credentials";
import { CredentialError } from "@/components/toc/credential-error";
import { TocHeader } from "@/components/toc/toc-header";
import { TicketForm } from "@/components/toc/ticket-form";
import { TicketList } from "@/components/toc/ticket-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { PlusCircle, List, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Template {
  id: string;
  title: string;
  categories: string[];
  formSchema?: {
    fields?: Array<{
      key: string;
      label: string;
      type: "text" | "textarea" | "number" | "email" | "select";
      required?: boolean;
      placeholder?: string;
      options?: string[];
    }>;
  };
}

interface TicketSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
}

interface CustomerInfo {
  email: string;
  productName?: string;
}

function TocHomeContent() {
  const { t } = useI18n();
  const router = useRouter();
  const { credentials, isValid, missingFields } = useTocCredentials();
  const [activeTab, setActiveTab] = useState("submit");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(true);

  const productId = credentials.productId || "";
  const token = credentials.token || "";

  const fetchTemplates = useCallback(async () => {
    if (!productId || !token) return;

    try {
      const res = await fetch(`/api/toc/templates?productId=${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { ok: boolean; data: Template[] };
      if (data.ok) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setLoadingTemplates(false);
    }
  }, [productId, token]);

  const fetchTickets = useCallback(async () => {
    if (!productId || !token) return;

    setLoadingTickets(true);
    try {
      const res = await fetch(`/api/toc/tickets?productId=${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { ok: boolean; data: TicketSummary[] };
      if (data.ok) {
        setTickets(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch tickets:", error);
    } finally {
      setLoadingTickets(false);
    }
  }, [productId, token]);

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
      fetchTemplates();
      fetchTickets();
      fetchCustomerInfo();
    }
  }, [isValid, fetchTemplates, fetchTickets, fetchCustomerInfo]);

  if (!isValid) {
    return <CredentialError missingFields={missingFields} />;
  }

  const handleTicketCreated = (ticketId: string) => {
    setActiveTab("list");
    fetchTickets();
  };

  const handleTicketSelect = (ticketId: string) => {
    router.push(`/tickets/${ticketId}?productId=${productId}&token=${token}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TocHeader
        productName={customerInfo?.productName}
        customerEmail={customerInfo?.email}
      />

      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="submit" className="gap-2">
                <PlusCircle className="h-4 w-4" />
                {t.toc.tabs?.submit || "Submit Ticket"}
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-2">
                <List className="h-4 w-4" />
                {t.toc.tabs?.list || "My Tickets"}
              </TabsTrigger>
            </TabsList>

            {activeTab === "list" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchTickets}
                disabled={loadingTickets}
              >
                <RefreshCw className={`h-4 w-4 ${loadingTickets ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>

          <TabsContent value="submit" className="mt-0">
            {loadingTemplates ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <TicketForm
                productId={productId}
                token={token}
                templates={templates}
                onSuccess={handleTicketCreated}
              />
            )}
          </TabsContent>

          <TabsContent value="list" className="mt-0">
            <TicketList
              tickets={tickets}
              loading={loadingTickets}
              onSelect={handleTicketSelect}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default function TocHomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-screen">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TocHomeContent />
    </Suspense>
  );
}
