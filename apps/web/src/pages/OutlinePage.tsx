import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { OutlineLevel, OutlineNode } from '../types';

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
            onDelete={() => { if (confirm(`删除「${selected.title}」？（含所有子节点）`)) deleteMut.mutate(selected.id); }}
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
            <label className="label">摘要</label>
            <textarea className="input" rows={3} value={form.summary}
              onChange={e => setForm({ ...form, summary: e.target.value })} />
          </div>
          <div>
            <label className="label">本节目标</label>
            <textarea className="input" rows={2} value={form.goal}
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
  const [form, setForm] = useState({ title: node.title, summary: node.summary ?? '', goal: node.goal ?? '' });
  useMemo(() => {
    setForm({ title: node.title, summary: node.summary ?? '', goal: node.goal ?? '' });
  }, [node.id]);

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
          <label className="label">摘要</label>
          <textarea className="input" rows={4} value={form.summary}
            onChange={e => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div>
          <label className="label">目标 / 预期</label>
          <textarea className="input" rows={3} value={form.goal}
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
