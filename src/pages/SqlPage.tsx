import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Database,
  Table2,
  Copy,
  Download,
  Clock,
  History,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { sqlApi } from "@/services/api";

// ── Types ─────────────────────────────────────────────────────────────────────
type ColDef = { name: string; type: string };
type SchemaMap = Record<string, ColDef[]>;
type QueryResult = {
  columns: string[];
  rows: (string | null)[][];
  row_count: number;
  elapsed_ms: number;
  affected: number | null;
};

// ── Persistence keys ──────────────────────────────────────────────────────────
const HISTORY_KEY   = "sql_query_history";
const SIDEBAR_W_KEY = "sql_sidebar_width";
const EDITOR_H_KEY  = "sql_editor_height";
const MAX_HISTORY   = 20;

// ── History helpers ───────────────────────────────────────────────────────────
function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); }
  catch { return []; }
}
function saveHistory(sql: string) {
  const prev = loadHistory().filter((q) => q !== sql);
  const next = [sql, ...prev].slice(0, MAX_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
}

// ── Drag-to-resize utility ─────────────────────────────────────────────────────
function startDrag(
  e: React.MouseEvent,
  axis: "x" | "y",
  onDelta: (delta: number) => void,
) {
  e.preventDefault();
  let last = axis === "x" ? e.clientX : e.clientY;
  document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
  document.body.style.userSelect = "none";

  const move = (ev: MouseEvent) => {
    const cur = axis === "x" ? ev.clientX : ev.clientY;
    onDelta(cur - last);
    last = cur;
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

// ── CSV export ─────────────────────────────────────────────────────────────────
function exportCsv(columns: string[], rows: (string | null)[][]) {
  const esc = (v: string | null) => (v == null ? "" : `"${v.replace(/"/g, '""')}"`);
  const lines = [columns.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "query_result.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── Affected rows helper ───────────────────────────────────────────────────────
function fmtAffected(n: number | null): string {
  if (n == null) return "";
  if (n < 0)    return "rows affected: unknown";
  return `${n} row${n === 1 ? "" : "s"} affected`;
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const t = type.toLowerCase();
  const color =
    t.includes("int") || t.includes("numeric") || t.includes("float") || t.includes("double")
      ? "text-sky-600 dark:text-sky-400"
      : t.includes("bool")
      ? "text-violet-600 dark:text-violet-400"
      : t.includes("date") || t.includes("time")
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground/60";
  const short = type
    .replace("character varying", "varchar")
    .replace("timestamp without time zone", "timestamp")
    .replace("timestamp with time zone", "timestamptz");
  return <span className={`text-[9.5px] font-mono ${color} flex-shrink-0`}>{short}</span>;
}

// ── SchemaPanel ───────────────────────────────────────────────────────────────
function SchemaPanel({
  schema,
  loading,
  onClickTable,
}: {
  schema: SchemaMap | null;
  loading: boolean;
  onClickTable: (sql: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (table: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(table) ? next.delete(table) : next.add(table);
      return next;
    });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 flex-shrink-0">
        <Database className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[12px] font-semibold text-foreground">Schema</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
        {schema && !loading && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto font-mono">
            {Object.keys(schema).length} tables
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {loading ? (
          <div className="space-y-1 px-2 py-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-5 rounded bg-muted animate-pulse"
                style={{ width: `${55 + (i * 19) % 40}%` }}
              />
            ))}
          </div>
        ) : !schema ? null : (
          Object.entries(schema).map(([table, cols]) => {
            const open = expanded.has(table);
            return (
              <div key={table}>
                <button
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/60 transition-colors group text-left"
                  onClick={() => toggle(table)}
                >
                  {open
                    ? <ChevronDown className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
                    : <ChevronRight className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />}
                  <Table2 className="h-3 w-3 text-primary/80 flex-shrink-0" />
                  <span className="text-[12px] font-medium text-foreground truncate flex-1">{table}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClickTable(`SELECT * FROM ${table} LIMIT 100;`);
                    }}
                    title={`SELECT * FROM ${table} LIMIT 100`}
                    className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-foreground/70 hover:bg-primary/35 transition-all flex-shrink-0"
                  >
                    SELECT
                  </button>
                </button>
                {open && (
                  <div className="pl-7 pb-1">
                    {cols.map((col) => (
                      <div
                        key={col.name}
                        className="flex items-center gap-2 px-2 py-0.5 hover:bg-muted/40 rounded-md mx-1 cursor-default"
                      >
                        <span className="text-[11px] text-muted-foreground/80 truncate flex-1 font-mono">{col.name}</span>
                        <TypeBadge type={col.type} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── HistoryPanel ──────────────────────────────────────────────────────────────
function HistoryPanel({
  onSelect,
  onClose,
}: {
  onSelect: (sql: string) => void;
  onClose: () => void;
}) {
  const [history, setHistory] = useState(loadHistory);

  const clearAll = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  return (
    <div className="absolute right-0 top-full mt-1 z-50 w-[420px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary">
        <span className="text-[12px] font-semibold">Recent queries</span>
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <button
              onClick={clearAll}
              className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {history.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-8">No queries yet</p>
        ) : (
          history.map((q, i) => (
            <button
              key={i}
              onClick={() => { onSelect(q); onClose(); }}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
            >
              <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap break-all line-clamp-2 leading-relaxed">
                {q}
              </pre>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SqlPage() {
  const [sql, setSql] = useState("SELECT * FROM edicustomer LIMIT 50;");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [schema, setSchema] = useState<SchemaMap | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Resizable panel sizes (persisted) ──────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_W_KEY);
    return saved ? Number(saved) : 220;
  });
  const [editorHeight, setEditorHeight] = useState(() => {
    const saved = localStorage.getItem(EDITOR_H_KEY);
    return saved ? Number(saved) : 200;
  });

  // Persist sizes on change
  useEffect(() => {
    localStorage.setItem(SIDEBAR_W_KEY, String(sidebarWidth));
  }, [sidebarWidth]);
  useEffect(() => {
    localStorage.setItem(EDITOR_H_KEY, String(editorHeight));
  }, [editorHeight]);

  // ── Schema load ────────────────────────────────────────────────────────────
  useEffect(() => {
    sqlApi.tables()
      .then(({ data }) => setSchema(data.tables))
      .catch(() => setSchema({}))
      .finally(() => setSchemaLoading(false));
  }, []);

  // ── Run query ──────────────────────────────────────────────────────────────
  const runQuery = useCallback(async (querySql?: string) => {
    const q = (querySql ?? sql).trim();
    if (!q) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await sqlApi.query(q);
      setResult(data);
      saveHistory(q);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? "Query failed";
      setError(detail);
    } finally {
      setRunning(false);
    }
  }, [sql]);

  // ── Keyboard handling ──────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = sql.substring(0, start) + "  " + sql.substring(end);
      setSql(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
    }
  };

  const handleSelectFromSchema = (querySql: string) => {
    setSql(querySql);
    textareaRef.current?.focus();
    runQuery(querySql);
  };

  const copyResult = () => {
    if (!result) return;
    const lines = [
      result.columns.join("\t"),
      ...result.rows.map((r) => r.map((v) => v ?? "NULL").join("\t")),
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Derived display values ─────────────────────────────────────────────────
  const isDml = result != null && result.columns.length === 0 && !error;
  const isSelect = result != null && result.columns.length > 0;
  const affectedText = result ? fmtAffected(result.affected) : "";
  const rowsText = isSelect
    ? `${result!.row_count.toLocaleString()} row${result!.row_count === 1 ? "" : "s"} returned`
    : affectedText;

  const lineCount = sql.split("\n").length;

  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "calc(100vh - 57px)" }}
    >
      {/* ── Schema sidebar ─────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col bg-secondary border-r border-border overflow-hidden flex-shrink-0"
        style={{ width: sidebarWidth }}
      >
        <SchemaPanel schema={schema} loading={schemaLoading} onClickTable={handleSelectFromSchema} />
      </div>

      {/* Horizontal resize handle */}
      <div
        className="hidden lg:flex items-center justify-center w-2 flex-shrink-0 cursor-col-resize bg-border/30 hover:bg-primary/30 active:bg-primary/50 transition-colors group"
        onMouseDown={(e) =>
          startDrag(e, "x", (d) =>
            setSidebarWidth((w) => Math.min(480, Math.max(140, w + d)))
          )
        }
        title="Drag to resize"
      >
        <svg viewBox="0 0 6 24" className="h-5 w-1.5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" fill="currentColor">
          {[4,8,12,16,20].map(y => <circle key={y} cx="3" cy={y} r="1.2" />)}
        </svg>
      </div>

      {/* ── Main column ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary flex-shrink-0">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">SQL Console</span>
          <div className="flex-1" />

          {/* History */}
          <div className="relative">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
            {showHistory && (
              <HistoryPanel onSelect={setSql} onClose={() => setShowHistory(false)} />
            )}
          </div>

          {/* Run */}
          <button
            onClick={() => runQuery()}
            disabled={running || !sql.trim()}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/85 disabled:opacity-50 transition-colors"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run
            <span className="text-[10px] opacity-50 font-normal hidden sm:inline">Ctrl+↵</span>
          </button>
        </div>

        {/* SQL Editor — resizable height */}
        <div
          className="flex-shrink-0 border-b border-border bg-card relative overflow-hidden"
          style={{ height: editorHeight }}
        >
          {/* Line numbers */}
          <div className="absolute left-0 top-0 bottom-0 w-9 flex flex-col items-end pr-2 pt-3 select-none pointer-events-none overflow-hidden bg-card border-r border-border/40 z-10">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i} className="text-[11px] font-mono text-muted-foreground/30 leading-6">{i + 1}</span>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="absolute inset-0 w-full h-full resize-none bg-transparent focus:outline-none text-[13px] font-mono text-foreground leading-6 pl-11 pr-4 pt-3 pb-3 overflow-auto"
            placeholder="Enter SQL… (Ctrl+Enter to run)"
          />
        </div>

        {/* Vertical resize handle */}
        <div
          className="flex items-center justify-center h-2.5 flex-shrink-0 cursor-row-resize bg-border/30 hover:bg-primary/30 active:bg-primary/50 transition-colors group border-y border-border/40"
          onMouseDown={(e) =>
            startDrag(e, "y", (d) =>
              setEditorHeight((h) => Math.min(700, Math.max(80, h + d)))
            )
          }
          title="Drag to resize editor"
        >
          <svg viewBox="0 0 24 6" className="h-1.5 w-5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" fill="currentColor">
            {[4,8,12,16,20].map(x => <circle key={x} cx={x} cy="3" r="1.2" />)}
          </svg>
        </div>

        {/* Results area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Status bar — shown when there's a result or error */}
          {(result || error) && (
            <div className={`flex items-center gap-3 px-4 py-1.5 border-b border-border flex-shrink-0 text-[11.5px] font-mono ${
              error ? "bg-red-500/5" : "bg-secondary"
            }`}>
              {error ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                  <span className="text-red-400 font-medium">Error</span>
                </>
              ) : result ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">OK</span>
                  <span className="text-border select-none">|</span>
                  <span className="text-muted-foreground">{rowsText}</span>
                  <span className="text-border select-none">|</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {result.elapsed_ms}ms
                  </span>
                  {isSelect && (
                    <>
                      <div className="flex-1" />
                      <button
                        onClick={copyResult}
                        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copied ? <CheckCircle className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        {copied ? "Copied" : "Copy TSV"}
                      </button>
                      <button
                        onClick={() => exportCsv(result.columns, result.rows)}
                        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Download className="h-3 w-3" />
                        CSV
                      </button>
                    </>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex-1 p-4 overflow-auto">
              <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4">
                <pre className="text-[12.5px] font-mono text-red-500 whitespace-pre-wrap break-all leading-relaxed">
                  {error}
                </pre>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!running && !error && !result && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground/40 select-none">
              <Database className="h-10 w-10 opacity-20" />
              <div className="text-center">
                <p className="text-sm">Write a query and press Run</p>
                <p className="text-xs mt-1 font-mono opacity-70">Ctrl+Enter · Tab to indent</p>
              </div>
            </div>
          )}

          {/* Running skeleton */}
          {running && (
            <div className="flex-1 p-4 space-y-1.5">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex gap-2">
                  {[90, 55, 70, 40, 80].map((w, j) => (
                    <div
                      key={j}
                      className="h-6 rounded bg-muted animate-pulse"
                      style={{ width: w, animationDelay: `${i * 60 + j * 20}ms` }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* DML success (UPDATE / DELETE / INSERT) */}
          {!running && isDml && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 select-none">
              <CheckCircle className="h-9 w-9 text-emerald-500/50" />
              {result!.affected != null && result!.affected >= 0 ? (
                <>
                  <p className="text-base font-semibold text-foreground">
                    {result!.affected} row{result!.affected === 1 ? "" : "s"} affected
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Rows changed by the statement · {result!.elapsed_ms}ms
                  </p>
                </>
              ) : result!.affected === -1 ? (
                <>
                  <p className="text-sm font-medium text-foreground">Query executed successfully</p>
                  <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-400" />
                    Row count not reported by the database
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-foreground">Query executed successfully</p>
              )}
            </div>
          )}

          {/* SELECT results table */}
          {!running && isSelect && (
            <div className="flex-1 overflow-auto min-h-0">
              <table
                className="w-full border-collapse text-[12.5px]"
                style={{ minWidth: result!.columns.length * 120 }}
              >
                <thead>
                  <tr className="border-b border-border">
                    <th className="pl-4 pr-2 py-2 text-left w-10 bg-secondary sticky top-0 z-10">
                      <span className="text-[10px] font-mono text-muted-foreground/40">#</span>
                    </th>
                    {result!.columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary sticky top-0 z-10 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result!.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-b border-border/40 hover:bg-secondary/50 transition-colors"
                    >
                      <td className="pl-4 pr-2 py-2 text-[10px] font-mono text-muted-foreground/30 select-none">
                        {ri + 1}
                      </td>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 font-mono whitespace-nowrap max-w-xs overflow-hidden text-ellipsis">
                          {cell === null ? (
                            <span className="text-muted-foreground/30 italic text-[11px]">NULL</span>
                          ) : (
                            <span className="text-foreground/85">{cell}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>{/* /results area */}
      </div>{/* /main column */}
    </div>
  );
}
