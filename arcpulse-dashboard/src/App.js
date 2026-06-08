import React, { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api, DEMO_STATS, DEMO_MENTIONS } from './lib/api';
import { signInWithGoogle, signOutUser, onAuth } from './firebase';
import './App.css';

const PLATFORM_COLORS = {
  reddit: '#FF4500', hackernews: '#FF6600',
  news: '#6B7280', blog: '#8B5CF6',
};

const PLATFORM_LABELS = {
  reddit: 'Reddit', hackernews: 'Hacker News',
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
          <span className="time-label">{timeAgo(mention.publishedAt || mention.createdAt)}</span>
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

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

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

function ChipInput({ label, values, onChange }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  };
  return (
    <div className="settings-section">
      <div className="modal-section-label">{label}</div>
      <div className="tag-list">
        {values.map((v, i) => (
          <span key={i} className="tag-chip">
            {v}
            <button className="tag-remove" onClick={() => onChange(values.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <div className="tag-add-row">
        <input
          className="tag-input"
          value={input}
          placeholder={`Add ${label.toLowerCase()}…`}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button className="btn" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const handleLogin = async () => {
    setLoading(true);
    try { await onLogin(); } catch (e) { setError(e.message); setLoading(false); }
  };
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, color: 'var(--accent)', marginBottom: 12 }}>◈</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: '0.1em', marginBottom: 8 }}>ArcPulse</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32 }}>CMR Fabrications brand monitor</div>
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ padding: '10px 24px', borderRadius: 6, border: '1px solid var(--border-mid)', background: 'var(--bg-hover)', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 14, cursor: 'pointer' }}
        >
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>
        {error && <div style={{ marginTop: 12, fontSize: 12, color: '#ef4444' }}>{error}</div>}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser]             = useState(undefined);
  const [stats, setStats]           = useState({ total:0, urgent:0, defend:0, engage:0, competitor:0, positive:0, negative:0, byPlatform:{} });
  const [mentions, setMentions]     = useState([]);
  const [activeTab, setActiveTab]   = useState('defend');
  const [platformFilter, setPF]     = useState('all');
  const [scanning, setScanning]     = useState(false);
  const [lastScan, setLastScan]     = useState(null);
  const [editMention, setEditMention] = useState(null);
  const [hoursBack, setHoursBack]   = useState(24);
  const [usingDemo, setUsingDemo]   = useState(false);
  const [apiError, setApiError]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showSettings, setShowSettings]         = useState(false);
  const [settingsBrands, setSettingsBrands]     = useState([]);
  const [settingsComps, setSettingsComps]       = useState([]);
  const [settingsKws, setSettingsKws]           = useState([]);
  const [settingsAlerts, setSettingsAlerts]     = useState([]);
  const [settingsLoading, setSettingsLoading]   = useState(false);
  const [settingsSaving, setSettingsSaving]     = useState(false);

  useEffect(() => onAuth(u => setUser(u || null)), []);

  const loadData = useCallback(async () => {
    try {
      setApiError(null);
      setLoading(true);
      const [s, m] = await Promise.all([
        api.getStats(hoursBack),
        api.getMentions({ hoursBack, limit: 100 }),
      ]);
      setStats(s);
      setMentions(m.mentions || []);
    } catch (err) {
      console.error('API error:', err);
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }, [hoursBack]);

  useEffect(() => { if (user) loadData(); }, [loadData, user]);

  const triggerScan = async (type) => {
    setScanning(true);
    try {
      await api.triggerScan(type);
      setTimeout(() => { loadData(); setScanning(false); setLastScan(new Date()); }, 3000);
    } catch {
      setScanning(false);
    }
  };

  const openSettings = async () => {
    setShowSettings(true);
    setSettingsLoading(true);
    try {
      const cfg = await api.getConfig();
      setSettingsBrands(cfg.brandNames           || []);
      setSettingsComps(cfg.competitorNames       || []);
      setSettingsKws(cfg.keywords                || []);
      setSettingsAlerts(cfg.googleAlertsRssUrls  || []);
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await api.saveConfig({ brandNames: settingsBrands, competitorNames: settingsComps, keywords: settingsKws, googleAlertsRssUrls: settingsAlerts });
      setShowSettings(false);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSettingsSaving(false);
    }
  };

  const tabMentions = mentions.filter(m => {
    if (activeTab !== m.category) return false;
    if (platformFilter !== 'all' && m.platform !== platformFilter) return false;
    return true;
  }).sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));

  const tabs = [
    { id: 'defend',     label: 'Brand defense',   color: '#3b82f6' },
    { id: 'engage',     label: 'Visibility opps',  color: '#10b981' },
    { id: 'competitor', label: 'Competitor intel',  color: '#f97316' },
  ];

  const activePlatforms = ['all', ...Object.keys(stats.byPlatform || {}).filter(p => (stats.byPlatform[p] || 0) > 0)];

  const sparkData = Array.from({ length: 12 }, (_, i) => ({
    h: `${(i * 2) % 24}h`,
    v: Math.floor(Math.random() * 8) + 2,
  }));

  if (user === undefined) return null; // auth loading
  if (!user) return <LoginScreen onLogin={signInWithGoogle} />;

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-mark">◈</span>
          <span className="logo-text">ArcPulse</span>
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
          <div className="user-profile">
            {user?.photoURL && (
              <img src={user.photoURL} alt="" className="user-avatar" referrerPolicy="no-referrer" />
            )}
            <div className="user-info">
              <div className="user-name">{user?.displayName || user?.email}</div>
              <div className="user-email">{user?.displayName ? user.email : ''}</div>
            </div>
            <button className="logout-btn" onClick={signOutUser} title="Sign out">↩</button>
          </div>
          <div className="scan-controls">
            <button
              className={`scan-btn ${scanning ? 'scanning' : ''}`}
              onClick={() => triggerScan('full')}
              disabled={scanning}
            >
              {scanning ? '⟳ Scanning...' : '▶ Run full scan'}
            </button>
            <div className="scan-quick">
              {['reddit', 'web'].map(t => (
                <button key={t} className="quick-btn" onClick={() => triggerScan(t)} disabled={scanning}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {lastScan && (
            <div className="last-scan">Last scan: {timeAgo(lastScan.toISOString())}</div>
          )}
          {apiError && (
            <div className="demo-notice" style={{ color: '#ef4444' }}>
              API error: {apiError}
            </div>
          )}
          <button className="settings-btn" onClick={openSettings}>⚙ Monitoring settings</button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main">
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
                {loading
                  ? <div>Loading…</div>
                  : <>
                      <div>No mentions in this category yet</div>
                      <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-muted)' }}>
                        {stats.total === 0
                          ? 'Add Reddit credentials to start monitoring welding communities'
                          : 'Run a scan to pull fresh data'}
                      </div>
                    </>
                }
              </div>
            ) : (
              <div className="feed-list">
                {tabMentions.map(m => (
                  <MentionCard key={m.id} mention={m} onReplyEdit={setEditMention} />
                ))}
              </div>
            )}
          </div>

          <div className="panel-col">
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

            <div className="panel-card">
              <div className="panel-title">By platform</div>
              <PlatformBreakdown byPlatform={stats.byPlatform || {}} total={stats.total || 1} />
            </div>

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

      {/* ── Settings modal ── */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">⚙ Monitoring settings</div>
              <button className="modal-close" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="modal-body">
              {settingsLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>
              ) : (
                <>
                  <ChipInput label="Brands" values={settingsBrands} onChange={setSettingsBrands} />
                  <ChipInput label="Competitors" values={settingsComps} onChange={setSettingsComps} />
                  <ChipInput label="Keywords" values={settingsKws} onChange={setSettingsKws} />
                  <ChipInput label="Google Alerts RSS feeds" values={settingsAlerts} onChange={setSettingsAlerts} />
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Paste a Google Alerts RSS URL per feed. Changes take effect on the next scan.
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSettings} disabled={settingsSaving || settingsLoading}>
                {settingsSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

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
