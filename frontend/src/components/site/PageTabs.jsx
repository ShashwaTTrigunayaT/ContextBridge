import { useState } from 'react';
import { cx } from '../../ui.jsx';

// Groups a page's content into categories so one group is visible at a time
// instead of stacking every section into a single long scroll.
export default function PageTabs({ tabs, label }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div className="page-tabs-block">
      <div className="page-tabs-bar">
        <div className="wrap page-tabs-inner" role="tablist" aria-label={label ?? 'Page sections'}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={tab.id === active}
              aria-controls={`panel-${tab.id}`}
              className={cx('page-tab', tab.id === active && 'is-active')}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
              {tab.meta && <span className="page-tab-meta">{tab.meta}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="page-tab-panel" role="tabpanel" id={`panel-${current?.id}`} aria-labelledby={`tab-${current?.id}`}>
        {current?.node}
      </div>
    </div>
  );
}
