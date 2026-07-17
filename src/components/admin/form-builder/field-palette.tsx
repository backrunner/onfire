"use client";

import { Button } from "@/components/ui/button";
import { FormFieldType } from "@/lib/form-schema";
import { useI18n } from "@/lib/i18n";
import {
  Type,
  AlignLeft,
  Hash,
  Mail,
  ChevronDown,
  Circle,
  CheckSquare,
  Calendar,
  type LucideIcon,
} from "lucide-react";

interface FieldPaletteProps {
  onAddField: (type: FormFieldType) => void;
}

const FIELD_ICONS: Array<{ type: FormFieldType; icon: LucideIcon }> = [
  { type: "text", icon: Type },
  { type: "textarea", icon: AlignLeft },
  { type: "number", icon: Hash },
  { type: "email", icon: Mail },
  { type: "select", icon: ChevronDown },
  { type: "radio", icon: Circle },
  { type: "checkbox", icon: CheckSquare },
  { type: "date", icon: Calendar },
];

export function FieldPalette({ onAddField }: FieldPaletteProps) {
  const { t } = useI18n();
  const types = t.formBuilder.types;

  return (
    <div className="space-y-2">
      <h3 className="font-medium text-sm text-muted-foreground mb-3">
        {t.formBuilder.fieldTypes}
      </h3>
      <div className="grid grid-cols-2 gap-1 md:block md:space-y-1">
        {FIELD_ICONS.map(({ type, icon: Icon }) => (
          <Button
            key={type}
            variant="ghost"
            className="h-auto w-full justify-start px-2 py-2 md:px-3"
            onClick={() => onAddField(type)}
          >
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <div className="shrink-0 rounded bg-muted p-1.5">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 text-left">
                <div className="truncate text-sm font-medium">{types[type]}</div>
                <div className="hidden text-xs text-muted-foreground md:block">
                  {types[`${type}Desc` as keyof typeof types]}
                </div>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
