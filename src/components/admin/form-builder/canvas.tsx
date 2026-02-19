"use client";

import { FormFieldSchema } from "@/lib/form-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical, Trash2 } from "lucide-react";

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
          <p className="text-lg font-medium">No fields yet</p>
          <p className="text-sm">Click a field type on the left to add it</p>
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
            <GripVertical className="h-4 w-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{field.label}</span>
              {field.required && (
                <span className="text-destructive text-sm">*</span>
              )}
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                {field.type}
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
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  moveField(index, index - 1);
                }}
              >
                <span className="sr-only">Move up</span>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
                </svg>
              </Button>
            )}
            {index < fields.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  moveField(index, index + 1);
                }}
              >
                <span className="sr-only">Move down</span>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteField(field.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
