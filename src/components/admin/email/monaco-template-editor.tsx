"use client";

import { useCallback, useEffect, useRef } from "react";
import Editor, {
  loader,
  type BeforeMount,
  type Monaco,
  type OnMount,
} from "@monaco-editor/react";
import * as localMonaco from "monaco-editor";
import type {
  editor as MonacoEditor,
  IDisposable,
  Position,
} from "monaco-editor";
import { useTheme } from "@/components/ui/theme-provider";

loader.config({ monaco: localMonaco });

if (typeof window !== "undefined") {
  globalThis.MonacoEnvironment = {
    ...globalThis.MonacoEnvironment,
    getWorker(_workerId, label) {
      if (label === "html" || label === "handlebars" || label === "razor") {
        return new Worker(
          new URL(
            "monaco-editor/esm/vs/language/html/html.worker.js",
            import.meta.url
          ),
          { type: "module" }
        );
      }
      return new Worker(
        new URL(
          "monaco-editor/esm/vs/editor/editor.worker.js",
          import.meta.url
        ),
        { type: "module" }
      );
    },
  };
}

const VARIABLE_PATTERN = /\{\{[a-zA-Z0-9_]+\}\}/g;

export interface EmailTemplateEditorApi {
  insertVariable: (variable: string) => void;
  formatDocument: () => Promise<void>;
  minifyDocument: () => void;
}

export interface MonacoTemplateEditorProps {
  value: string;
  variables: string[];
  ariaLabel: string;
  loadingLabel: string;
  minifyActionLabel: string;
  onChange: (value: string) => void;
  onReady?: (api: EmailTemplateEditorApi | null) => void;
}

function minifyHtmlFragment(value: string): string {
  const document = new DOMParser().parseFromString(
    `<template id="onfire-email-template">${value}</template>`,
    "text/html"
  );
  const template = document.querySelector<HTMLTemplateElement>(
    "#onfire-email-template"
  );
  if (!template) return value.trim();

  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_TEXT
  );
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }
  for (const node of textNodes) {
    if (node.parentElement?.closest("pre,code,style,script")) continue;
    node.data = node.data.replace(/\s+/g, " ");
  }
  return template.innerHTML.trim();
}

function updateVariableDecorations(
  instance: MonacoEditor.IStandaloneCodeEditor,
  monaco: Monaco,
  collection: MonacoEditor.IEditorDecorationsCollection
) {
  const model = instance.getModel();
  if (!model) return;

  const decorations: MonacoEditor.IModelDeltaDecoration[] = [];
  for (const match of model.getValue().matchAll(VARIABLE_PATTERN)) {
    if (match.index === undefined) continue;
    const start = model.getPositionAt(match.index);
    const end = model.getPositionAt(match.index + match[0].length);
    decorations.push({
      range: new monaco.Range(
        start.lineNumber,
        start.column,
        end.lineNumber,
        end.column
      ),
      options: {
        inlineClassName: "onfire-monaco-variable",
        inlineClassNameAffectsLetterSpacing: true,
      },
    });
  }
  collection.set(decorations);
}

