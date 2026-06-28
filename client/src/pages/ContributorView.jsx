import React, { useState, useEffect, useRef } from 'react';

const SERIES_OPTIONS = [
  { id: 'domestic_90cl', name: 'MP Domestic 90CL', unit: '$/cwt' },
  { id: 'domestic_50cl', name: 'MP Domestic 50CL', unit: '$/cwt' },
  { id: 'imported_90cl', name: 'MP Imported 90CL', unit: '$/lb' },
];

export default function ContributorView({ apiHeaders, role, contributorId }) {
  const [form, setForm] = useState({ series_id: 'domestic_90cl', date: new Date().toISOString().split('T')[0], price: '', volume: '', notes: '' });
  const [myTrades, setMyTrades] = useState([]);
  const [status, setStatus] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [assessmentForm, setAssessmentForm] = useState({ series_id: 'domestic_90cl', date: new Date().toISOString().split('T')[0] });
  const [assessmentResult, setAssessmentResult] = useState(null);
  const fileRef = useRef();

  function loadTrades() {
    fetch('/api/trades', { headers: apiHeaders })
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setMyTrades(data) : setMyTrades([]))
      .catch(console.error);
  }

  useEffect(() => { loadTrades(); }, [contributorId, role]);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    const res = await fetch('/api/trades', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({ ...form, price: parseFloat(form.price), volume: form.volume ? parseFloat(form.volume) : null }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus({ type: 'success', msg: `Trade #${data.id} submitted (${data.status})` });
      setForm(f => ({ ...f, price: '', volume: '', notes: '' }));
      loadTrades();
    } else {
      setStatus({ type: 'error', msg: data.error });
    }
  }

  async function handleUpload() {
    if (!fileRef.current?.files[0]) return;
    setUploadStatus(null);
    const fd = new FormData();
    fd.append('file', fileRef.current.files[0]);
    const res = await fetch('/api/trades/upload', {
      method: 'POST',
      headers: { 'x-role': role, 'x-contributor-id': contributorId },
      body: fd,
    });
    const data = await res.json();
    if (res.ok) {
      setUploadStatus({ type: 'success', msg: `Uploaded: ${data.accepted} accepted, ${data.rejected} rejected` });
      loadTrades();
    } else {
      setUploadStatus({ type: 'error', msg: data.error });
    }
    fileRef.current.value = '';
  }

  async function handleRunAssessment() {
    setAssessmentResult(null);
    const res = await fetch('/api/assessments/run', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(assessmentForm),
    });
    const data = await res.json();
    setAssessmentResult(data);
  }

  if (role !== 'contributor' && role !== 'admin') {
    return <div className="status-msg info">Switch to contributor or admin role to access this view.</div>;
  }

  return (
    <div>
      <div className="form-section">
        <h3>Submit Trade</h3>
        {status && <div className={`status-msg ${status.type}`}>{status.msg}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Series</label>
              <select value={form.series_id} onChange={e => setForm(f => ({ ...f, series_id: e.target.value }))}>
                {SERIES_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="form-field">
              <label>Price</label>
              <input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="460.00" required />
            </div>
            <div className="form-field">
              <label>Volume (lbs)</label>
              <input type="number" value={form.volume} onChange={e => setForm(f => ({ ...f, volume: e.target.value }))} placeholder="40000" />
            </div>
            <div className="form-field">
              <label>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">Submit Trade</button>
          </div>
        </form>
      </div>

      <div className="form-section">
        <h3>Bulk CSV Upload</h3>
        {uploadStatus && <div className={`status-msg ${uploadStatus.type}`}>{uploadStatus.msg}</div>}
        <div className="upload-area" onClick={() => fileRef.current?.click()}>
          <p>Click to upload CSV file</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Columns: series_id, date, price, volume, unit, notes</p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUpload} />
        </div>
        <div style={{ marginTop: 8 }}>
          <a href="/api/trades/template" className="btn" style={{ textDecoration: 'none', display: 'inline-block' }}>Download Template</a>
        </div>
      </div>

      {role === 'admin' && (
        <div className="form-section">
          <h3>Run Assessment</h3>
          {assessmentResult && (
            <div className={`status-msg ${assessmentResult.success ? 'success' : 'error'}`}>
              {assessmentResult.success
                ? `VWAP: $${assessmentResult.value.toFixed(2)} | Trades used: ${assessmentResult.tradesUsed} | Outliers: ${assessmentResult.outliersRemoved}`
                : assessmentResult.error}
            </div>
          )}
          <div className="form-grid">
            <div className="form-field">
              <label>Series</label>
              <select value={assessmentForm.series_id} onChange={e => setAssessmentForm(f => ({ ...f, series_id: e.target.value }))}>
                {SERIES_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={assessmentForm.date} onChange={e => setAssessmentForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleRunAssessment}>Run Assessment</button>
          </div>
        </div>
      )}

      <div className="data-table-wrapper">
        <div className="data-table-header">
          <h3>My Submissions</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Series</th>
              <th>Date</th>
              <th>Price</th>
              <th>Volume</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {myTrades.map(t => (
              <tr key={t.id}>
                <td>#{t.id}</td>
                <td>{t.series_id}</td>
                <td>{t.date}</td>
                <td>${parseFloat(t.price).toFixed(2)}</td>
                <td>{t.volume ? parseInt(t.volume).toLocaleString() : '—'}</td>
                <td>
                  <span style={{
                    color: t.status === 'accepted' ? '#3fb950' : t.status === 'outlier' ? '#f85149' : '#d29922'
                  }}>{t.status}</span>
                </td>
                <td style={{ fontSize: 11 }}>{t.submitted_at}</td>
              </tr>
            ))}
            {myTrades.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6e7681' }}>No trades yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
