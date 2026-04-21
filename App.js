// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api, DEMO_STATS, DEMO_MENTIONS } from './lib/api';
import './App.css';

// ── Helpers ──────────────────────────────────────────────
const PLATFORM_COLORS = {
  reddit: '#FF4500', twitter: '#1DA1F2', facebook: '#1877F2',
  instagram: '#E1306C', tiktok: '#010101', hackernews: '#FF6600',
  news: '#6B7280', blog: '#8B5CF6',
};

const PLATFORM_LABELS = {
  reddit: 'Reddit', twitter: 'X / Twitter', facebook: 'Facebook',
  instagram: 'Instagram', tiktok: 'TikTok', hackernews: 'Hacker News',
  news: 'News', blog: 'Blog',
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function PlatformDot({ platform }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: PLATFORM_COLORS[platform] || '#6B7280',
      marginRight: 5, flexShrink: 0,
    }} />
  );
}

function UrgencyBar({ score }) {
  const color = score >= 8 ? '#ef4444' : score >= 5 ? '#f59e0b' : '#6b7280';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{ width: `${score * 10}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600, minWidth: 16 }}>{score}</span>
    </div>
  );
}

// ── Mention Card ─────────────────────────────────────────
function MentionCard({ mention, onReplyEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyReply = () => {
    if (mention.draftReply) {
      navigator.clipboard.writeText(mention.draftReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const categoryColor = {
    defend: '#3b82f6', engage: '#10b981', competitor: '#f97316',
  }[mention.category] || '#6b7280';

  const sentimentColor = {
    positive: '#10b981', negative: '#ef4444', neutral: '#6b7280',
  }[mention.sentiment];

  return (
    <div className={`mention-card ${mention.urgent ? 'urgent' : ''}`} style={{ borderLeftColor: categoryColor }}>
      <div className="mention-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
          <PlatformDot platform={mention.platform} />
          <span className="platform-label">{PLATFORM_LABELS[mention.platform] || mention.platform}</span>
          {(mention.subreddit || mention.authorHandle || mention.source) && (
            <span className="source-label">{mention.subreddit || mention.authorHandle || mention.source}</span>
          )}
          {mention.urgent && <span className="badge badge-urgent">URGENT</span>}
          <span className="badge" style={{ background: `${categoryColor}20`, color: categoryColor }}>
            {mention.category}
          </span>
          <span className="badge" style={{ color: sentimentColor, background: `${sentimentColor}15` }}>
            {mention.sentiment}
          </span>
          {mention.authorFollowers > 5000 && (
            <span className="badge badge-influence">{(mention.authorFollowers / 1000).toFixed(1)}k followers</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="time-label">{timeAgo(mention.createdAt)}</span>
          <UrgencyBar score={mention.urgencyScore} />
        </div>
      </div>

      <h3 className="mention-title">{mention.title}</h3>
      <p className="mention-body">{mention.body}</p>

      {mention.insight && (
        <div className="insight-row">
          <span className="insight-icon">◈</span>
          <span>{mention.insight}</span>
        </div>
      )}

      {mention.draftReply && (
        <div className="draft-section">
          <div className="draft-label">AI draft reply</div>
          <p className="draft-text">{mention.draftReply}</p>
          <div className="draft-actions">
            {mention.url && (
              <a href={mention.url} target="_blank" rel="noreferrer" className="btn btn-primary">
                Open thread →
              </a>
            )}
            <button className="btn" onClick={copyReply}>
              {copied ? '✓ Copied' : 'Copy reply'}
            </button>
            <button className="btn" onClick={() => onReplyEdit(mention)}>
              Edit with AI ↗
            </button>
          </div>
        </div>
      )}

      {!mention.draftReply && mention.url && (
        <div style={{ marginTop: 10 }}>
          <a href={mention.url} target="_blank" rel="noreferrer" className="btn btn-primary">
            View thread →
          </a>
        </div>
      )}
    </div>
  );
}

// ── Stats Cards ──────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ── Platform Breakdown ───────────────────────────────────
function PlatformBreakdown({ byPlatform, total }) {
  const sorted = Object.entries(byPlatform)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="platform-breakdown">
      {sorted.map(([platform, count]) => (
        <div key={platform} className="platform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
            <PlatformDot platform={platform} />
            <span style={{ fontSize: 13 }}>{PLATFORM_LABELS[platform]}</span>
          </div>
          <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
            <div style={{
              width: `${(count / total) * 100}%`, height: '100%',
              background: PLATFORM_COLORS[platform] || '#6b7280',
              borderRadius: 2, transition: 'width 0.6s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 24, textAlign: 'right' }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────
export default function App() {
  const [stats, setStats]           = useState(DEMO_STATS);
  const [mentions, setMentions]     = useState(DEMO_MENTIONS);
  const [activeTab, setActiveTab]   = useState('defend');
  const [platformFilter, setPF]     = useState('all');
  const [scanning, setScanning]     = useState(false);
  const [lastScan, setLastScan]     = useState(null);
  const [editMention, setEditMention] = useState(null);
  const [hoursBack, setHoursBack]   = useState(24);
  const [usingDemo, setUsingDemo]   = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        api.getStats(hoursBack),
        api.getMentions({ hoursBack, limit: 100 }),
      ]);
      setStats(s);
      setMentions(m.mentions || []);
      setUsingDemo(false);
    } catch {
      // No API configured — stay on demo data
    }
  }, [hoursBack]);

  useEffect(() => { loadData(); }, [loadData]);

  const triggerScan = async (type) => {
    setScanning(true);
    try {
      await api.triggerScan(type);
      setTimeout(() => { loadData(); setScanning(false); setLastScan(new Date()); }, 3000);
    } catch {
      setScanning(false);
    }
  };

  const tabMentions = mentions.filter(m => {
    if (activeTab !== m.category) return false;
    if (platformFilter !== 'all' && m.platform !== platformFilter) return false;
    return true;
  }).sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));

  const tabs = [
    { id: 'defend',     label: 'Brand defense',         color: '#3b82f6' },
    { id: 'engage',     label: 'Visibility opps',       color: '#10b981' },
    { id: 'competitor', label: 'Competitor intel',       color: '#f97316' },
  ];

  const activePlatforms = ['all', ...Object.keys(stats.byPlatform || {}).filter(p => (stats.byPlatform[p] || 0) > 0)];

  // Sparkline data (mock trend for demo)
  const sparkData = Array.from({ length: 12 }, (_, i) => ({
    h: `${(i * 2) % 24}h`,
    v: Math.floor(Math.random() * 8) + 2,
  }));

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-mark">◈</span>
          <span className="logo-text">Monitor</span>
        </div>

        <nav className="nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={activeTab === tab.id ? { '--tab-color': tab.color } : {}}
            >
              <span className="nav-dot" style={{ background: tab.color }} />
              <span>{tab.label}</span>
              <span className="nav-count" style={activeTab === tab.id ? { background: tab.color, color: '#fff' } : {}}>
                {mentions.filter(m => m.category === tab.id).length}
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <div className="section-title">Platform filter</div>
          {activePlatforms.map(p => (
            <button
              key={p}
              className={`platform-btn ${platformFilter === p ? 'active' : ''}`}
              onClick={() => setPF(p)}
            >
              {p !== 'all' && <PlatformDot platform={p} />}
              {p === 'all' ? 'All platforms' : PLATFORM_LABELS[p] || p}
              {p !== 'all' && (
                <span className="plat-count">{stats.byPlatform?.[p] || 0}</span>
              )}
            </button>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="section-title">Time range</div>
          {[6, 24, 48, 168].map(h => (
            <button
              key={h}
              className={`platform-btn ${hoursBack === h ? 'active' : ''}`}
              onClick={() => setHoursBack(h)}
            >
              {h < 24 ? `Last ${h}h` : h === 24 ? 'Last 24h' : h === 48 ? 'Last 2 days' : 'Last 7 days'}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="scan-controls">
            <button
              className={`scan-btn ${scanning ? 'scanning' : ''}`}
              onClick={() => triggerScan('full')}
              disabled={scanning}
            >
              {scanning ? '⟳ Scanning...' : '▶ Run full scan'}
            </button>
            <div className="scan-quick">
              {['reddit', 'twitter', 'social', 'web'].map(t => (
                <button key={t} className="quick-btn" onClick={() => triggerScan(t)} disabled={scanning}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {lastScan && (
            <div className="last-scan">Last scan: {timeAgo(lastScan.toISOString())}</div>
          )}
          {usingDemo && (
            <div className="demo-notice">
              Demo data — set REACT_APP_API_URL to connect your backend
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main">
        {/* Stats bar */}
        <div className="stats-bar">
          <StatCard label="Total mentions" value={stats.total} sub={`last ${hoursBack}h`} />
          <StatCard label="Urgent" value={stats.urgent} color="#ef4444" sub="respond now" />
          <StatCard label="Brand defense" value={stats.defend} color="#3b82f6" />
          <StatCard label="Visibility opps" value={stats.engage} color="#10b981" />
          <StatCard label="Competitor intel" value={stats.competitor} color="#f97316" />
          <StatCard
            label="Sentiment"
            value={stats.total ? `${Math.round((stats.positive / stats.total) * 100)}%` : '—'}
            sub="positive"
            color="#10b981"
          />
        </div>

        <div className="content-grid">
          {/* Mentions feed */}
          <div className="feed-col">
            <div className="feed-header">
              <h2 className="feed-title">
                <span style={{ color: tabs.find(t => t.id === activeTab)?.color }}>◈</span>
                {' '}{tabs.find(t => t.id === activeTab)?.label}
              </h2>
              <span className="feed-count">{tabMentions.length} mentions</span>
            </div>

            {tabMentions.length === 0 ? (
              <div className="empty-feed">
                <div className="empty-icon">◈</div>
                <div>No mentions in this category yet</div>
                <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-muted)' }}>Run a scan to pull fresh data</div>
              </div>
            ) : (
              <div className="feed-list">
                {tabMentions.map(m => (
                  <MentionCard key={m.id} mention={m} onReplyEdit={setEditMention} />
                ))}
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="panel-col">
            {/* Trend sparkline */}
            <div className="panel-card">
              <div className="panel-title">Mention volume · 24h</div>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={sparkData}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="h" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-muted)' }}
                  />
                  <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={1.5} fill="url(#grad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Platform breakdown */}
            <div className="panel-card">
              <div className="panel-title">By platform</div>
              <PlatformBreakdown byPlatform={stats.byPlatform || {}} total={stats.total || 1} />
            </div>

            {/* Category split */}
            <div className="panel-card">
              <div className="panel-title">Category split</div>
              {[
                { label: 'Brand defense', value: stats.defend, color: '#3b82f6' },
                { label: 'Visibility opps', value: stats.engage, color: '#10b981' },
                { label: 'Competitor intel', value: stats.competitor, color: '#f97316' },
              ].map(({ label, value, color }) => (
                <div key={label} className="platform-row" style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 12, minWidth: 120, color: 'var(--text-muted)' }}>{label}</span>
                  <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                    <div style={{
                      width: `${stats.total ? (value / stats.total) * 100 : 0}%`,
                      height: '100%', background: color, borderRadius: 2, transition: 'width 0.6s',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 24, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Urgent queue */}
            <div className="panel-card">
              <div className="panel-title">Urgent queue <span style={{ color: '#ef4444', fontSize: 12 }}>● {stats.urgent}</span></div>
              {mentions.filter(m => m.urgent).slice(0, 4).map(m => (
                <div key={m.id} className="urgent-item" onClick={() => setActiveTab(m.category)}>
                  <PlatformDot platform={m.platform} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {PLATFORM_LABELS[m.platform]} · {timeAgo(m.createdAt)}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{m.urgencyScore}/10</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── Edit reply modal ── */}
      {editMention && (
        <div className="modal-overlay" onClick={() => setEditMention(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Edit reply with AI</div>
              <button className="modal-close" onClick={() => setEditMention(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-section-label">Original mention</div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{editMention.title}</p>
              <div className="modal-section-label">Draft reply</div>
              <textarea
                className="reply-textarea"
                defaultValue={editMention.draftReply || ''}
                rows={5}
              />
              <div className="modal-section-label" style={{ marginTop: 12 }}>Refine the tone</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['More concise', 'More empathetic', 'More professional', 'More casual', 'Add a CTA'].map(t => (
                  <button key={t} className="btn" style={{ fontSize: 12 }}>{t}</button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditMention(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                if (editMention.url) window.open(editMention.url, '_blank');
                setEditMention(null);
              }}>
                Copy &amp; open thread →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
