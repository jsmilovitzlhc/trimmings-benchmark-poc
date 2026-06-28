import React from 'react';

export default function Methodology() {
  return (
    <div className="methodology">
      <h2>Benchmark Methodology</h2>

      <div className="form-section">
        <h3>Overview</h3>
        <p>
          The MP Trimmings Benchmark produces daily assessed prices for five beef trimmings series,
          combining contributor-submitted trade data with transparent, repeatable calculation methods.
          Assessments reflect actual market transactions rather than indicative or survey-based pricing.
        </p>
      </div>

      <div className="form-section">
        <h3>The Five Series</h3>
        <p><strong>MP Domestic 90CL</strong> — Domestic boneless beef trimmings, 90% chemical lean. Quoted in $/cwt. Directly assessed from contributor trade submissions.</p>
        <p><strong>MP Domestic 50CL</strong> — Domestic boneless beef trimmings, 50% lean. Quoted in $/cwt. Directly assessed from contributor trade submissions.</p>
        <p><strong>MP Imported 90CL</strong> — Imported boneless beef trimmings, 90% chemical lean. Quoted in $/lb. Directly assessed from contributor trade submissions.</p>
        <p><strong>MP 75CL Meat-Block</strong> — Derived series. Calculated as a weighted blend of 90CL and 50CL at a standard formulation ratio. Currently: <code>0.625 × 90CL + 0.375 × 50CL</code>.</p>
        <p><strong>MP Trim Spread</strong> — Derived series. Calculated as Domestic 90CL minus Imported 90CL (unit-normalized to $/cwt). Represents the domestic premium/discount to imported trimmings.</p>
      </div>

      <div className="form-section">
        <h3>Assessment Method: VWAP</h3>
        <p>
          Each raw series assessment is computed using Volume-Weighted Average Price (VWAP).
          When volume data is available, the assessment weights each trade by its reported volume.
          When volume is unavailable, a simple arithmetic mean is used as a fallback.
        </p>
        <p>Formula: <code>VWAP = Σ(Price × Volume) / Σ(Volume)</code></p>
      </div>

      <div className="form-section">
        <h3>Outlier Detection</h3>
        <p>
          Before computing the assessment, trades are screened for statistical outliers using
          z-score analysis. Any trade with a price z-score exceeding <code>2.5</code> standard
          deviations from the mean is flagged as an outlier and excluded from the VWAP calculation.
          A minimum of 3 trades is required to run an assessment.
        </p>
      </div>

      <div className="form-section">
        <h3>Contributor Confidentiality (The Wall)</h3>
        <p>
          Raw trade submissions are strictly confidential. Contributors can only view their own
          submitted trades — never the submissions of other contributors. The assessed benchmark
          price is the only output visible to all subscribers. This separation is enforced at the
          API layer and is fundamental to the benchmark's integrity.
        </p>
      </div>

      <div className="form-section">
        <h3>Audit Trail</h3>
        <p>
          Every trade submission, assessment run, and system action is recorded in an immutable
          audit log. The log captures the actor, timestamp, event type, and relevant details.
          This provides full traceability for regulatory and compliance purposes.
        </p>
      </div>

      <div className="form-section">
        <h3>Derived Series Configuration</h3>
        <p>
          The 75CL Meat-Block uses a configurable blend ratio stored as a system constant.
          The current standard formulation is <code>62.5% 90CL + 37.5% 50CL</code>.
          The Trim Spread normalizes imported $/lb to $/cwt before computing the differential.
          Both derived series are automatically recomputed whenever their input series receive new assessments.
        </p>
      </div>

      <div className="form-section" style={{ background: '#1a2a3a', borderColor: '#2a3a4a' }}>
        <h3 style={{ color: '#58a6ff' }}>POC Notice</h3>
        <p>
          This is a proof-of-concept implementation. In production, the methodology would be
          reviewed by an independent committee, subject to IOSCO Principles for Financial Benchmarks,
          and audited annually. The POC demonstrates the technical feasibility and data flow
          of the benchmark assessment process.
        </p>
      </div>
    </div>
  );
}
