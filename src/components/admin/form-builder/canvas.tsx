"use client";

import { FormFieldSchema } from "@/lib/form-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface CanvasProps {
  fields: FormFieldSchema[];
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onReorderFields: (fields: FormFieldSchema[]) => void;
  onDeleteField: (id: string) => void;
  /** Translation mode: selection stays enabled, reorder/delete are hidden. */
  readOnly?: boolean;
}

export function Canvas({
  fields,
  selectedFieldId,
  onSelectField,
  onReorderFields,
  onDeleteField,
  readOnly,
}: CanvasProps) {
  const { t } = useI18n();
  const fb = t.formBuilder;

  const moveField = (fromIndex: number, toIndex: number) => {
    const newFields = [...fields];
    const [removed] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, removed);
    onReorderFields(newFields);
  };

  if (fields.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg p-8">
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">{fb.noFields}</p>
          <p className="text-xs">{fb.noFieldsHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full space-y-1.5">
      {fields.map((field, index) => (
        <div
          key={field.id}
          className={cn(
            "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border bg-background transition-colors",
            selectedFieldId === field.id
              ? "border-primary ring-1 ring-primary"
              : "hover:border-muted-foreground/50"
          )}
        >
          <button
            type="button"
            aria-pressed={selectedFieldId === field.id}
            className="block w-full min-w-0 rounded-md px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelectField(field.id)}
          >
            <span className="block text-sm font-medium leading-5 [overflow-wrap:anywhere]">
              {field.label}
              {field.required && <span className="ml-1 text-destructive" aria-label={fb.required}>*</span>}
            </span>
            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="min-w-0 font-mono [overflow-wrap:anywhere]">{field.key}</span>
              <span className="shrink-0 whitespace-nowrap rounded bg-muted px-1.5 py-0.5">
                {fb.types[field.type]}
              </span>
            </span>
            {field.helpText && (
              <span className="mt-1.5 block text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                {field.helpText}
              </span>
            )}
          </button>
          {!readOnly && (
            <div className="flex shrink-0 items-center pr-2">
              <Button type="button" variant="ghost" size="icon" className="size-8"
                aria-label={fb.moveUp} title={fb.moveUp} disabled={index === 0}
                onClick={() => moveField(index, index - 1)}>
                <ChevronUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-8"
                aria-label={fb.moveDown} title={fb.moveDown} disabled={index === fields.length - 1}
                onClick={() => moveField(index, index + 1)}>
                <ChevronDown className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon"
                className="size-8 text-destructive hover:text-destructive"
                aria-label={t.common.delete} title={t.common.delete}
                onClick={() => onDeleteField(field.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
