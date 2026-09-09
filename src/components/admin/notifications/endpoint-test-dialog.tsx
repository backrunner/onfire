"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { ProductSelect, useProducts } from "@/components/admin/product-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { EndpointView } from "./channel-meta";

export function EndpointTestDialog({
  endpoint,
  open,
  onOpenChange,
}: {
  endpoint: EndpointView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const productsState = useProducts();
  const [productId, setProductId] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setProductId("");
  }, [open, endpoint?.id]);

  const submit = async () => {
    if (!endpoint) return;
    setPending(true);
    try {
      const result = await api.post<{ queued?: boolean }>(`/api/tob/notification-endpoints/${endpoint.id}/test`, {
        ...(endpoint.channelType === "email" && { productId }),
      });
      toast.success(result.queued ? t.notifChannels.testQueued : t.notifChannels.testSent);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : t.notifChannels.testFailed
      );
    } finally {
      setPending(false);
    }
  };

  const needsProduct = endpoint?.channelType === "email";

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{t.notifChannels.testEndpoint}</DialogTitle>
          <DialogDescription>
            {t.notifChannels.testEndpointDescription.replace(
              "{{name}}",
              endpoint?.name ?? ""
            )}
          </DialogDescription>
        </DialogHeader>
        {needsProduct ? (
          <div className="space-y-2 px-6 pb-5">
            <Label>{t.notifChannels.testProduct}</Label>
            {productsState.error ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                <p className="text-xs text-destructive">
                  {t.notifChannels.productsLoadFailed}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void productsState.mutate()}
                >
                  <RefreshCw className="size-3" />
                  {t.notifChannels.retry}
                </Button>
              </div>
            ) : (
              <ProductSelect
                value={productId}
                onChange={setProductId}
                placeholder={t.notifChannels.selectProduct}
                emptyLabel={t.notifChannels.noTestProducts}
                autoSelectFirst
                className="w-full"
              />
            )}
          </div>
        ) : null}
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={
              pending ||
              !endpoint ||
              (needsProduct && (!productId || Boolean(productsState.error)))
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t.notifChannels.sendTest}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
