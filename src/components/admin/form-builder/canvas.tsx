"use client";

import { FormFieldSchema } from "@/lib/form-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";

interface CanvasProps {
  fields: FormFieldSchema[];
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onReorderFields: (fields: FormFieldSchema[]) => void;
  onDeleteField: (id: string) => void;
}

export function Canvas({
  fields,
  selectedFieldId,
  onSelectField,
  onReorderFields,
  onDeleteField,
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
    <div className="flex-1 space-y-2 p-4 border rounded-lg bg-muted/30 overflow-auto">
      {fields.map((field, index) => (
        <div
          key={field.id}
          className={cn(
            "flex items-center gap-2 p-3 bg-background rounded-lg border cursor-pointer transition-colors",
            selectedFieldId === field.id
              ? "border-primary ring-1 ring-primary"
              : "hover:border-muted-foreground/50"
          )}
          onClick={() => onSelectField(field.id)}
        >
          <div className="cursor-grab text-muted-foreground">
            <GripVertical className="size-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate text-sm">{field.label}</span>
              {field.required && (
                <span className="text-destructive text-sm">*</span>
              )}
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                {fb.types[field.type]}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {field.key}
              {field.helpText && ` - ${field.helpText}`}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {index > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={fb.moveUp}
                onClick={(e) => {
                  e.stopPropagation();
                  moveField(index, index - 1);
                }}
              >
                <ChevronUp className="size-4" />
              </Button>
            )}
            {index < fields.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={fb.moveDown}
                onClick={(e) => {
                  e.stopPropagation();
                  moveField(index, index + 1);
                }}
              >
                <ChevronDown className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:text-destructive"
              aria-label={t.common.delete}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteField(field.id);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
