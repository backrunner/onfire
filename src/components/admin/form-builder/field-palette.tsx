"use client";

import { Button } from "@/components/ui/button";
import { FormFieldType } from "@/lib/form-schema";
import {
  Type,
  AlignLeft,
  Hash,
  Mail,
  ChevronDown,
  Circle,
  CheckSquare,
  Calendar,
} from "lucide-react";

interface FieldPaletteProps {
  onAddField: (type: FormFieldType) => void;
}

const FIELD_TYPES: Array<{
  type: FormFieldType;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    type: "text",
    label: "Text",
    icon: <Type className="h-4 w-4" />,
    description: "Single line text input",
  },
  {
    type: "textarea",
    label: "Textarea",
    icon: <AlignLeft className="h-4 w-4" />,
    description: "Multi-line text input",
  },
  {
    type: "number",
    label: "Number",
    icon: <Hash className="h-4 w-4" />,
    description: "Numeric input",
  },
  {
    type: "email",
    label: "Email",
    icon: <Mail className="h-4 w-4" />,
    description: "Email address input",
  },
  {
    type: "select",
    label: "Select",
    icon: <ChevronDown className="h-4 w-4" />,
    description: "Dropdown selection",
  },
  {
    type: "radio",
    label: "Radio",
    icon: <Circle className="h-4 w-4" />,
    description: "Single choice options",
  },
  {
    type: "checkbox",
    label: "Checkbox",
    icon: <CheckSquare className="h-4 w-4" />,
    description: "Multiple choice options",
  },
  {
    type: "date",
    label: "Date",
    icon: <Calendar className="h-4 w-4" />,
    description: "Date picker",
  },
];

export function FieldPalette({ onAddField }: FieldPaletteProps) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-sm text-muted-foreground mb-3">
        Field Types
      </h3>
      <div className="space-y-1">
        {FIELD_TYPES.map((field) => (
          <Button
            key={field.type}
            variant="ghost"
            className="w-full justify-start h-auto py-2"
            onClick={() => onAddField(field.type)}
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded bg-muted">{field.icon}</div>
              <div className="text-left">
                <div className="font-medium text-sm">{field.label}</div>
                <div className="text-xs text-muted-foreground">
                  {field.description}
                </div>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
