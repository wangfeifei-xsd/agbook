import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useConfirm } from '../components/Confirm';
import { PolishButton } from '../components/PolishButton';
import { usePolish } from '../hooks/usePolish';
import type { OutlineLevel, OutlineNode } from '../types';

type OutlinePolishField = 'summary' | 'goal';

function outlineHint(levelLabel: string, nodeTitle: string, parentTitle?: string) {
  const parts: string[] = [];
  if (levelLabel) parts.push(`节点级别：${levelLabel}`);
  if (nodeTitle.trim()) parts.push(`节点标题：${nodeTitle.trim()}`);
  if (parentTitle && parentTitle.trim()) parts.push(`父节点：${parentTitle.trim()}`);
  return parts.join(' · ') || undefined;
}

const LEVELS: { value: OutlineLevel; label: string }[] = [
  { value: 'novel', label: '总纲' },
  { value: 'volume', label: '卷纲' },
  { value: 'chapter', label: '章纲' },
  { value: 'scene', label: '场景' },
];

interface TreeNode extends OutlineNode {
  children: TreeNode[];
}

function buildTree(nodes: OutlineNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  nodes.forEach(n => map.set(n.id, { ...n, children: [] }));
  const roots: TreeNode[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.orderIndex - b.orderIndex);
    arr.forEach(c => sortRec(c.children));
  };
  sortRec(roots);
  return roots;
}

