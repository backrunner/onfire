"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Code,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Strikethrough,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface RichTextValue {
  html: string;
  text: string;
  empty: boolean;
}

export interface RichTextEditorHandle {
  /** Replace the document (plain text or HTML); used for AI suggestions. */
  setContent: (value: string) => void;
  clear: () => void;
  focus: () => void;
}

interface RichTextEditorProps {
  onChange: (value: RichTextValue) => void;
  onReady?: (ready: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Cmd/Ctrl+Enter. */
  onSubmit?: () => void;
  /** Upload an inline image and return its serving URL. */
  onUploadImage?: (file: File) => Promise<string>;
  className?: string;
}

function emitChange(editor: Editor, onChange: (value: RichTextValue) => void) {
  onChange({
    html: editor.getHTML(),
    text: editor.getText(),
    empty: editor.isEmpty,
  });
}

/** Minimal rich-text composer shared by the ToB and ToC reply boxes. */
export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(function RichTextEditor(
  { onChange, onReady, placeholder, disabled, onSubmit, onUploadImage, className },
  ref
) {
  const { t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  // TipTap configures Placeholder once at creation; read through a ref and
  // force a decoration pass so the hint follows the prop (reply vs. note).
  const placeholderRef = useRef(placeholder ?? "");
  placeholderRef.current = placeholder ?? "";

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
        heading: false,
      }),
      Image,
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
    ],
    editable: !disabled,
    onUpdate: ({ editor: current }) => emitChange(current, onChange),
    editorProps: {
      attributes: {
        class: "rich-text min-h-20 px-3 py-2 text-sm outline-none",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onSubmit?.();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    onReady?.(Boolean(editor));
    return () => onReady?.(false);
  }, [editor, onReady]);

  // `editable` is only applied at creation in TipTap v3 — sync it manually.
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr);
  }, [editor, placeholder]);

  const state = useEditorState({
    editor,
    selector: (ctx) =>
      ctx.editor
        ? {
            bold: ctx.editor.isActive("bold"),
            italic: ctx.editor.isActive("italic"),
            strike: ctx.editor.isActive("strike"),
            bulletList: ctx.editor.isActive("bulletList"),
            orderedList: ctx.editor.isActive("orderedList"),
            blockquote: ctx.editor.isActive("blockquote"),
            code: ctx.editor.isActive("code"),
            link: ctx.editor.isActive("link"),
          }
        : null,
  });

  useImperativeHandle(ref, () => ({
    setContent: (value: string) => {
      editor?.commands.setContent(value, { emitUpdate: true });
      if (editor) emitChange(editor, onChange);
    },
    clear: () => {
      editor?.commands.clearContent(true);
      if (editor) emitChange(editor, onChange);
    },
    focus: () => editor?.commands.focus(),
  }));

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      editor.chain().focus().setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkUrl("");
  };

  const pickImage = async (file: File | undefined) => {
    if (!file || !editor || !onUploadImage) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : t.tickets.editor.imageFailed
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const tools: Array<{
    key: string;
    icon: typeof Bold;
    label: string;
    active?: boolean;
    action: () => void;
  }> = [
    { key: "bold", icon: Bold, label: t.tickets.editor.bold, active: state?.bold, action: () => editor?.chain().focus().toggleBold().run() },
    { key: "italic", icon: Italic, label: t.tickets.editor.italic, active: state?.italic, action: () => editor?.chain().focus().toggleItalic().run() },
    { key: "strike", icon: Strikethrough, label: t.tickets.editor.strikethrough, active: state?.strike, action: () => editor?.chain().focus().toggleStrike().run() },
    { key: "bulletList", icon: List, label: t.tickets.editor.bulletList, active: state?.bulletList, action: () => editor?.chain().focus().toggleBulletList().run() },
    { key: "orderedList", icon: ListOrdered, label: t.tickets.editor.orderedList, active: state?.orderedList, action: () => editor?.chain().focus().toggleOrderedList().run() },
    { key: "blockquote", icon: Quote, label: t.tickets.editor.quote, active: state?.blockquote, action: () => editor?.chain().focus().toggleBlockquote().run() },
    { key: "code", icon: Code, label: t.tickets.editor.code, active: state?.code, action: () => editor?.chain().focus().toggleCode().run() },
  ];

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-center gap-0.5">
        {tools.map((tool) => (
          <Button
            key={tool.key}
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-7 text-muted-foreground",
              tool.active && "bg-accent text-foreground"
            )}
            onClick={tool.action}
            disabled={!editor || disabled}
            aria-label={tool.label}
            title={tool.label}
          >
            <tool.icon className="size-3.5" />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "size-7 text-muted-foreground",
            (state?.link || linkOpen) && "bg-accent text-foreground"
          )}
          onClick={() => {
            setLinkUrl(editor?.getAttributes("link").href ?? "");
            setLinkOpen((open) => !open);
          }}
          disabled={!editor || disabled}
          aria-label={t.tickets.editor.link}
          title={t.tickets.editor.link}
        >
          <Link2 className="size-3.5" />
        </Button>
        {onUploadImage && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={() => fileInput.current?.click()}
            disabled={!editor || disabled || uploading}
            aria-label={t.tickets.editor.image}
            title={t.tickets.editor.image}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ImagePlus className="size-3.5" />
            )}
          </Button>
        )}
      </div>

      {linkOpen && (
        <div className="flex items-center gap-1.5">
          <Input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder={t.tickets.editor.linkPlaceholder}
            className="h-7 flex-1 text-xs"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
            }}
          />
          <Button type="button" size="sm" className="h-7 text-xs" onClick={applyLink}>
            {t.common.confirm}
          </Button>
        </div>
      )}

      <EditorContent editor={editor} className="rich-text-editor" />

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(event) => void pickImage(event.target.files?.[0])}
      />
    </div>
  );
});
