import React, { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

interface InlineEditableProps {
  value: string;
  editMode: boolean;
  onSave: (nextValue: string) => Promise<void> | void;
  multiline?: boolean;
  inputType?: 'text' | 'number';
  displayFormatter?: (val: string) => React.ReactNode;
  className?: string;
  inputClassName?: string;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div';
  darkSurface?: boolean;
}

export const InlineEditable: React.FC<InlineEditableProps> = ({
  value,
  editMode,
  onSave,
  multiline = false,
  inputType = 'text',
  displayFormatter,
  className = '',
  inputClassName = '',
  as = 'span',
  darkSurface = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!editMode) {
    const Tag = as;
    return <Tag className={className}>{displayFormatter ? displayFormatter(value) : value}</Tag>;
  }

  async function commitSave() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex flex-col gap-1.5 w-full max-w-full align-top">
        {multiline ? (
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditing(false);
                setDraft(value);
              }
            }}
            className={`w-full px-2.5 py-1.5 text-sm font-normal rounded-lg border border-blue-600 focus:outline-none ${
              darkSurface ? 'bg-slate-900 text-white' : 'bg-white text-slate-950'
            } ${inputClassName}`}
          />
        ) : (
          <input
            autoFocus
            type={inputType}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitSave();
              } else if (e.key === 'Escape') {
                setEditing(false);
                setDraft(value);
              }
            }}
            className={`w-full px-2.5 py-1 text-sm font-normal rounded-lg border border-blue-600 focus:outline-none ${
              darkSurface ? 'bg-slate-900 text-white' : 'bg-white text-slate-950'
            } ${inputClassName}`}
          />
        )}
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            disabled={saving}
            onClick={commitSave}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-md cursor-pointer"
          >
            <Check className="w-3 h-3" />
            <span>{saving ? 'Đang lưu...' : 'Lưu ngay'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(value);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md cursor-pointer"
          >
            <X className="w-3 h-3" />
            <span>Hủy</span>
          </button>
        </span>
      </span>
    );
  }

  const Tag = as;
  return (
    <Tag
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setEditing(true);
      }}
      title="Nhấn 1 lần để chỉnh sửa trực tiếp"
      className={`${className} group relative cursor-pointer rounded-md transition-colors outline-1 outline-dashed ${
        darkSurface
          ? 'outline-blue-400/70 hover:bg-blue-950/60'
          : 'outline-blue-600/60 hover:bg-blue-50/80'
      } px-1 -mx-1`}
    >
      {displayFormatter ? displayFormatter(value) : value}
      <Pencil
        className={`inline-block w-3 h-3 ml-1.5 align-middle opacity-70 group-hover:opacity-100 ${
          darkSurface ? 'text-blue-300' : 'text-blue-700'
        }`}
      />
    </Tag>
  );
};
