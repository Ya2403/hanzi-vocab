import { useEffect, useState } from 'react';
import { useStore } from './store';
import { today } from './lib/date';
import { isDue } from './lib/srs';
import { liveStreak } from './lib/streak';
import { Icon, type IconName } from './components/Icon';
import { WordsScreen } from './screens/WordsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { DataScreen } from './screens/DataScreen';

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'words', label: 'Words', icon: 'list' },
  { id: 'review', label: 'Review', icon: 'review' },
  { id: 'practice', label: 'Practice', icon: 'cards' },
  { id: 'data', label: 'Stats & data', icon: 'data' },
];
type Tab = 'words' | 'review' | 'practice' | 'data';

const tabFromHash = (): Tab => {
  const h = location.hash.slice(1);
  return tabs.some((t) => t.id === h) ? (h as Tab) : 'words';
};

export default function App() {
  const { words, streak, error } = useStore();
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    location.hash = t;
    setTab(t);
    window.scrollTo(0, 0);
  };

  const on = today();
  const dueCount = words.filter((w) => isDue(w, on)).length;
  const streakDays = liveStreak(streak, on);
  const doneToday = streak.lastDate === on;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" lang="zh-CN">词</span>
          <span>Hanzi Vocab</span>
        </div>
        <div className="top-stats">
          <span
            className={`pill streak ${doneToday ? 'lit' : ''}`}
            title={doneToday ? 'Streak extended today' : streakDays ? 'Answer a card today to keep your streak' : 'Answer a card to start a streak'}
          >
            🔥 {streakDays}
          </span>
          <button className={`pill due ${dueCount ? 'has-due' : ''}`} onClick={() => go('review')}>
            {dueCount} due
          </button>
        </div>
      </header>

      <main className="content">
        {error && <p className="hint error card">{error}</p>}
        {tab === 'words' && <WordsScreen />}
        {tab === 'review' && <ReviewScreen onGoToWords={() => go('words')} />}
        {tab === 'practice' && <PracticeScreen />}
        {tab === 'data' && <DataScreen />}
      </main>

      <nav className="tabbar">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
            {t.id === 'review' && dueCount > 0 && <span className="dot">{dueCount > 99 ? '99+' : dueCount}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
