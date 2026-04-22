import { Navigate, Route, Routes } from 'react-router-dom';
import { NovelsPage } from './pages/NovelsPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { NovelLayout } from './pages/NovelLayout';
import { SettingsPage } from './pages/SettingsPage';
import { OutlinePage } from './pages/OutlinePage';
import { ChapterPlansPage } from './pages/ChapterPlansPage';
import { DraftPage } from './pages/DraftPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { NovelOverviewPage } from './pages/NovelOverviewPage';
import { ThreadsPage } from './pages/ThreadsPage';
import { CharacterStatesPage } from './pages/CharacterStatesPage';
import { ArcSummariesPage } from './pages/ArcSummariesPage';
import { TopBar } from './components/TopBar';

export default function App() {
  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="flex-1 min-h-0">
        <Routes>
          <Route path="/" element={<Navigate to="/novels" replace />} />
          <Route path="/novels" element={<NovelsPage />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/novels/:novelId/*" element={<NovelLayout />}>
            <Route index element={<NovelOverviewPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="outline" element={<OutlinePage />} />
            <Route path="plans" element={<ChapterPlansPage />} />
            <Route path="plans/:planId" element={<DraftPage />} />
            <Route path="threads" element={<ThreadsPage />} />
            <Route path="characters" element={<CharacterStatesPage />} />
            <Route path="arcs" element={<ArcSummariesPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/novels" replace />} />
        </Routes>
      </div>
    </div>
  );
}
