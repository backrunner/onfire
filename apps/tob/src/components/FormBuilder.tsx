import { useEffect, useState } from 'react';
import { Button, Input, Textarea } from '@onfire/ui';
import { Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

export type FormFieldType = 'text' | 'textarea' | 'select' | 'number' | 'email';

export interface FormField {
  label: string;
  key: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

interface FormBuilderProps {
  value: FormField[];
  onChange: (fields: FormField[], schemaJson: string) => void;
}

export function FormBuilder({ value, onChange }: FormBuilderProps) {
  const [fields, setFields] = useState<FormField[]>(value ?? []);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<FormField>({
    label: '',
    key: '',
    type: 'text',
    required: false,
    options: [],
    placeholder: ''
  });

  useEffect(() => {
    setFields(value ?? []);
  }, [value]);

  const ensureDetail = (list: FormField[]): FormField[] => {
    if (list.some((f) => f.type === 'textarea')) return list;
    const detailField: FormField = {
      label: '问题详情',
      key: 'content',
      type: 'textarea',
      required: true,
      placeholder: '请详细描述问题、步骤、期望'
    };
    return [
      detailField,
      ...list
    ];
  };

  const emit = (next: FormField[]) => {
    const ensured = ensureDetail(next);
    setFields(ensured);
    onChange(ensured, JSON.stringify(ensured, null, 2));
  };

  const resetDraft = () => {
    setDraft({ label: '', key: '', type: 'text', required: false, options: [], placeholder: '' });
    setEditingIndex(null);
  };

  const saveDraft = () => {
    if (!draft.label || !draft.key) return;
    const next = [...fields];
    if (draft.type !== 'select') draft.options = [];
    if (editingIndex !== null) {
      next[editingIndex] = draft;
    } else {
      next.push(draft);
    }
    emit(next);
    resetDraft();
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    emit(next);
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/50 p-3 text-xs text-foreground">
      <div className="flex items-center justify-between">
        <div className="font-semibold">可视化表单构建</div>
        <span className="text-[11px] text-muted-foreground">添加字段并生成 Schema JSON</span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <Input placeholder="字段标题" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <Input placeholder="字段 key" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as FormFieldType })}
        >
          <option value="text">文本</option>
          <option value="textarea">多行文本</option>
          <option value="number">数字</option>
          <option value="email">邮箱</option>
          <option value="select">下拉</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
            className="h-4 w-4"
          />
          必填
        </label>
        <Input placeholder="占位符（可选）" value={draft.placeholder ?? ''} onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })} />
        {draft.type === 'select' && (
          <Textarea
            rows={3}
            placeholder="下拉选项，每行一个"
            value={(draft.options ?? []).join('\n')}
            onChange={(e) => setDraft({ ...draft, options: e.target.value.split('\n').filter(Boolean) })}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={saveDraft}>
          {editingIndex !== null ? '保存修改' : '添加字段'}
        </Button>
        {editingIndex !== null && (
          <Button size="sm" variant="outline" onClick={resetDraft}>
            取消编辑
          </Button>
        )}
      </div>

      {fields.length > 0 && (
        <div className="space-y-1">
          {fields.map((f, idx) => (
            <div key={idx} className="flex items-center justify-between rounded border border-border bg-background px-2 py-1">
              <div>
                <span className="font-semibold">{f.label}</span> ({f.key}) · {f.type} {f.required ? '· 必填' : ''}{' '}
                {f.options && f.options.length ? `· 选项: ${f.options.join(', ')}` : ''}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraft(f);
                    setEditingIndex(idx);
                  }}
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  编辑
                </Button>
                <Button size="sm" variant="outline" onClick={() => move(idx, -1)} disabled={idx === 0}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => move(idx, 1)} disabled={idx === fields.length - 1}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => emit(fields.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  删
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-semibold">Schema 预览</div>
        <pre className="max-h-48 overflow-auto rounded-md bg-zinc-900 px-3 py-2 text-[11px] text-zinc-100 dark:bg-zinc-800">
{JSON.stringify(fields, null, 2)}
        </pre>
      </div>
    </div>
  );
}

