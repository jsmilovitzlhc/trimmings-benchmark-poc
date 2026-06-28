import React, { useEffect, useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, subDays, subMonths, subYears, parseISO } from 'date-fns';

const SERIES_COLORS = {
  domestic_90cl: '#58a6ff',
  domestic_50cl: '#3fb950',
  imported_90cl: '#f85149',
  '75cl_meatblock': '#d29922',
  trim_spread: '#bc8cff',
};

const SERIES_LABELS = {
  domestic_90cl: '90CL Dom',
  domestic_50cl: '50CL Dom',
  imported_90cl: '90CL Imp',
  '75cl_meatblock': '75CL Block',
  trim_spread: 'Spread',
};

const DATE_RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'ALL', days: null },
];

function formatPrice(val, unit) {
  if (val == null) return '—';
  if (unit === '$/lb') return `$${val.toFixed(2)}`;
  return `$${val.toFixed(2)}`;
}

export default function Dashboard({ apiHeaders }) {
  const [headlines, setHeadlines] = useState([]);
  const [allData, setAllData] = useState({});
  const [activeSeries, setActiveSeries] = useState(['domestic_90cl', 'domestic_50cl']);
  const [dateRange, setDateRange] = useState('6M');
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/assessments/latest', { headers: apiHeaders })
      .then(r => r.json())
      .then(setHeadlines)
      .catch(console.error);

    const seriesIds = Object.keys(SERIES_COLORS);
    Promise.all(seriesIds.map(id =>
      fetch(`/api/assessments?series_id=${id}&limit=2000`, { headers: apiHeaders })
        .then(r => r.json())
        .then(data => ({ id, data }))
    )).then(results => {
      const map = {};
      for (const { id, data } of results) map[id] = data;
      setAllData(map);
      setLoading(false);
    });
  }, []);

  const chartData = useMemo(() => {
    const dateMap = {};
    for (const seriesId of activeSeries) {
      const data = allData[seriesId] || [];
      for (const d of data) {
        if (!dateMap[d.date]) dateMap[d.date] = { date: d.date };
        dateMap[d.date][seriesId] = d.value;
      }
    }
    let sorted = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));

    const rangeConfig = DATE_RANGES.find(r => r.label === dateRange);
    if (rangeConfig?.days) {
      const cutoff = format(subDays(new Date(), rangeConfig.days), 'yyyy-MM-dd');
      sorted = sorted.filter(d => d.date >= cutoff);
    }
    return sorted;
  }, [allData, activeSeries, dateRange]);

  useEffect(() => {
    const selected = activeSeries[0] || 'domestic_90cl';
    const data = allData[selected] || [];
    setTableData(data.slice(0, 30));
    if (data.length > 0) setSelectedAssessment(data[0]);
  }, [allData, activeSeries]);

  function toggleSeries(id) {
    setActiveSeries(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (activeSeries.length === 1) params.set('series_id', activeSeries[0]);
    window.open(`/api/assessments/export?${params}`, '_blank');
  }

  if (loading) return <div className="loading">Loading trimmings data...</div>;

  return (
    <div>
      <div className="headline-strip">
        {headlines.map(h => (
          <div key={h.id} className="headline-card" onClick={() => {
            setActiveSeries([h.id]);
            setSelectedAssessment(h.latest);
          }}>
            <div className="series-name">{h.name}</div>
            <div className="price">
              {h.latest ? formatPrice(h.latest.value, h.unit) : '—'}
            </div>
            <div className={`change ${h.change > 0 ? 'positive' : h.change < 0 ? 'negative' : 'neutral'}`}>
              {h.change != null ? `${h.change > 0 ? '+' : ''}${h.change.toFixed(2)} (${h.changePct > 0 ? '+' : ''}${h.changePct?.toFixed(1)}%)` : '—'}
            </div>
            <div className="unit">{h.unit} · {h.source_type}</div>
            {h.latest && <div className="date">{h.latest.date}</div>}
          </div>
        ))}
      </div>

      {selectedAssessment && (
        <div className="assessment-panel">
          <h3>Assessment Detail</h3>
          <div className="assessment-detail">
            <div className="detail-item">
              <label>Date</label>
              <div className="value">{selectedAssessment.date}</div>
            </div>
            <div className="detail-item">
              <label>Value</label>
              <div className="value">{formatPrice(selectedAssessment.value)}</div>
            </div>
            <div className="detail-item">
              <label>Low</label>
              <div className="value">{selectedAssessment.low != null ? formatPrice(selectedAssessment.low) : '—'}</div>
            </div>
            <div className="detail-item">
              <label>High</label>
              <div className="value">{selectedAssessment.high != null ? formatPrice(selectedAssessment.high) : '—'}</div>
            </div>
            <div className="detail-item">
              <label>Volume</label>
              <div className="value">{selectedAssessment.volume ? selectedAssessment.volume.toLocaleString() + ' lbs' : '—'}</div>
            </div>
            <div className="detail-item">
              <label>Source</label>
              <div className="value" style={{fontSize: 13}}>{selectedAssessment.data_source}</div>
            </div>
          </div>
        </div>
      )}

      <div className="chart-section">
        <div className="chart-controls">
          <div className="series-toggles">
            {Object.entries(SERIES_LABELS).map(([id, label]) => (
              <button
                key={id}
                className={`series-toggle ${activeSeries.includes(id) ? 'active' : ''}`}
                onClick={() => toggleSeries(id)}
                style={activeSeries.includes(id) ? { borderColor: SERIES_COLORS[id], color: SERIES_COLORS[id] } : {}}
              >
                {label}
              </button>
            ))}
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
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <XAxis
              dataKey="date"
              tick={{ fill: '#6e7681', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6e7681', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              tickFormatter={v => `$${v}`}
              width={70}
            />
            <Tooltip
              contentStyle={{ background: '#151c27', border: '1px solid #1e2a3a', borderRadius: 6, fontFamily: 'JetBrains Mono', fontSize: 12 }}
              labelFormatter={v => v}
              formatter={(val, name) => [`$${val.toFixed(2)}`, SERIES_LABELS[name] || name]}
            />
            <Legend formatter={v => SERIES_LABELS[v] || v} />
            {activeSeries.map(id => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                stroke={SERIES_COLORS[id]}
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="data-table-wrapper">
        <div className="data-table-header">
          <h3>Assessment History {activeSeries.length === 1 ? `— ${SERIES_LABELS[activeSeries[0]]}` : ''}</h3>
          <button className="btn" onClick={handleExport}>Export CSV</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Value</th>
              <th>Low</th>
              <th>High</th>
              <th>Volume</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((d, i) => (
              <tr key={i} onClick={() => setSelectedAssessment(d)} style={{ cursor: 'pointer' }}>
                <td>{d.date}</td>
                <td>{formatPrice(d.value)}</td>
                <td>{d.low != null ? formatPrice(d.low) : '—'}</td>
                <td>{d.high != null ? formatPrice(d.high) : '—'}</td>
                <td>{d.volume ? d.volume.toLocaleString() : '—'}</td>
                <td>{d.data_source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
