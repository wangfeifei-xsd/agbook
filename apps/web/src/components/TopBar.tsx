import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function TopBar() {
  const location = useLocation();
  const match = location.pathname.match(/^\/novels\/([^/]+)/);
  const novelId = match?.[1];

  const { data: novel } = useQuery({
    queryKey: ['novel', novelId],
    queryFn: () => api.getNovel(novelId!),
    enabled: !!novelId,
  });

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-ink-700 bg-ink-900">
      <div className="flex items-center gap-3">
        <Link to="/novels" className="text-ink-100 font-semibold tracking-wide">
          agbook
        </Link>
        <span className="text-ink-500">·</span>
        <span className="text-ink-300 text-sm">
          {novel ? novel.title : '小说创作 AI 工作台'}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Link to="/novels" className="text-ink-300 hover:text-ink-100">小说库</Link>
        <span className="text-ink-600">|</span>
        <Link to="/providers" className="text-ink-300 hover:text-ink-100">模型配置</Link>
        <span className="text-ink-600">|</span>
        <Link to="/maintenance" className="text-ink-300 hover:text-ink-100">数据库维护</Link>
      </div>
    </header>
  );
}
