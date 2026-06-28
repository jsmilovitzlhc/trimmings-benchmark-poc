import React, { useEffect, useState, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';

const VARIANT_OPTIONS = {
  patty_type: [
    { value: 'hamburger', label: 'Hamburger' },
    { value: 'cheeseburger', label: 'Cheeseburger' },
  ],
  patty_size: [
    { value: 'quarter_pound', label: '1/4 lb' },
    { value: 'third_pound', label: '1/3 lb' },
  ],
  blend_source: [
    { value: 'domestic', label: 'Domestic Blend' },
    { value: 'imported', label: 'Imported Blend' },
  ],
  scope: [
    { value: 'full_burger', label: 'Full Burger' },
    { value: 'patty_only', label: 'Patty Only' },
  ],
};

const DATE_RANGES = [
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'YTD', days: null, ytd: true },
  { label: 'ALL', days: null },
];

const COMPONENT_COLORS = {
  patty: '#58a6ff',
  bun: '#d29922',
  cheese: '#f0c040',
  lettuce: '#3fb950',
  tomato: '#f85149',
  onion: '#bc8cff',
  pickle: '#6bc950',
  condiments: '#8b949e',
};

function formatUSD(val) {
  if (val == null) return '—';
  return `$${val.toFixed(2)}`;
}

