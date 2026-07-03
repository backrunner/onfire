"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, List, PlusCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { TocCreateTicketResult } from "@/lib/toc/portal";
import { TocPortalShell } from "@/components/toc/portal-shell";
import { TicketForm } from "@/components/toc/ticket-form";
import { TicketList } from "@/components/toc/ticket-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function SubmitSuccess({
  result,
  onViewTicket,
  onSubmitAnother,
}: {
  result: TocCreateTicketResult;
  onViewTicket: () => void;
  onSubmitAnother: () => void;
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
          <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t.toc.submit.successTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {t.toc.submit.successMessage}
          </p>
        </div>
        <p className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm">
          {t.toc.submit.ticketIdLabel}: #{result.ticketId.slice(-8)}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onViewTicket}>{t.toc.submit.viewTicket}</Button>
          <Button variant="outline" onClick={onSubmitAnother}>
            {t.toc.submit.submitAnother}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TocHomePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("submit");
  const [submitted, setSubmitted] = useState<TocCreateTicketResult | null>(null);

  return (
    <TocPortalShell>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="submit" className="gap-1.5">
            <PlusCircle className="size-4" />
            {t.toc.tabs.submit}
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="size-4" />
            {t.toc.tabs.list}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submit" className="mt-0">
          {submitted ? (
            <SubmitSuccess
              result={submitted}
              onViewTicket={() => router.push(`/tickets/${submitted.ticketId}`)}
              onSubmitAnother={() => setSubmitted(null)}
            />
          ) : (
            <TicketForm onSuccess={setSubmitted} />
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-0">
          <TicketList onSelect={(ticketId) => router.push(`/tickets/${ticketId}`)} />
        </TabsContent>
      </Tabs>
    </TocPortalShell>
  );
}
