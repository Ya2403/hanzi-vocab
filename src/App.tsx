import { useEffect, useState } from 'react';
import { useStore } from './store';
import { today } from './lib/date';
import { QuietBadge } from './components/QuietBadge';
import { liveStreak } from './lib/streak';
import { Icon, type IconName } from './components/Icon';
import { WordsScreen } from './screens/WordsScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { DataScreen } from './screens/DataScreen';
import { LearnScreen } from './screens/LearnScreen';

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'learn', label: 'Learn', icon: 'learn' },
  { id: 'practice', label: 'Practice', icon: 'cards' },
  { id: 'words', label: 'Words', icon: 'list' },
  { id: 'data', label: 'Stats', icon: 'data' },
];
type Tab = 'words' | 'learn' | 'practice' | 'data';

/** Practice is the home tab; the old #review link opens it too. */
const tabFromHash = (): Tab => {
  const h = location.hash.slice(1).split('?')[0];
  return tabs.some((t) => t.id === h) ? (h as Tab) : 'practice';
};

export default function App() {
  const { streak, error } = useStore();
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
            title={doneToday ? 'Streak extended today' : streakDays ? 'Finish a practice session today to keep your streak' : 'Finish a practice session to start a streak'}
          >
            🔥 {streakDays}
          </span>
          <QuietBadge />
        </div>
      </header>

      <main className="content">
        {error && <p className="hint error card">{error}</p>}
        {tab === 'words' && <WordsScreen />}
        {tab === 'learn' && <LearnScreen onGoToWords={() => go('words')} />}
        {tab === 'practice' && <PracticeScreen onGoToLearn={() => go('learn')} onGoToWords={() => go('words')} />}
        {tab === 'data' && <DataScreen />}
      </main>

      <nav className="tabbar">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
