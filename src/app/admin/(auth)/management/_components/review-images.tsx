"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { ReviewImage } from "@/lib/filtered-input-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

function PreviewImage({ image, thumbnail = false }: { image: ReviewImage; thumbnail?: boolean }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  if (failed) return <span role={thumbnail ? undefined : "status"} className="flex flex-col items-center gap-2 p-2 text-center text-xs text-muted-foreground"><ImageIcon aria-hidden className="size-5" />{!thumbnail && t.management.filteredInputs.imageUnavailable}</span>;
  // These are untrusted user attachments, not application assets to optimize.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.src} alt={thumbnail ? "" : image.alt} referrerPolicy="no-referrer" loading={thumbnail ? "lazy" : "eager"} onError={() => setFailed(true)} className={thumbnail ? "size-full object-contain" : "max-h-[70dvh] max-w-full object-contain"} />;
}

export function ReviewImages({ images }: { images: ReviewImage[] }) {
  const { t } = useI18n(); const m = t.management.filteredInputs;
  const [selected, setSelected] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  if (!images.length) return null;
  const active = selected === null ? null : images[selected];
  const move = (offset: number) => setSelected((index) => index === null ? null : (index + offset + images.length) % images.length);
  return <section aria-label={m.images} className="mt-4 border-t pt-3">
    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><h3>{m.images}</h3><span className="tabular-nums">{images.length}</span></div>
    <div className="flex gap-2 overflow-x-auto pb-1">
      {images.map((image, index) => <button key={image.src} type="button" aria-label={`${m.viewImage} ${index + 1}`} aria-haspopup="dialog" title={image.alt || (image.remote ? m.externalImage : `${m.viewImage} ${index + 1}`)} className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30 transition-colors hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={(event) => { trigger.current = event.currentTarget; setSelected(index); }}>
        {image.remote ? <span className="flex flex-col items-center gap-1 px-1 text-[10px] text-muted-foreground"><ImageIcon aria-hidden className="size-5" />{m.externalImage}</span> : <PreviewImage image={image} thumbnail />}
      </button>)}
    </div>
    <Dialog open={active !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[92dvh] gap-3 p-4 sm:max-w-5xl" onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }} onKeyDown={(event) => { if (images.length < 2) return; if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
        <DialogTitle className="pr-8 text-sm">{m.images}</DialogTitle>
        <DialogDescription className="sr-only">{m.viewImage}</DialogDescription>
        {active && <div className="flex min-h-40 min-w-0 items-center justify-center overflow-hidden rounded-md bg-muted/30"><PreviewImage key={active.src} image={active} /></div>}
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-muted-foreground" title={active?.alt}>{active?.alt}</p>
          <div className="flex shrink-0 items-center gap-2">
            {images.length > 1 && <Button variant="ghost" size="icon-sm" aria-label={m.previousImage} onClick={() => move(-1)}><ChevronLeft /></Button>}
            <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{(selected ?? 0) + 1} / {images.length}</span>
            {images.length > 1 && <Button variant="ghost" size="icon-sm" aria-label={m.nextImage} onClick={() => move(1)}><ChevronRight /></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
