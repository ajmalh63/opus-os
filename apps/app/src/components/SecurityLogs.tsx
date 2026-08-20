import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// Real session-driven auth — the live cookie, never a forged token.

// API interface matching Drizzle schemas & Zod validators
interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entityName: string;
  entityId: string;
  beforeState: string | null;
  afterState: string | null;
  ipAddress: string | null;
  createdAt: number;
  category: string | null;
  actorType: string | null;
  result: string | null;
  authMethod: string | null;
  requestId: string | null;
  schemaVersion: string | null;
  prevHash: string | null;
  recordHash: string | null;
}

interface ChainVerification {
  valid: boolean;
  total: number;
  preChain: number;
  firstBreak: number | null;
  reason: string | null;
}

// Extracted from AdminConsole — standalone so it can live in the workspace
// sidebar (Security & Program → Security Logs). Self-contained: zero props.
export default function SecurityLogs() {
  // Local inline toast (AdminConsole used an injected showToast prop)
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' | 'warning' }>({
    show: false,
    msg: '',
    type: 'success'
  });

  // Audit Log Filter/Search State
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [actorTypeFilter, setActorTypeFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [actorSearch, setActorSearch] = useState('');
  const [selectedLogDetail, setSelectedLogDetail] = useState<AuditLog | null>(null);
  const [checkingChain, setCheckingChain] = useState(false);
  const [chainResult, setChainResult] = useState<ChainVerification | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 4000);
  };

  // Queries
  const { data: auditData, isLoading: loadingAudit, isError: auditError } = useQuery<{ logs: AuditLog[] }>({
    queryKey: ['adminAuditLogs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit-logs', { credentials: 'include', 
        headers: {
          }
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to fetch audit log history');
      }
      return res.json();
    }
  });

  // Client-side filtering of audit logs
  const getFilteredLogs = () => {
    if (!auditData?.logs) return [];

    // Sort descending by default
    const sorted = [...auditData.logs].sort((a, b) => b.createdAt - a.createdAt);

    return sorted.filter(log => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (entityFilter !== 'all' && log.entityName !== entityFilter) return false;
      if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
      if (actorTypeFilter !== 'all' && log.actorType !== actorTypeFilter) return false;
      if (resultFilter !== 'all' && log.result !== resultFilter) return false;
      if (actorSearch.trim()) {
        const search = actorSearch.toLowerCase();
        const actorMatch = log.actorId?.toLowerCase().includes(search);
        const actionMatch = log.action.toLowerCase().includes(search);
        const entityIdMatch = log.entityId.toLowerCase().includes(search);
        if (!actorMatch && !actionMatch && !entityIdMatch) return false;
      }
      return true;
    });
  };

  // Helper to extract unique actions and entities for filters
  const uniqueActions = Array.from(new Set(auditData?.logs?.map(l => l.action) || []));
  const uniqueEntities = Array.from(new Set(auditData?.logs?.map(l => l.entityName) || []));
  const uniqueCategories = Array.from(new Set((auditData?.logs || []).map(l => l.category).filter((v): v is string => !!v))).sort();
  const uniqueActorTypes = Array.from(new Set((auditData?.logs || []).map(l => l.actorType).filter((v): v is string => !!v))).sort();
  const uniqueResults = Array.from(new Set((auditData?.logs || []).map(l => l.result).filter((v): v is string => !!v))).sort();

  // Audit integrity chain verification + CSV export
  const verifyChain = async () => {
    setCheckingChain(true);
    try {
      const res = await fetch('/api/admin/audit/verify-chain', { credentials: 'include',  headers: { } });
      if (!res.ok) {
        throw new Error((await res.text()) || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ChainVerification;
      setChainResult(data);
      if (data.valid) {
        showToast('Audit chain verified — no tampering detected.', 'success');
      } else {
        showToast('Audit chain integrity check FAILED — investigate immediately.', 'error');
      }
    } catch (err: any) {
      showToast(`Chain verification failed: ${err.message}`, 'error');
    } finally {
      setCheckingChain(false);
    }
  };

  const exportAuditCsv = async () => {
    setExportingCsv(true);
    try {
      const res = await fetch('/api/admin/audit/export?format=csv', { credentials: 'include',  headers: { } });
      if (!res.ok) {
        throw new Error((await res.text()) || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/);
      a.href = url;
      a.download = filenameMatch ? filenameMatch[1] : `audit-export-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Audit log CSV exported.', 'success');
    } catch (err: any) {
      showToast(`CSV export failed: ${err.message}`, 'error');
    } finally {
      setExportingCsv(false);
    }
  };

  // Result Chip Styling (audit outcome)
  const getResultChipStyle = (result: string | null) => {
    switch (result) {
      case 'success':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'error':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'denied':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  // Helper to format UNIX timestamps
  const formatTime = (ts: number) => {
    if (!ts) return 'N/A';
    return new Date(ts * 1000).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  return (
    <>
      {/* LOCAL TOAST SYSTEM */}
      <div className={`fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-xl border-l-4 px-4 py-3 text-xs text-white shadow-2xl transition duration-300 ${
        toast.type === 'success' ? 'border-brand-gold bg-brand-navy' :
        toast.type === 'error' ? 'border-rose-500 bg-brand-navy' :
        'border-amber-400 bg-brand-navy'
      } ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'}`}>
        <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
        <span>{toast.msg}</span>
      </div>

      <div className="space-y-6">

        {/* CHAIN VERIFY + EXPORT TOOLBAR */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={verifyChain}
            disabled={checkingChain}
            className="px-3 py-1.5 bg-brand-navy/[0.05] hover:bg-brand-navy/[0.06] border border-brand-navy/15 text-brand-gold text-[10px] uppercase font-semibold tracking-wider rounded transition duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {checkingChain ? 'Verifying Chain...' : 'Verify Chain'}
          </button>
          <button
            onClick={exportAuditCsv}
            disabled={exportingCsv}
            className="px-3 py-1.5 bg-brand-navy/[0.05] hover:bg-brand-navy/[0.06] border border-brand-navy/15 text-brand-navy/70 hover:text-brand-navy text-[10px] uppercase font-semibold tracking-wider rounded transition duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {exportingCsv ? 'Exporting...' : 'Export CSV'}
          </button>
          {chainResult && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-semibold ${
              chainResult.valid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>
              <span>{chainResult.valid ? '✓' : '✗'}</span>
              {chainResult.valid ? (
                <span>Chain valid — {chainResult.total} rows ({chainResult.preChain} pre-chain)</span>
              ) : (
                <span>
                  Chain BROKEN: {chainResult.reason || 'unknown'}
                  {chainResult.firstBreak !== null && ` — broken at row ${chainResult.firstBreak}`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* FILTERS & SEARCH ROW */}
        <div className="bg-white border border-brand-navy/10 p-4 rounded-xl flex flex-wrap gap-4 items-end text-xs">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Search logs
            </label>
            <input
              type="text"
              placeholder="Search Action, Entity, Actor ID..."
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
              className="w-full bg-white border border-brand-navy/10 rounded px-2.5 py-1.5 text-xs text-brand-navy focus:outline-none focus:border-brand-gold"
            />
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Action Type
            </label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-white border border-brand-navy/10 rounded px-2.5 py-1.5 text-xs text-brand-navy focus:outline-none"
            >
              <option value="all">All Actions</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Entity Table
            </label>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="bg-white border border-brand-navy/10 rounded px-2.5 py-1.5 text-xs text-brand-navy focus:outline-none"
            >
              <option value="all">All Entities</option>
              {uniqueEntities.map(ent => (
                <option key={ent} value={ent}>{ent}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white border border-brand-navy/10 rounded px-2.5 py-1.5 text-xs text-brand-navy focus:outline-none"
            >
              <option value="all">All Categories</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Actor Type
            </label>
            <select
              value={actorTypeFilter}
              onChange={(e) => setActorTypeFilter(e.target.value)}
              className="bg-white border border-brand-navy/10 rounded px-2.5 py-1.5 text-xs text-brand-navy focus:outline-none"
            >
              <option value="all">All Actor Types</option>
              {uniqueActorTypes.map(at => (
                <option key={at} value={at}>{at}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Result
            </label>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="bg-white border border-brand-navy/10 rounded px-2.5 py-1.5 text-xs text-brand-navy focus:outline-none"
            >
              <option value="all">All Results</option>
              {uniqueResults.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setActionFilter('all');
              setEntityFilter('all');
              setCategoryFilter('all');
              setActorTypeFilter('all');
              setResultFilter('all');
              setActorSearch('');
            }}
            className="px-3 py-1.5 bg-brand-navy/[0.04] hover:bg-brand-navy/[0.06] text-slate-400 hover:text-brand-navy rounded border border-brand-navy/10 cursor-pointer font-medium"
          >
            Reset
          </button>
        </div>

        {/* AUDIT LOG TABLE */}
        {loadingAudit ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading system write log pipeline...</div>
        ) : auditError ? (
          <div className="p-12 text-center text-xs text-rose-600 bg-rose-50 border border-rose-200/50 rounded-lg">
            ⚠ Error – Failed to fetch audit log trail. Please verify DB status and Admin session permissions.
          </div>
        ) : (
          <div className="overflow-x-auto bg-white border border-brand-navy/10 rounded-xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0b132b] border-b border-brand-navy/10 text-[10px] text-brand-gold uppercase tracking-wider font-semibold">
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Entity Mapped</th>
                  <th className="p-4">Actor ID</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4">Result</th>
                  <th className="p-4">Category · Actor Type</th>
                  <th className="p-4 text-right">Data Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-navy/[0.08]">
                {getFilteredLogs().length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                      No write audit records matched the filter query.
                    </td>
                  </tr>
                ) : (
                  getFilteredLogs().map((log) => (
                    <tr key={log.id} className="hover:bg-brand-navy/[0.04] transition duration-150">
                      <td className="p-4 text-brand-navy/70 font-mono whitespace-nowrap">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="p-4 font-mono font-bold text-brand-navy tracking-wider">
                        <span className="px-1.5 py-0.5 rounded bg-white text-brand-gold border border-brand-gold/10">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-brand-navy">{log.entityName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{log.entityId}</div>
                      </td>
                      <td className="p-4 font-mono text-slate-400">
                        {log.actorId || <span className="text-slate-500 italic text-[10px]">guest_user</span>}
                      </td>
                      <td className="p-4 font-mono text-slate-400">
                        {log.ipAddress || 'unknown'}
                      </td>
                      <td className="p-4">
                        {log.result ? (
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${getResultChipStyle(log.result)}`}>
                            {log.result}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic text-[9px]">n/a</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col items-start gap-1">
                          {log.category && (
                            <span className="px-1.5 py-0.5 rounded border border-brand-navy/10 bg-brand-navy/[0.06] text-brand-navy/70 text-[9px] font-semibold uppercase tracking-wider">
                              {log.category}
                            </span>
                          )}
                          {log.actorType && (
                            <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500 text-[9px] font-semibold uppercase tracking-wider">
                              {log.actorType}
                            </span>
                          )}
                          {!log.category && !log.actorType && (
                            <span className="text-slate-300 italic text-[9px]">n/a</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        {(log.beforeState || log.afterState) ? (
                          <button
                            onClick={() => setSelectedLogDetail(log)}
                            className="px-2 py-1 bg-brand-navy/[0.05] hover:bg-brand-navy/[0.06] border border-brand-navy/10 hover:border-brand-navy/15 text-brand-gold text-[10px] font-semibold rounded cursor-pointer transition"
                          >
                            Inspect State
                          </button>
                        ) : (
                          <span className="text-brand-navy/40 text-[10px] italic">No State Changes</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: STATE DIFF INSPECTOR */}
      {selectedLogDetail && (
        <div className="fixed inset-0 bg-brand-navy/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-brand-navy/10 rounded-xl shadow-2xl max-w-3xl w-full p-6 flex flex-col max-h-[85vh]">

            {/* Header */}
            <div className="flex justify-between items-start border-b border-brand-navy/10 pb-4 shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-brand-gold px-1.5 py-0.5 rounded bg-brand-navy/[0.05] border border-brand-gold/20">
                  {selectedLogDetail.action}
                </span>
                <h3 className="font-display font-bold text-brand-navy text-base mt-2">
                  Audit State Inspector
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">
                  Entity: <span className="text-brand-navy font-mono">{selectedLogDetail.entityName}</span> (ID: <span className="text-brand-navy font-mono">{selectedLogDetail.entityId}</span>) | Actor: <span className="text-brand-navy font-mono">{selectedLogDetail.actorId || 'guest_user'}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="text-slate-400 hover:text-brand-navy text-xl p-1 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content & State Comparison */}
            <div className="flex-1 overflow-y-auto py-6 space-y-6 min-h-0">

              {/* Visual State Diffs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">

                {/* Before State */}
                <div className="flex flex-col space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    - State Before Change
                  </div>
                  <div className="bg-brand-navy/[0.04] border border-brand-navy/10 rounded-lg p-4 font-mono text-[11px] overflow-x-auto overflow-y-auto max-h-80 text-rose-700">
                    {selectedLogDetail.beforeState ? (
                      (() => {
                        try {
                          const parsed = JSON.parse(selectedLogDetail.beforeState);
                          return <pre className="whitespace-pre">{JSON.stringify(parsed, null, 2)}</pre>;
                        } catch {
                          return <pre className="whitespace-pre">{selectedLogDetail.beforeState}</pre>;
                        }
                      })()
                    ) : (
                      <span className="italic text-slate-500">None (Creation Event)</span>
                    )}
                  </div>
                </div>

                {/* After State */}
                <div className="flex flex-col space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-emerald-700">
                    + State After Change
                  </div>
                  <div className="bg-brand-navy/[0.04] border border-brand-navy/10 rounded-lg p-4 font-mono text-[11px] overflow-x-auto overflow-y-auto max-h-80 text-emerald-700">
                    {selectedLogDetail.afterState ? (
                      (() => {
                        try {
                          const parsed = JSON.parse(selectedLogDetail.afterState);
                          return <pre className="whitespace-pre">{JSON.stringify(parsed, null, 2)}</pre>;
                        } catch {
                          return <pre className="whitespace-pre">{selectedLogDetail.afterState}</pre>;
                        }
                      })()
                    ) : (
                      <span className="italic text-slate-500">None (Deletion Event)</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Structured Field changes if both exist */}
              {selectedLogDetail.beforeState && selectedLogDetail.afterState && (
                <div className="bg-brand-navy/[0.04] border border-brand-navy/10 rounded-lg p-4 text-xs space-y-3">
                  <h4 className="text-[10px] uppercase font-bold text-brand-gold tracking-wider">
                    Detected Value Modifications
                  </h4>
                  <div className="space-y-2 font-mono text-[11px]">
                    {(() => {
                      try {
                        const beforeObj = JSON.parse(selectedLogDetail.beforeState);
                        const afterObj = JSON.parse(selectedLogDetail.afterState);
                        const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));

                        const changedFields: React.ReactNode[] = [];

                        allKeys.forEach(key => {
                          const valBefore = JSON.stringify(beforeObj[key]);
                          const valAfter = JSON.stringify(afterObj[key]);

                          if (valBefore !== valAfter) {
                            changedFields.push(
                              <div key={key} className="border-b border-brand-navy/10 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-slate-300 font-semibold">{key}</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 line-through max-w-[200px] truncate">
                                    {valBefore === undefined ? 'undefined' : valBefore}
                                  </span>
                                  <span className="text-slate-500">→</span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 max-w-[200px] truncate">
                                    {valAfter === undefined ? 'undefined' : valAfter}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                        });

                        return changedFields.length > 0 ? (
                          <div className="divide-y divide-brand-navy/[0.08]">{changedFields}</div>
                        ) : (
                          <div className="text-slate-500 italic">No direct property differences found (nested object similarity).</div>
                        );
                      } catch {
                        return <div className="text-slate-500 italic">Binary or unparseable state data. Unable to compute diff.</div>;
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-brand-navy/10 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="px-4 py-2 bg-brand-navy/[0.05] border border-brand-navy/10 hover:bg-brand-navy/[0.06] text-brand-navy/70 rounded font-semibold text-xs cursor-pointer"
              >
                Close Inspector
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}