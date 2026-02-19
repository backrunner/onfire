"use client";

import { useState, useCallback } from "react";
import {
  FormSchema,
  FormFieldSchema,
  FormFieldType,
  createField,
  createEmptyFormSchema,
  validateFormSchema,
} from "@/lib/form-schema";
import { FieldPalette } from "./field-palette";
import { Canvas } from "./canvas";
import { PropertyPanel } from "./property-panel";
import { Preview } from "./preview";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Save, Eye, FileJson, Upload, AlertCircle } from "lucide-react";

interface FormBuilderProps {
  initialSchema?: FormSchema;
  onSave: (schema: FormSchema) => void;
}

export function FormBuilder({ initialSchema, onSave }: FormBuilderProps) {
  const [schema, setSchema] = useState<FormSchema>(
    initialSchema || createEmptyFormSchema()
  );
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const selectedField = schema.fields.find((f) => f.id === selectedFieldId);

  const handleAddField = useCallback((type: FormFieldType) => {
    const key = `field_${Date.now()}`;
    const newField = createField(type, key);

    // Add default options for select/radio/checkbox
    if (["select", "radio", "checkbox"].includes(type)) {
      newField.options = [
        { label: "Option 1", value: "option1" },
        { label: "Option 2", value: "option2" },
      ];
    }

    setSchema((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setSelectedFieldId(newField.id);
  }, []);

  const handleUpdateField = useCallback((updatedField: FormFieldSchema) => {
    setSchema((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === updatedField.id ? updatedField : f
      ),
    }));
  }, []);

  const handleDeleteField = useCallback((id: string) => {
    setSchema((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== id),
    }));
    setSelectedFieldId(null);
  }, []);

  const handleReorderFields = useCallback((fields: FormFieldSchema[]) => {
    setSchema((prev) => ({ ...prev, fields }));
  }, []);

  const handleSave = () => {
    const errors = validateFormSchema(schema);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    onSave(schema);
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (parsed.version !== "1.0" || !Array.isArray(parsed.fields)) {
        setImportError("Invalid schema format");
        return;
      }
      const errors = validateFormSchema(parsed);
      if (errors.length > 0) {
        setImportError(errors.join(", "));
        return;
      }
      setSchema(parsed);
      setImportError(null);
      setJsonInput("");
    } catch {
      setImportError("Invalid JSON");
    }
  };

  const handleExportJson = () => {
    const json = JSON.stringify(schema, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "form-schema.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Form Preview</DialogTitle>
              </DialogHeader>
              <Preview schema={schema} />
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import JSON Schema</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  placeholder="Paste JSON schema here..."
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  rows={10}
                />
                {importError && (
                  <p className="text-sm text-destructive">{importError}</p>
                )}
                <Button onClick={handleImportJson} className="w-full">
                  Import
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" onClick={handleExportJson}>
            <FileJson className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="p-4 bg-destructive/10 border-b border-destructive/20">
          <div className="flex items-start gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Please fix the following errors:</p>
              <ul className="list-disc list-inside mt-1">
                {validationErrors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Field Palette */}
        <div className="w-56 border-r p-4 overflow-auto">
          <FieldPalette onAddField={handleAddField} />
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          <Tabs defaultValue="edit" className="flex-1 flex flex-col">
            <TabsList className="w-fit">
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="edit" className="flex-1 flex mt-4">
              <Canvas
                fields={schema.fields}
                selectedFieldId={selectedFieldId}
                onSelectField={setSelectedFieldId}
                onReorderFields={handleReorderFields}
                onDeleteField={handleDeleteField}
              />
            </TabsContent>
            <TabsContent value="preview" className="flex-1 mt-4 overflow-auto">
              <div className="max-w-xl mx-auto p-4 border rounded-lg">
                <Preview schema={schema} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Property Editor */}
        <div className="w-72 border-l overflow-auto">
          <PropertyPanel
            field={selectedField || null}
            allFields={schema.fields}
            onChange={handleUpdateField}
            onDelete={() => selectedFieldId && handleDeleteField(selectedFieldId)}
          />
        </div>
      </div>
    </div>
  );
}