function formatChange(val) {
  if (val == null) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(4)}`;
}

function formatPct(val) {
  if (val == null) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;
}

export default function BurgerBenchmark({ apiHeaders }) {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState(null);
  const [recipe, setRecipe] = useState(null);
  const [report, setReport] = useState(null);
  const [dateRange, setDateRange] = useState('ALL');
  const [showIndexed, setShowIndexed] = useState(false);
  const [variants, setVariants] = useState({
    patty_type: 'hamburger',
    patty_size: 'quarter_pound',
    blend_source: 'domestic',
    scope: 'full_burger',
  });
  const [loading, setLoading] = useState(true);

  const variantParams = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(variants)) p.set(k, v);
    return p.toString();
  }, [variants]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/burger/latest?${variantParams}`, { headers: apiHeaders }).then(r => r.json()),
      fetch(`/api/burger/history?${variantParams}`, { headers: apiHeaders }).then(r => r.json()),
      fetch('/api/burger/recipe', { headers: apiHeaders }).then(r => r.json()),
      fetch('/api/burger/report', { headers: apiHeaders }).then(r => r.json()),
    ]).then(([lat, hist, rec, rep]) => {
      setLatest(lat);
      setHistory(hist);
      setRecipe(rec);
      setReport(rep);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, [variantParams]);

  const chartData = useMemo(() => {
    if (!history?.history) return [];
    let data = history.history.map(h => ({
      date: h.date,
      value: showIndexed ? h.indexed : h.total_cost,
      patty: h.breakdown.patty.cost,
      ...(h.breakdown.non_meat ? Object.fromEntries(
        Object.entries(h.breakdown.non_meat).map(([k, v]) => [k, v.price_usd])
      ) : {}),
    }));

    const rangeConfig = DATE_RANGES.find(r => r.label === dateRange);
    if (rangeConfig?.days) {
      const cutoff = format(subDays(new Date(), rangeConfig.days), 'yyyy-MM-dd');
      data = data.filter(d => d.date >= cutoff);
    } else if (rangeConfig?.ytd) {
      const yearStart = new Date().getFullYear() + '-01-01';
      data = data.filter(d => d.date >= yearStart);
    }
    return data;
  }, [history, dateRange, showIndexed]);

  const periodChanges = useMemo(() => {
    if (!history?.history || history.history.length < 2) return {};
    const sorted = [...history.history].sort((a, b) => a.date.localeCompare(b.date));
    const current = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];

    const findByOffset = (days) => {
      const cutoff = format(subDays(parseISO(current.date), days), 'yyyy-MM-dd');
      const match = sorted.reduce((best, h) => {
        if (h.date <= cutoff && (!best || h.date > best.date)) return h;
        return best;
      }, null);
      return match;
    };

    const monthAgo = findByOffset(30);
    const yearAgo = findByOffset(365);

    return {
      day: prev ? {
        change: current.total_cost - prev.total_cost,
        pct: ((current.total_cost - prev.total_cost) / prev.total_cost) * 100,
      } : null,
      month: monthAgo ? {
        change: current.total_cost - monthAgo.total_cost,
        pct: ((current.total_cost - monthAgo.total_cost) / monthAgo.total_cost) * 100,
      } : null,
      year: yearAgo ? {
        change: current.total_cost - yearAgo.total_cost,
        pct: ((current.total_cost - yearAgo.total_cost) / yearAgo.total_cost) * 100,
      } : null,
    };
  }, [history]);

  const stackedData = useMemo(() => {
    if (!history?.history) return [];
    return history.history.map(h => {
      const entry = { date: h.date, patty: h.breakdown.patty.cost };
      if (h.breakdown.non_meat) {
        for (const [k, v] of Object.entries(h.breakdown.non_meat)) {
          entry[k] = v.price_usd;
        }
      }
      return entry;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [history]);

  function handleExport() {
    window.open(`/api/burger/export?${variantParams}`, '_blank');
  }

  function updateVariant(key, value) {
    setVariants(prev => ({ ...prev, [key]: value }));
  }

  if (loading) return <div className="loading">Loading Burger Benchmark...</div>;

  const nonMeatKeys = latest?.breakdown?.non_meat ? Object.keys(latest.breakdown.non_meat) : [];

  return (
    <div>
      {/* Hero */}
      <div className="burger-hero">
        <div className="burger-hero-main">
          <div className="burger-hero-label">BURGER BENCHMARK</div>
          <div className="burger-hero-price">{latest ? formatUSD(latest.total_cost) : '—'}</div>
          <div className="burger-hero-date">{latest?.date || '—'}</div>
          <div className="burger-hero-variant">
            {variants.patty_type === 'cheeseburger' ? 'Cheeseburger' : 'Hamburger'} ·{' '}
            {VARIANT_OPTIONS.patty_size.find(o => o.value === variants.patty_size)?.label} ·{' '}
            {VARIANT_OPTIONS.blend_source.find(o => o.value === variants.blend_source)?.label} ·{' '}
            {VARIANT_OPTIONS.scope.find(o => o.value === variants.scope)?.label}
          </div>
        </div>
        <div className="burger-hero-changes">
          {[
            { label: 'Day', data: periodChanges.day },
            { label: 'Month', data: periodChanges.month },
            { label: 'Year', data: periodChanges.year },
          ].map(({ label, data }) => (
            <div key={label} className="change-cell">
              <div className="change-label">{label}</div>
              <div className={`change-value ${data?.change > 0 ? 'positive' : data?.change < 0 ? 'negative' : 'neutral'}`}>
                {data ? `${formatChange(data.change)} (${formatPct(data.pct)})` : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Variant Switcher */}
      <div className="variant-switcher">
        {Object.entries(VARIANT_OPTIONS).map(([key, options]) => (
          <div key={key} className="variant-group">
            {options.map(opt => (
              <button
                key={opt.value}
                className={`variant-btn ${variants[key] === opt.value ? 'active' : ''}`}
                onClick={() => updateVariant(key, opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Main Chart */}
      <div className="chart-section">
        <div className="chart-controls">
          <div className="chart-title-row">
            <h3>{showIndexed ? 'Indexed to 100' : 'Absolute Cost'}</h3>
            <button
              className={`series-toggle ${showIndexed ? 'active' : ''}`}
              onClick={() => setShowIndexed(!showIndexed)}
              style={showIndexed ? { borderColor: '#58a6ff', color: '#58a6ff' } : {}}
            >
              {showIndexed ? 'Show $' : 'Show Index'}
            </button>
          </div>
          <div className="date-range-btns">
            {DATE_RANGES.map(r => (
              <button
                key={r.label}
                className={dateRange === r.label ? 'active' : ''}
                onClick={() => setDateRange(r.label)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6e7681', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6e7681', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              tickFormatter={v => showIndexed ? v.toFixed(0) : `$${v.toFixed(2)}`}
              width={60}
              domain={showIndexed ? ['auto', 'auto'] : ['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#151c27', border: '1px solid #1e2a3a', borderRadius: 6, fontFamily: 'JetBrains Mono', fontSize: 12 }}
              formatter={(val) => [showIndexed ? val.toFixed(1) : `$${val.toFixed(4)}`, showIndexed ? 'Index' : 'Cost']}
              labelFormatter={v => v}
            />
            <Line type="monotone" dataKey="value" stroke="#58a6ff" dot={false} strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cost Breakdown Stacked Area */}
      {variants.scope === 'full_burger' && (
        <div className="chart-section">
          <h3 style={{ marginBottom: 16 }}>Cost Breakdown Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stackedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#6e7681', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#6e7681', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickFormatter={v => `$${v.toFixed(2)}`}
                width={60}
              />
              <Tooltip
                contentStyle={{ background: '#151c27', border: '1px solid #1e2a3a', borderRadius: 6, fontFamily: 'JetBrains Mono', fontSize: 12 }}
                formatter={(val, name) => [`$${val.toFixed(4)}`, name.charAt(0).toUpperCase() + name.slice(1)]}
                labelFormatter={v => v}
              />
              <Area type="monotone" dataKey="patty" stackId="1" fill={COMPONENT_COLORS.patty} stroke={COMPONENT_COLORS.patty} fillOpacity={0.7} />
              {nonMeatKeys.map(k => (
                <Area key={k} type="monotone" dataKey={k} stackId="1" fill={COMPONENT_COLORS[k] || '#666'} stroke={COMPONENT_COLORS[k] || '#666'} fillOpacity={0.7} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Current Breakdown Table */}
      {latest?.breakdown && (
        <div className="chart-section">
          <div className="data-table-header" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <h3>Current Cost Breakdown — {latest.date}</h3>
            <button className="btn" onClick={handleExport}>Export CSV</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Cost</th>
                <th>% of Total</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: COMPONENT_COLORS.patty, marginRight: 8 }}></span>
                  Patty ({latest.breakdown.patty.weight_oz}oz, 75CL blend)
                </td>
                <td>{formatUSD(latest.breakdown.patty.cost)}</td>
                <td>{((latest.breakdown.patty.cost / latest.total_cost) * 100).toFixed(1)}%</td>
                <td><span className="source-badge live">DB / Live</span></td>
              </tr>
              {latest.breakdown.non_meat && Object.entries(latest.breakdown.non_meat).map(([key, item]) => (
                <tr key={key}>
                  <td>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: COMPONENT_COLORS[key] || '#666', marginRight: 8 }}></span>
                    {item.label} ({item.quantity} {item.unit})
                  </td>
                  <td>{formatUSD(item.price_usd)}</td>
                  <td>{((item.price_usd / latest.total_cost) * 100).toFixed(1)}%</td>
                  <td>
                    <span className={`source-badge ${item.source === 'static' ? 'static' : 'live'}`}>
                      {item.source === 'static' ? 'Static' : 'DB / Live'}
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                <td>Total</td>
                <td>{formatUSD(latest.total_cost)}</td>
                <td>100%</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Methodology Panel */}
      <div className="chart-section methodology-panel">
        <h3 style={{ marginBottom: 16 }}>Methodology</h3>
        <div className="method-grid">
          <div className="method-item">
            <div className="method-label">Target CL</div>
            <div className="method-value">75CL</div>
          </div>
          <div className="method-item">
            <div className="method-label">Blend Formula</div>
            <div className="method-value">
              {recipe ? `${(blendRatio75().highProportion * 100).toFixed(1)}% 90CL + ${(blendRatio75().lowProportion * 100).toFixed(1)}% 50CL` : '—'}
            </div>
          </div>
          <div className="method-item">
            <div className="method-label">Patty Weight</div>
            <div className="method-value">{VARIANT_OPTIONS.patty_size.find(o => o.value === variants.patty_size)?.label} raw</div>
          </div>
          <div className="method-item">
            <div className="method-label">Index Base</div>
            <div className="method-value">{recipe?.index_base_date || '—'} = 100</div>
          </div>
          <div className="method-item">
            <div className="method-label">Meat Source</div>
            <div className="method-value">Published composites only (The Wall)</div>
          </div>
          <div className="method-item">
            <div className="method-label">Non-Meat</div>
            <div className="method-value">{report ? `${Object.values(report.components).filter(c => c.status === 'STATIC PLACEHOLDER').length} static placeholders` : '—'}</div>
          </div>
        </div>

        {report && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Component Sources</h4>
            <div className="source-list">
              {Object.entries(report.components).map(([key, comp]) => (
                <div key={key} className="source-item">
                  <span className="source-key">{key}</span>
                  <span className={`source-badge ${comp.status === 'live' ? 'live' : 'static'}`}>
                    {comp.status}
                  </span>
                  {comp.series && <span className="source-detail">← {comp.series}</span>}
                  {comp.price != null && <span className="source-detail">${comp.price.toFixed(2)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function blendRatio75() {
  const targetCL = 75, clHigh = 90, clLow = 50;
  const highProportion = (targetCL - clLow) / (clHigh - clLow);
  return { highProportion, lowProportion: 1 - highProportion };
}
