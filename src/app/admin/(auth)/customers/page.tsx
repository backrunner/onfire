"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, ExternalLink, Search, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { swrFetcher, qs } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils";
import type { CustomerView, Paginated } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ALL_PRODUCTS,
  ProductSelect,
  useProducts,
} from "@/components/admin/product-select";
import { PaginationBar } from "@/components/admin/pagination-bar";

const PAGE_SIZE = 25;

export default function AdminCustomersPage() {
  const { t } = useI18n();
  const { data: products } = useProducts();

  const [productId, setProductId] = useState<string>(ALL_PRODUCTS);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustomerView | null>(null);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, error, isLoading, mutate } = useSWR<Paginated<CustomerView>>(
    `/api/tob/admin/customers${qs({
      productId: productId === ALL_PRODUCTS ? undefined : productId,
      q: query,
      page,
      pageSize: PAGE_SIZE,
    })}`,
    swrFetcher,
    { keepPreviousData: true }
  );

  const productNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products ?? []) map.set(product.id, product.name);
    return map;
  }, [products]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {t.customersPage.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t.customersPage.subtitle}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <ProductSelect
          value={productId}
          onChange={(id) => {
            setProductId(id);
            setPage(1);
          }}
          placeholder={t.customersPage.allProducts}
          allLabel={t.customersPage.allProducts}
        />
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.customersPage.searchPlaceholder}
            className="h-8 pl-8 text-sm"
          />
        </div>
        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t.customersPage.total.replace("{{count}}", String(data.total))}
          </span>
        )}
      </div>

      <Card className="py-0">
        <CardContent className="py-4">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertTriangle className="size-8 text-red-600 dark:text-red-400" />
              <p className="text-sm text-muted-foreground">
                {t.customersPage.loadFailed}
              </p>
              <Button size="sm" variant="outline" onClick={() => mutate()}>
                {t.customersPage.retry}
              </Button>
            </div>
          ) : isLoading && !data ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><Skeleton className="h-3 w-28" /></TableHead>
                  <TableHead><Skeleton className="h-3 w-24" /></TableHead>
                  <TableHead className="w-20"><Skeleton className="h-3 w-12" /></TableHead>
                  <TableHead><Skeleton className="h-3 w-20" /></TableHead>
                  <TableHead className="w-36 text-right"><Skeleton className="ml-auto h-3 w-24" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40 max-w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28 max-w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24 max-w-full" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-3 w-28 max-w-full" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-12 text-center">
              <Users className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {query ? t.customersPage.noResults : t.customersPage.empty}
              </p>
              <p className="text-xs text-muted-foreground">
                {query
                  ? t.customersPage.noResultsHint
                  : t.customersPage.emptyHint}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.customersPage.columns.email}</TableHead>
                    <TableHead>{t.customersPage.columns.externalId}</TableHead>
                    <TableHead className="w-20">
                      {t.customersPage.columns.level}
                    </TableHead>
                    <TableHead>{t.customersPage.columns.product}</TableHead>
                    <TableHead className="w-36 text-right">
                      {t.customersPage.columns.createdAt}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((customer) => (
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(customer)}
                    >
                      <TableCell className="text-sm font-medium">
                        {customer.email || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {customer.externalId || "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {customer.level ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {productNames.get(customer.productId) ??
                          customer.productId}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDateTime(customer.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationBar
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                className="mt-4"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.customersPage.detail.title}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">
                  {t.customersPage.detail.email}
                </dt>
                <dd className="break-all font-medium">
                  {selected.email || "—"}
                </dd>
                <dt className="text-muted-foreground">
                  {t.customersPage.detail.externalId}
                </dt>
                <dd className="break-all">{selected.externalId || "—"}</dd>
                <dt className="text-muted-foreground">
                  {t.customersPage.detail.level}
                </dt>
                <dd className="tabular-nums">{selected.level ?? "—"}</dd>
                <dt className="text-muted-foreground">
                  {t.customersPage.detail.product}
                </dt>
                <dd>
                  {productNames.get(selected.productId) ?? selected.productId}
                </dd>
                <dt className="text-muted-foreground">
                  {t.customersPage.detail.createdAt}
                </dt>
                <dd>{formatDateTime(selected.createdAt)}</dd>
                <dt className="text-muted-foreground">
                  {t.customersPage.detail.updatedAt}
                </dt>
                <dd>{formatDateTime(selected.updatedAt)}</dd>
              </dl>
              <Button asChild size="sm" className="w-full">
                <Link
                  href={`/admin/tickets?q=${encodeURIComponent(
                    selected.email ?? selected.externalId ?? selected.id
                  )}`}
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  {t.customersPage.detail.viewTickets}
                </Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
