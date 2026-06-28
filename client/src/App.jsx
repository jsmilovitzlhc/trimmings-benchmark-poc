import React, { useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ContributorView from './pages/ContributorView';
import Methodology from './pages/Methodology';
import AuditLog from './pages/AuditLog';
import BurgerBenchmark from './pages/BurgerBenchmark';

const ROLES = ['subscriber', 'contributor', 'admin'];
const CONTRIBUTORS = [
  { id: 'contrib-001', name: 'Alpha Packing Co.' },
  { id: 'contrib-002', name: 'Midwest Beef Trading' },
  { id: 'contrib-003', name: 'Pacific Coast Provisions' },
  { id: 'contrib-004', name: 'Great Plains Protein' },
  { id: 'contrib-005', name: 'Eastern Seaboard Meats' },
];

export default function App() {
  const [role, setRole] = useState('subscriber');
  const [contributorId, setContributorId] = useState('contrib-001');

  const apiHeaders = {
    'Content-Type': 'application/json',
    'x-role': role,
    'x-contributor-id': contributorId,
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-logo">MP<span>/</span>TRIMMINGS</div>
          <nav className="header-nav">
            <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''} end>Dashboard</NavLink>
            <NavLink to="/burger" className={({ isActive }) => isActive ? 'active' : ''}>Burger</NavLink>
            {(role === 'contributor' || role === 'admin') && (
              <NavLink to="/contribute" className={({ isActive }) => isActive ? 'active' : ''}>Contribute</NavLink>
            )}
            <NavLink to="/methodology" className={({ isActive }) => isActive ? 'active' : ''}>Methodology</NavLink>
            {role === 'admin' && (
              <NavLink to="/audit" className={({ isActive }) => isActive ? 'active' : ''}>Audit Log</NavLink>
            )}
          </nav>
        </div>
        <div className="role-switcher">
          <span className={`role-badge ${role}`}>{role}</span>
          <select value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {(role === 'contributor' || role === 'admin') && (
            <select value={contributorId} onChange={e => setContributorId(e.target.value)}>
              {CONTRIBUTORS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard apiHeaders={apiHeaders} />} />
          <Route path="/burger" element={<BurgerBenchmark apiHeaders={apiHeaders} />} />
          <Route path="/contribute" element={<ContributorView apiHeaders={apiHeaders} role={role} contributorId={contributorId} />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/audit" element={<AuditLog apiHeaders={apiHeaders} />} />
        </Routes>
      </main>
    </div>
  );
}
