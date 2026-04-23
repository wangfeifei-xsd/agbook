import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useConfirm } from '../components/Confirm';
import { PolishButton } from '../components/PolishButton';
import { usePolish } from '../hooks/usePolish';
import type { SettingItem, SettingType } from '../types';

type PolishField = 'summary' | 'content';

const TYPES: { value: SettingType; label: string }[] = [
  { value: 'worldview', label: '世界观' },
  { value: 'character', label: '人物' },
  { value: 'faction', label: '势力' },
  { value: 'location', label: '地点' },
  { value: 'item', label: '道具' },
  { value: 'rule', label: '规则' },
  { value: 'style', label: '文风' },
  { value: 'other', label: '其他' },
];

export function SettingsPage() {
  const { novelId } = useParams();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: items = [] } = useQuery({
    queryKey: ['settings', novelId],
    queryFn: () => api.listSettings(novelId!),
    enabled: !!novelId,
  });

  const [activeType, setActiveType] = useState<SettingType>('character');
  const [editing, setEditing] = useState<SettingItem | null>(null);
  const [showForm, setShowForm] = useState(false);

  const defaultForm = () => ({ type: activeType, name: '', summary: '', content: '', tagsText: '' });
  const [form, setForm] = useState(defaultForm());

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(defaultForm());
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const tags = form.tagsText.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      if (editing) {
        return api.updateSetting(editing.id, {
          type: form.type, name: form.name, summary: form.summary, content: form.content, tags,
        });
      }
      return api.createSetting(novelId!, {
        type: form.type, name: form.name, summary: form.summary, content: form.content, tags,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', novelId] });
      closeForm();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteSetting(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', novelId] }),
  });

  const { polish, polishing } = usePolish(novelId);

  const handlePolish = async (field: PolishField, label: string) => {
    const typeLabel = TYPES.find(t => t.value === form.type)?.label ?? '';
    const hintParts: string[] = [];
    if (typeLabel) hintParts.push(`设定类型：${typeLabel}`);
    if (form.name.trim()) hintParts.push(`条目名称：${form.name.trim()}`);
    const text = await polish({
      key: field,
      label,
      current: form[field] || '',
      purpose: field === 'summary' ? 'settingSummary' : 'settingContent',
      hint: hintParts.join(' · ') || undefined,
    });
    if (text !== null) setForm(prev => ({ ...prev, [field]: text }));
  };

  const filtered = items.filter(i => i.type === activeType);

  const startEdit = (item: SettingItem) => {
    setEditing(item);
    setForm({
      type: item.type, name: item.name, summary: item.summary ?? '',
      content: item.content ?? '', tagsText: (item.tags ?? []).join(', '),
    });
    setShowForm(true);
  };
  const startCreate = () => {
    setEditing(null);
    setForm({ ...defaultForm(), type: activeType });
    setShowForm(true);
  };

  return (
    <div className="h-full flex">
      <div className="w-56 shrink-0 border-r border-ink-700 bg-ink-900/60">
        <div className="px-4 py-3 text-xs text-ink-400">分类</div>
        {TYPES.map(t => {
          const count = items.filter(i => i.type === t.value).length;
          return (
            <button key={t.value}
              onClick={() => { setActiveType(t.value); closeForm(); }}
              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between
                ${activeType === t.value ? 'bg-ink-800 text-brand-500' : 'text-ink-300 hover:bg-ink-800'}`}>
              <span>{t.label}</span>
              <span className="text-xs text-ink-500">{count}</span>
            </button>
          );
        })}
      </div>

      <div className={`flex-1 min-w-0 grid ${showForm ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className={`overflow-auto scrollbar-thin p-4 ${showForm ? 'border-r border-ink-700' : ''}`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">{TYPES.find(t => t.value === activeType)?.label}列表</h3>
            <button className="btn btn-ghost" onClick={startCreate}>新建</button>
          </div>
          {filtered.length === 0 ? (
            <div className="text-ink-500 text-sm">暂无条目</div>
          ) : (
            <ul className="space-y-2">
              {filtered.map(item => (
                <li key={item.id}
                  className={`card cursor-pointer transition-colors ${editing?.id === item.id ? 'border-brand-500' : 'hover:border-ink-500'}`}
                  onClick={() => startEdit(item)}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.name}</span>
                    <button className="text-xs text-ink-400 hover:text-red-400"
                      onClick={async e => {
                        e.stopPropagation();
                        if (await confirm({
                          title: '删除设定',
                          message: `确定删除「${item.name}」？此操作不可撤销。`,
                          confirmText: '删除',
                          tone: 'danger',
                        })) {
                          deleteMut.mutate(item.id);
                        }
                      }}>
                      删除
                    </button>
                  </div>
                  {item.summary && <div className="text-xs text-ink-400 mt-1 line-clamp-2">{item.summary}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {showForm && (
        <div className="overflow-auto scrollbar-thin p-6">
          <h3 className="font-semibold mb-4">{editing ? '编辑条目' : '新建条目'}</h3>
          <div className="space-y-3">
            <div>
              <label className="label">分类</label>
              <select className="input" value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as SettingType })}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">名称</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <div className="flex items-end justify-between mb-1">
                <label className="label" style={{ marginBottom: 0 }}>摘要（简短描述，会优先注入上下文）</label>
                <PolishButton
                  disabled={!form.summary?.trim() || polishing !== null}
                  loading={polishing === 'summary'}
                  onClick={() => handlePolish('summary', '摘要')}
                />
              </div>
              <textarea className="input" rows={2} value={form.summary}
                disabled={polishing === 'summary'}
                onChange={e => setForm({ ...form, summary: e.target.value })} />
            </div>
            <div>
              <div className="flex items-end justify-between mb-1">
                <label className="label" style={{ marginBottom: 0 }}>详细内容</label>
                <PolishButton
                  disabled={!form.content?.trim() || polishing !== null}
                  loading={polishing === 'content'}
                  onClick={() => handlePolish('content', '详细内容')}
                />
              </div>
              <textarea className="input" rows={8} value={form.content}
                disabled={polishing === 'content'}
                onChange={e => setForm({ ...form, content: e.target.value })} />
            </div>
            <div>
              <label className="label">标签（逗号分隔）</label>
              <input className="input" value={form.tagsText}
                onChange={e => setForm({ ...form, tagsText: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn btn-ghost" onClick={closeForm}>取消</button>
              <button className="btn btn-primary" disabled={!form.name.trim() || saveMut.isPending}
                onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