export function MonacoTemplateEditor({
  value,
  variables,
  ariaLabel,
  loadingLabel,
  minifyActionLabel,
  onChange,
  onReady,
}: MonacoTemplateEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const decorationsRef =
    useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const contentListenerRef = useRef<IDisposable | null>(null);
  const completionRef = useRef<IDisposable | null>(null);
  const minifyActionRef = useRef<IDisposable | null>(null);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(
    () => () => {
      onReadyRef.current?.(null);
      contentListenerRef.current?.dispose();
      completionRef.current?.dispose();
      minifyActionRef.current?.dispose();
      decorationsRef.current?.clear();
    },
    []
  );

  const insertVariable = useCallback((variable: string) => {
    const instance = editorRef.current;
    const model = instance?.getModel();
    if (!instance || !model) return;

    const token = `{{${variable}}}`;
    const selection = instance.getSelection();
    const endPosition = model.getPositionAt(model.getValueLength());
    const range =
      selection ??
      new localMonaco.Range(
        endPosition.lineNumber,
        endPosition.column,
        endPosition.lineNumber,
        endPosition.column
      );
    const insertionOffset = model.getOffsetAt({
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    });

    instance.pushUndoStop();
    instance.executeEdits("email-template-variable", [
      { range, text: token, forceMoveMarkers: true },
    ]);
    instance.pushUndoStop();

    const nextPosition = model.getPositionAt(insertionOffset + token.length);
    instance.setPosition(nextPosition);
    instance.revealPositionInCenterIfOutsideViewport(nextPosition);
    instance.focus();
  }, []);

  const formatDocument = useCallback(async (focus = true) => {
    const instance = editorRef.current;
    if (!instance) return;
    await instance.getAction("editor.action.formatDocument")?.run();
    if (focus) instance.focus();
  }, []);

  const minifyDocument = useCallback(() => {
    const instance = editorRef.current;
    const model = instance?.getModel();
    if (!instance || !model) return;

    const minified = minifyHtmlFragment(model.getValue());
    instance.pushUndoStop();
    instance.executeEdits("email-template-minify", [
      {
        range: model.getFullModelRange(),
        text: minified,
        forceMoveMarkers: true,
      },
    ]);
    instance.pushUndoStop();
    instance.setPosition(model.getPositionAt(0));
    instance.revealPosition({ lineNumber: 1, column: 1 });
    instance.focus();
  }, []);

  const beforeMount = useCallback<BeforeMount>((monaco) => {
    monaco.editor.defineTheme("onfire-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "tag", foreground: "9F1239" },
        { token: "attribute.name", foreground: "0369A1" },
        { token: "attribute.value", foreground: "047857" },
        { token: "comment", foreground: "71717A", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.foreground": "#18181B",
        "editorCursor.foreground": "#18181B",
        "editor.lineHighlightBackground": "#FAFAFA",
        "editorLineNumber.foreground": "#A1A1AA",
        "editorLineNumber.activeForeground": "#52525B",
        "editor.selectionBackground": "#DBEAFE",
        "editor.inactiveSelectionBackground": "#E4E4E7",
      },
    });
    monaco.editor.defineTheme("onfire-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "tag", foreground: "FDA4AF" },
        { token: "attribute.name", foreground: "7DD3FC" },
        { token: "attribute.value", foreground: "6EE7B7" },
        { token: "comment", foreground: "71717A", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#18181B",
        "editor.foreground": "#FAFAFA",
        "editorCursor.foreground": "#FAFAFA",
        "editor.lineHighlightBackground": "#27272A",
        "editorLineNumber.foreground": "#52525B",
        "editorLineNumber.activeForeground": "#A1A1AA",
        "editor.selectionBackground": "#3F3F46",
        "editor.inactiveSelectionBackground": "#27272A",
      },
    });
  }, []);

  const onMount = useCallback<OnMount>(
    (instance, monaco) => {
      editorRef.current = instance;
      decorationsRef.current = instance.createDecorationsCollection();
      updateVariableDecorations(
        instance,
        monaco,
        decorationsRef.current
      );

      contentListenerRef.current = instance.onDidChangeModelContent(() => {
        if (!decorationsRef.current) return;
        updateVariableDecorations(instance, monaco, decorationsRef.current);
      });

      completionRef.current = monaco.languages.registerCompletionItemProvider(
        "html",
        {
          triggerCharacters: ["{"],
          provideCompletionItems(
            model: MonacoEditor.ITextModel,
            position: Position
          ) {
            const prefix = model
              .getLineContent(position.lineNumber)
              .slice(0, position.column - 1)
              .match(/\{\{[a-zA-Z0-9_]*$/)?.[0];
            const startColumn = prefix
              ? position.column - prefix.length
              : position.column;
            const range = new monaco.Range(
              position.lineNumber,
              startColumn,
              position.lineNumber,
              position.column
            );

            return {
              suggestions: variables.map((variable, index) => ({
                label: `{{${variable}}}`,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: `{{${variable}}}`,
                range,
                sortText: String(index).padStart(2, "0"),
              })),
            };
          },
        }
      );

      const actionLabel =
        typeof minifyActionLabel === "string" && minifyActionLabel.trim()
          ? minifyActionLabel
          : "Minify HTML";
      minifyActionRef.current = instance.addAction({
        id: "onfire.email-template.minify",
        label: actionLabel,
        keybindings: [
          monaco.KeyMod.CtrlCmd |
            monaco.KeyMod.Shift |
            monaco.KeyCode.KeyM,
        ],
        run: minifyDocument,
      });

      onReadyRef.current?.({
        insertVariable,
        formatDocument: () => formatDocument(),
        minifyDocument,
      });
      void formatDocument(false);
    },
    [formatDocument, insertVariable, minifyActionLabel, minifyDocument, variables]
  );

  return (
    <Editor
      height="100%"
      language="html"
      value={value}
      theme={resolvedTheme === "light" ? "onfire-light" : "onfire-dark"}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(nextValue) => onChange(nextValue ?? "")}
      loading={
        <div className="flex h-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
          {loadingLabel}
        </div>
      }
      options={{
        ariaLabel,
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        folding: true,
        fontFamily:
          "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
        fontSize: 12,
        formatOnPaste: true,
        formatOnType: true,
        lineHeight: 20,
        minimap: { enabled: false },
        padding: { top: 10, bottom: 10 },
        renderWhitespace: "selection",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        wordWrap: "on",
      }}
    />
  );
}