export function OutlinePage() {
  const { novelId } = useParams();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: nodes = [] } = useQuery({
    queryKey: ['outline', novelId],
    queryFn: () => api.listOutline(novelId!),
    enabled: !!novelId,
  });

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const [selected, setSelected] = useState<OutlineNode | null>(null);
  const [form, setForm] = useState({ level: 'chapter' as OutlineLevel, title: '', summary: '', goal: '' });
  const [parentId, setParentId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const openCreateTopLevel = () => {
    setParentId(null);
    setForm({ level: 'chapter', title: '', summary: '', goal: '' });
    setShowCreate(true);
  };
  const openCreateChild = (parentNode: OutlineNode) => {
    setParentId(parentNode.id);
    setForm({ level: 'scene', title: '', summary: '', goal: '' });
    setShowCreate(true);
  };
  const closeCreate = () => {
    setShowCreate(false);
    setForm({ level: 'chapter', title: '', summary: '', goal: '' });
  };

  const createMut = useMutation({
    mutationFn: () => api.createOutline(novelId!, {
      level: form.level, title: form.title, summary: form.summary, goal: form.goal,
      parentId: parentId ?? null,
      orderIndex: nodes.filter(n => (n.parentId ?? null) === (parentId ?? null)).length,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outline', novelId] });
      closeCreate();
    },
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<OutlineNode>) => api.updateOutline(selected!.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outline', novelId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteOutline(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outline', novelId] });
      setSelected(null);
    },
  });

  const { polish: polishCreate, polishing: polishingCreate } = usePolish(novelId);
  const handlePolishCreate = async (field: OutlinePolishField, label: string) => {
    const levelLabel = LEVELS.find(l => l.value === form.level)?.label ?? '';
    const parentTitle = parentId ? nodes.find(n => n.id === parentId)?.title : undefined;
    const text = await polishCreate({
      key: field,
      label,
      current: form[field] || '',
      purpose: field === 'summary' ? 'outlineSummary' : 'outlineGoal',
      hint: outlineHint(levelLabel, form.title, parentTitle),
    });
    if (text !== null) setForm(prev => ({ ...prev, [field]: text }));
  };

  const renderTree = (tree: TreeNode[], depth = 0) => (
    <ul>
      {tree.map(node => (
        <li key={node.id}>
          <div
            onClick={() => setSelected(node)}
            className={`cursor-pointer px-2 py-1 rounded text-sm flex items-center gap-2 ${
              selected?.id === node.id ? 'bg-ink-700 text-brand-500' : 'hover:bg-ink-800'
            }`}
            style={{ paddingLeft: 8 + depth * 16 }}>
            <span className="text-ink-500 text-[10px]">[{LEVELS.find(l => l.value === node.level)?.label}]</span>
            <span className="truncate">{node.title}</span>
          </div>
          {node.children.length > 0 && renderTree(node.children, depth + 1)}
        </li>
      ))}
    </ul>
  );

  return (
    <div className={`h-full grid ${showCreate ? 'grid-cols-[280px_1fr_360px]' : 'grid-cols-[280px_1fr]'}`}>
      <div className="border-r border-ink-700 overflow-auto scrollbar-thin p-3 bg-ink-900/40">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">大纲树</h3>
          <button className="btn btn-ghost text-xs" onClick={openCreateTopLevel}>
            新建顶级
          </button>
        </div>
        {tree.length === 0 ? (
          <div className="text-ink-500 text-sm p-2">尚未创建任何大纲节点</div>
        ) : renderTree(tree)}
      </div>

      <div className="overflow-auto scrollbar-thin p-6">
        {selected ? (
          <EditPanel node={selected}
            onSave={data => updateMut.mutate(data)}
            onDelete={async () => {
              if (await confirm({
                title: '删除大纲节点',
                message: `确定删除「${selected.title}」？\n该节点及其所有子节点都会被物理删除，且不可恢复。`,
                confirmText: '删除',
                tone: 'danger',
              })) {
                deleteMut.mutate(selected.id);
              }
            }}
            onCreateChild={() => openCreateChild(selected)}
          />
        ) : (
          <div className="text-ink-500 text-sm">请选择左侧节点进行查看 / 编辑；或点左上"新建顶级"添加根节点。</div>
        )}
      </div>

      {showCreate && (
      <div className="border-l border-ink-700 overflow-auto scrollbar-thin p-5 bg-ink-900/40">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">新建节点</h3>
          <button className="btn btn-ghost text-xs" onClick={closeCreate}>关闭</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">级别</label>
            <select className="input" value={form.level}
              onChange={e => setForm({ ...form, level: e.target.value as OutlineLevel })}>
              {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">父节点</label>
            <select className="input" value={parentId ?? ''} onChange={e => setParentId(e.target.value || null)}>
              <option value="">（无 / 顶级）</option>
              {nodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label">标题</label>
            <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <div className="flex items-end justify-between mb-1">
              <label className="label" style={{ marginBottom: 0 }}>摘要</label>
              <PolishButton
                disabled={!form.summary?.trim() || polishingCreate !== null}
                loading={polishingCreate === 'summary'}
                onClick={() => handlePolishCreate('summary', '摘要')}
              />
            </div>
            <textarea className="input" rows={3} value={form.summary}
              disabled={polishingCreate === 'summary'}
              onChange={e => setForm({ ...form, summary: e.target.value })} />
          </div>
          <div>
            <div className="flex items-end justify-between mb-1">
              <label className="label" style={{ marginBottom: 0 }}>本节目标</label>
              <PolishButton
                disabled={!form.goal?.trim() || polishingCreate !== null}
                loading={polishingCreate === 'goal'}
                onClick={() => handlePolishCreate('goal', '本节目标')}
              />
            </div>
            <textarea className="input" rows={2} value={form.goal}
              disabled={polishingCreate === 'goal'}
              onChange={e => setForm({ ...form, goal: e.target.value })} />
          </div>
          <button className="btn btn-primary w-full" disabled={!form.title.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}>
            {createMut.isPending ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

function EditPanel({ node, onSave, onDelete, onCreateChild }: {
  node: OutlineNode;
  onSave: (data: Partial<OutlineNode>) => void;
  onDelete: () => void;
  onCreateChild: () => void;
}) {
  const { novelId } = useParams();
  const [form, setForm] = useState({ title: node.title, summary: node.summary ?? '', goal: node.goal ?? '' });
  useMemo(() => {
    setForm({ title: node.title, summary: node.summary ?? '', goal: node.goal ?? '' });
  }, [node.id]);

  const { polish, polishing } = usePolish(novelId);
  const handlePolish = async (field: OutlinePolishField, label: string) => {
    const levelLabel = LEVELS.find(l => l.value === node.level)?.label ?? '';
    const text = await polish({
      key: field,
      label,
      current: form[field] || '',
      purpose: field === 'summary' ? 'outlineSummary' : 'outlineGoal',
      hint: outlineHint(levelLabel, form.title),
    });
    if (text !== null) setForm(prev => ({ ...prev, [field]: text }));
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">编辑节点</h3>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={onCreateChild}>添加子节点</button>
          <button className="btn btn-danger" onClick={onDelete}>删除</button>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <label className="label">标题</label>
          <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <div className="flex items-end justify-between mb-1">
            <label className="label" style={{ marginBottom: 0 }}>摘要</label>
            <PolishButton
              disabled={!form.summary?.trim() || polishing !== null}
              loading={polishing === 'summary'}
              onClick={() => handlePolish('summary', '摘要')}
            />
          </div>
          <textarea className="input" rows={4} value={form.summary}
            disabled={polishing === 'summary'}
            onChange={e => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div>
          <div className="flex items-end justify-between mb-1">
            <label className="label" style={{ marginBottom: 0 }}>目标 / 预期</label>
            <PolishButton
              disabled={!form.goal?.trim() || polishing !== null}
              loading={polishing === 'goal'}
              onClick={() => handlePolish('goal', '目标 / 预期')}
            />
          </div>
          <textarea className="input" rows={3} value={form.goal}
            disabled={polishing === 'goal'}
            onChange={e => setForm({ ...form, goal: e.target.value })} />
        </div>
        <div className="flex justify-end">
          <button className="btn btn-primary"
            onClick={() => onSave({ title: form.title, summary: form.summary, goal: form.goal })}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
