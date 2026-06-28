import React, { useEffect, useState } from 'react';

export default function AuditLog({ apiHeaders }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    fetch('/api/audit-log?limit=100', { headers: apiHeaders })
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setEntries(data) : setEntries([]))
      .catch(console.error);
  }, []);

  return (
    <div>
      <div className="form-section">
        <h3>Audit Log</h3>
        <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 16 }}>
          Immutable record of all trade submissions, assessment runs, and system events.
        </p>
        {entries.length === 0 ? (
          <div style={{ color: '#6e7681', textAlign: 'center', padding: 24 }}>No audit entries yet.</div>
        ) : (
          entries.map(e => (
            <div key={e.id} className="audit-entry">
              <span className="timestamp">{e.created_at}</span>
              <span className="event-type">{e.event_type}</span>
              <span style={{ color: '#8b949e' }}>{e.entity_type}/{e.entity_id}</span>
              <span style={{ color: '#6e7681', flex: 1 }}>
                {e.details ? (() => { try { const d = JSON.parse(e.details); return Object.entries(d).map(([k,v]) => `${k}=${v}`).join(' '); } catch { return e.details; } })() : ''}
              </span>
              <span style={{ color: '#6e7681', fontSize: 11 }}>by {e.actor || 'system'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
