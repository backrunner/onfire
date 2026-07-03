"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { BellOff, Package, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher, qs, ApiClientError } from "@/lib/api/client";
import { ProductSelect, useProducts } from "@/components/admin/product-select";
import {
  CHANNEL_ICONS,
  type ChannelView,
  type TriggerEvent,
} from "@/components/admin/notifications/channel-meta";
import { ChannelDialog } from "@/components/admin/notifications/channel-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminNotificationsPage() {
  const { t } = useI18n();
  const { data: products, isLoading: productsLoading } = useProducts();
  const [productId, setProductId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChannelView | null>(null);
  const [deleting, setDeleting] = useState<ChannelView | null>(null);

  const listKey = productId
    ? `/api/tob/admin/notification-channels${qs({ productId })}`
    : null;
  const { data, error, isLoading, mutate } = useSWR<ChannelView[]>(
    listKey,
    swrFetcher
  );

  const noProducts = !productsLoading && (products?.length ?? 0) === 0;

  const toggleEnabled = async (channel: ChannelView, enabled: boolean) => {
    try {
      await api.patch(`/api/tob/admin/notification-channels/${channel.id}`, {
        enabled,
      });
      void mutate();
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : t.notifChannels.actionFailed
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/api/tob/admin/notification-channels/${deleting.id}`);
      toast.success(t.notifChannels.deleted);
      void mutate();
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : t.notifChannels.actionFailed
      );
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t.notifChannels.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.notifChannels.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProductSelect
            value={productId}
            onChange={setProductId}
            placeholder={t.notifChannels.selectProduct}
            autoSelectFirst
          />
          <Button
            size="sm"
            className="h-8"
            disabled={!productId}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t.notifChannels.addChannel}
          </Button>
        </div>
      </div>

      {noProducts ? (
        <EmptyCard
          icon={<Package className="size-8 text-muted-foreground/40" />}
          title={t.notifChannels.noProducts}
          hint={t.notifChannels.noProductsHint}
        />
      ) : !productId || isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {t.notifChannels.loadFailed}
            </p>
            <Button variant="outline" size="sm" onClick={() => void mutate()}>
              <RefreshCw className="size-4" />
              {t.notifChannels.retry}
            </Button>
          </CardContent>
        </Card>
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyCard
          icon={<BellOff className="size-8 text-muted-foreground/40" />}
          title={t.notifChannels.empty}
          hint={t.notifChannels.emptyHint}
        />
      ) : (
        <div className="space-y-2">
          {data!.map((channel) => {
            const Icon = CHANNEL_ICONS[channel.channelType];
            return (
              <Card key={channel.id} className="py-0">
                <CardContent className="flex items-center gap-4 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {channel.name}
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {t.notifChannels.types[channel.channelType]}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {channel.triggerEvents.map((event) => (
                        <span
                          key={event}
                          className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 ring-1 ring-inset ring-sky-500/20 dark:text-sky-400"
                        >
                          {t.notifChannels.events[event as TriggerEvent] ?? event}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Switch
                    checked={channel.enabled ?? false}
                    onCheckedChange={(checked) => toggleEnabled(channel, checked)}
                    aria-label={t.notifChannels.enabled}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => {
                      setEditing(channel);
                      setDialogOpen(true);
                    }}
                    aria-label={t.common.edit}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-red-600 hover:text-red-600 dark:text-red-400"
                    onClick={() => setDeleting(channel)}
                    aria-label={t.common.delete}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ChannelDialog
        productId={productId}
        channel={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => void mutate()}
      />

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.notifChannels.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.notifChannels.deleteMessage.replace(
                "{{name}}",
                deleting?.name ?? ""
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={confirmDelete}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyCard({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1.5 py-12 text-center">
        {icon}
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
