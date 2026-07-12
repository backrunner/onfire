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
      <div className="space-y-1">
        {FIELD_ICONS.map(({ type, icon: Icon }) => (
          <Button
            key={type}
            variant="ghost"
            className="w-full justify-start h-auto py-2"
            onClick={() => onAddField(type)}
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded bg-muted">
                <Icon className="size-4" />
              </div>
              <div className="text-left">
                <div className="font-medium text-sm">{types[type]}</div>
                <div className="text-xs text-muted-foreground">
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
