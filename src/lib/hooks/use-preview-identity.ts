"use client";

import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { canStartPreview } from "@/lib/api-utils";

export function usePreviewIdentity() {
  const { t } = useI18n();
  const router = useRouter();
  const { me, mutate } = useMe();
  const { mutate: mutateAll } = useSWRConfig();
  const preview = me?.preview ?? null;
  const canStart = Boolean(me && !preview && canStartPreview(me.role));

  const refreshAfterSwitch = async () => {
    await mutate();
    await mutateAll(() => true, undefined, { revalidate: true });
    router.replace("/admin");
  };

  const start = async (userId: string) => {
    await api.post("/api/tob/preview", { userId });
    toast.success(t.preview.started);
    await refreshAfterSwitch();
  };

  const stop = async (options?: { silent?: boolean }) => {
    await api.delete("/api/tob/preview");
    if (options?.silent) {
      await mutate();
      return;
    }
    toast.success(t.preview.stopped);
    await refreshAfterSwitch();
  };

  return { preview, canStart, start, stop };
}
