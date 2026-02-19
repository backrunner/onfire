"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { Search, X, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

interface SearchResult {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerEmail: string;
  productId: string;
  productName: string;
  teamId: string;
  teamName: string;
  assigneeId: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const statusColors: Record<TicketStatus, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  [TicketStatus.New]: "warning",
  [TicketStatus.Processing]: "default",
  [TicketStatus.Replied]: "success",
  [TicketStatus.Escalated]: "destructive",
  [TicketStatus.Closed]: "secondary",
};

const priorityColors: Record<TicketPriority, "default" | "secondary" | "destructive" | "outline" | "warning"> = {
  [TicketPriority.High]: "destructive",
  [TicketPriority.Medium]: "warning",
  [TicketPriority.Low]: "secondary",
};

export default function SearchPage() {
  const { t } = useI18n();
  const router = useRouter();

  // Search state
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [overdue, setOverdue] = useState(false);

  // Results state
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const performSearch = useCallback(async (page = 1) => {
    setLoading(true);
    setSearched(true);

    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (customerEmail) params.set("customerEmail", customerEmail);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (overdue) params.set("overdue", "true");
    params.set("page", page.toString());

    try {
      const res = await fetch(`/api/tob/search?${params.toString()}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok: boolean;
        data: { tickets: SearchResult[]; pagination: Pagination };
      };

      if (data.ok) {
        setResults(data.data.tickets);
        setPagination(data.data.pagination);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  }, [query, status, priority, customerEmail, dateFrom, dateTo, overdue]);

  const handleSearch = () => {
    performSearch(1);
  };

  const handleClear = () => {
    setQuery("");
    setStatus("");
    setPriority("");
    setCustomerEmail("");
    setDateFrom("");
    setDateTo("");
    setOverdue(false);
    setResults([]);
    setPagination(null);
    setSearched(false);
  };

  const handlePageChange = (newPage: number) => {
    performSearch(newPage);
  };

  const handleTicketClick = (ticketId: string) => {
    router.push(`/admin/tickets/${ticketId}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.search?.title || "Advanced Search"}</h1>
        <p className="text-muted-foreground">
          {t.search?.subtitle || "Search tickets with multiple filters"}
        </p>
      </div>

      {/* Search Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t.search?.filters || "Search Filters"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>{t.search?.keyword || "Keyword"}</Label>
              <Input
                placeholder={t.search?.keywordPlaceholder || "Subject, content, ID..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>

            <div className="space-y-2">
              <Label>{t.common.status}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder={t.tickets.filters.allStatus} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t.tickets.filters.allStatus}</SelectItem>
                  {Object.values(TicketStatus).map((s) => (
                    <SelectItem key={s} value={s}>
                      {t.tickets.status[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t.common.priority}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue placeholder={t.tickets.filters.allPriority} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t.tickets.filters.allPriority}</SelectItem>
                  {Object.values(TicketPriority).map((p) => (
                    <SelectItem key={p} value={p}>
                      {t.tickets.priority[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t.search?.customerEmail || "Customer Email"}</Label>
              <Input
                placeholder="customer@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t.search?.dateFrom || "From Date"}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t.search?.dateTo || "To Date"}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overdue}
                onChange={(e) => setOverdue(e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-sm">{t.tickets.filters.overdueOnly}</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSearch} disabled={loading}>
              <Search className="h-4 w-4 mr-2" />
              {t.common.search}
            </Button>
            <Button variant="outline" onClick={handleClear}>
              <X className="h-4 w-4 mr-2" />
              {t.common.reset}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searched && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t.search?.results || "Results"}
              {pagination && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({pagination.total} {t.search?.found || "found"})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : results.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {t.search?.noResults || "No tickets found matching your criteria"}
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.tickets.detail.ticketId}</TableHead>
                      <TableHead>{t.search?.subject || "Subject"}</TableHead>
                      <TableHead>{t.common.status}</TableHead>
                      <TableHead>{t.common.priority}</TableHead>
                      <TableHead>{t.tickets.detail.customer}</TableHead>
                      <TableHead>{t.tickets.detail.product}</TableHead>
                      <TableHead>{t.tickets.detail.createdAt}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((ticket) => (
                      <TableRow
                        key={ticket.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => handleTicketClick(ticket.id)}
                      >
                        <TableCell className="font-mono text-xs">
                          {ticket.id.slice(-8)}
                          {ticket.isOverdue && (
                            <AlertTriangle className="h-3 w-3 text-destructive inline ml-1" />
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {ticket.subject}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColors[ticket.status]}>
                            {t.tickets.status[ticket.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={priorityColors[ticket.priority]}>
                            {t.tickets.priority[ticket.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {ticket.customerEmail}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ticket.productName}
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      {t.search?.page || "Page"} {pagination.page} / {pagination.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        {t.common.previous}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                      >
                        {t.common.next}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
