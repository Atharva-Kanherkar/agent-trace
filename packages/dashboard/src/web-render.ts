import type { DashboardRenderOptions } from "./web-types";

export function renderDashboardHtml(options: DashboardRenderOptions = {}): string {
  const title = options.title ?? "agent-trace dashboard";
  const currentUserEmailJson = options.currentUserEmail !== undefined
    ? JSON.stringify(options.currentUserEmail)
    : "null";

  // The entire dashboard is a single HTML page with inline CSS + JS.
  // This faithfully replicates the Next.js dashboard-shell.tsx + globals.css.
  // Syntax highlighting via highlight.js CDN.
  // No escaped double-quotes in template — uses single-quotes in JS strings
  // to survive esbuild template-literal compilation.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
<style>
:root{--bg:#000;--panel:#0a0a0a;--panel-border:#1a1a1a;--panel-hover:#111;--panel-muted:#060606;--text-primary:#d4d4d4;--text-muted:#666;--text-dim:#444;--line:#1a1a1a;--green:#4ade80;--green-dim:rgba(74,222,128,.12);--orange:#fb923c;--orange-dim:rgba(251,146,60,.12);--red:#f87171;--red-dim:rgba(248,113,113,.12);--purple:#c084fc;--purple-dim:rgba(192,132,252,.1);--cyan:#22d3ee;--cyan-dim:rgba(34,211,238,.08);--yellow:#facc15}
*{box-sizing:border-box}
html,body{margin:0;padding:0;min-height:100vh;background:var(--bg);color:var(--text-primary);font-family:"SF Mono","JetBrains Mono","Fira Code",ui-monospace,monospace;font-size:13px;-webkit-font-smoothing:antialiased}
.shell{max-width:1400px;margin:0 auto;padding:20px 16px 40px}
.hero{border:1px solid var(--panel-border);border-radius:8px;padding:16px;background:var(--panel)}
.hero h1{margin:0;font-size:16px;font-weight:600;letter-spacing:-.02em}
.hero p{margin:4px 0 0;font-size:12px;color:var(--text-muted)}
.status-banner{margin-top:10px;padding:8px 10px;border-radius:6px;border:1px solid var(--line);background:var(--panel-muted);color:var(--text-muted);font-size:12px}
.status-banner.warning{border-color:rgba(250,204,21,.4);color:var(--yellow)}
.mg{margin-top:14px;display:grid;gap:8px;grid-template-columns:repeat(5,minmax(0,1fr))}
.mc{border:1px solid var(--panel-border);border-radius:8px;padding:10px 12px;background:var(--panel)}
.mc .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim)}
.mc .val{margin-top:6px;font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
.mc .det{font-size:10px;color:var(--text-dim);margin-top:2px}
.green{color:var(--green)}.cyan{color:var(--cyan)}.orange{color:var(--orange)}.red{color:var(--red)}.purple{color:var(--purple)}.yellow{color:var(--yellow)}
.sg{margin-top:14px;display:grid;gap:10px;grid-template-columns:1.2fr .8fr}
.panel{border:1px solid var(--panel-border);border-radius:8px;background:var(--panel);overflow:hidden}
.ph{padding:10px 12px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}
.ph h2{margin:0;font-size:13px;font-weight:600;letter-spacing:-.01em}
.ph p{margin:2px 0 0;font-size:11px;color:var(--text-dim)}
.pc{padding:8px}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid var(--line);text-align:left;padding:7px 8px;font-size:12px}
th{color:var(--text-dim);font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:500}
.srow{cursor:pointer}.srow:hover{background:var(--panel-hover)}.srow.active{background:var(--green-dim)}
.badge{display:inline-flex;align-items:center;border-radius:4px;padding:1px 6px;font-size:11px;border:1px solid var(--line);color:var(--text-muted);font-variant-numeric:tabular-nums}
.badge.green{border-color:rgba(74,222,128,.3);color:var(--green)}
.badge.orange{border-color:rgba(251,146,60,.3);color:var(--orange)}
.badge.red{border-color:rgba(248,113,113,.3);color:var(--red)}
.badge.purple{border-color:rgba(192,132,252,.3);color:var(--purple)}
.badge.cyan{border-color:rgba(34,211,238,.3);color:var(--cyan)}
.badge.dim{border-color:var(--line);color:var(--text-dim)}
.badge.commit{border-color:rgba(250,204,21,.3);color:var(--yellow)}
.ls{font-size:11px;font-variant-numeric:tabular-nums}
.ls.green{color:var(--green);margin-right:4px}.ls.red{color:var(--red)}
.repo-cell{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tm{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.tmi{border:1px solid var(--line);border-radius:6px;padding:4px 8px;font-size:11px;color:var(--text-muted)}
.chart{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;align-items:end;min-height:160px}
.chart-col{display:flex;flex-direction:column;align-items:stretch;justify-content:end;gap:4px}
.chart-bar{width:100%;border-radius:4px 4px 1px 1px;background:linear-gradient(180deg,var(--green),#166534);min-height:3px}
.chart-label{font-size:10px;color:var(--text-dim);text-align:center}
.chart-value{font-size:11px;color:var(--text-muted);text-align:center;font-variant-numeric:tabular-nums}
.empty{padding:12px;color:var(--text-dim);font-size:12px}
.pg{border:1px solid var(--panel-border);border-radius:8px;margin-bottom:8px;background:var(--panel-muted);overflow:hidden}
.pg.expanded{border-color:#222}
.pg-hd{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;cursor:pointer;user-select:none}
.pg-hd:hover{background:var(--panel-hover)}
.pg-idx{flex-shrink:0;width:28px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:var(--green-dim);color:var(--green);border:1px solid rgba(74,222,128,.2)}
.pg-txt{flex:1;min-width:0;font-size:13px;color:var(--text-primary);line-height:1.5;white-space:pre-wrap;word-break:break-word}
.pg-txt.trunc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pg-stats{flex-shrink:0;display:flex;gap:6px;align-items:center;font-size:11px;color:var(--text-dim);font-variant-numeric:tabular-nums}
.pg-arrow{flex-shrink:0;font-size:12px;color:var(--text-dim);transition:transform .15s}
.pg-arrow.open{transform:rotate(90deg)}
.pg-body{border-top:1px solid var(--line)}
.pg-full{padding:10px 12px;border-bottom:1px solid var(--line);background:rgba(74,222,128,.04)}
.pg-full-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:4px}
.pg-full-content{font-size:12px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto}
.erow{display:grid;grid-template-columns:18px 1fr auto;gap:8px;align-items:start;padding:6px 12px;border-bottom:1px solid var(--line);font-size:12px;min-height:32px}
.erow:last-child{border-bottom:none}
.eicon{width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;margin-top:1px}
.eicon.tool{background:var(--purple-dim);color:var(--purple);border:1px solid rgba(192,132,252,.2)}
.eicon.api{background:var(--cyan-dim);color:var(--cyan);border:1px solid rgba(34,211,238,.15)}
.eicon.error{background:var(--red-dim);color:var(--red);border:1px solid rgba(248,113,113,.2)}
.econtent{min-width:0}
.elabel{color:var(--text-primary);font-weight:500}
.edetail{margin-top:2px;color:var(--text-muted);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.emeta{display:flex;gap:6px;align-items:center;flex-shrink:0;font-size:11px;color:var(--text-dim);font-variant-numeric:tabular-nums}
.rblock{padding:10px 12px;border-top:1px solid var(--line);background:rgba(74,222,128,.03)}
.rblock-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:4px}
.rblock-text{font-size:12px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:400px;overflow-y:auto}
.tool-fp{display:inline-block;font-size:11px;color:var(--cyan);padding:1px 5px;border-radius:3px;background:var(--cyan-dim);margin-bottom:4px}
.tool-pat{display:inline-block;font-size:11px;color:var(--purple);padding:1px 5px;border-radius:3px;background:var(--purple-dim);margin-right:4px}
.cblock{border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-top:4px;margin-bottom:4px;background:#050505}
.cblock-hd{padding:3px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);background:#0d0d0d;border-bottom:1px solid var(--line)}
.cblock pre{margin:0;padding:8px 10px;font-size:11px;line-height:1.6;color:var(--text-primary);overflow-x:auto;max-height:300px;overflow-y:auto;white-space:pre;tab-size:2}
.cblock pre code{font-family:inherit}
.diff-block{border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-top:4px;margin-bottom:4px;background:#050505}
.diff-rm{display:flex;border-bottom:1px solid var(--line);background:rgba(248,113,113,.06)}
.diff-add{display:flex;background:rgba(74,222,128,.06)}
.diff-lbl{flex-shrink:0;width:24px;padding:6px 0;text-align:center;font-size:11px;font-weight:700;user-select:none}
.diff-rm .diff-lbl{color:var(--red)}.diff-add .diff-lbl{color:var(--green)}
.diff-rm pre,.diff-add pre{margin:0;padding:6px 8px;font-size:11px;line-height:1.5;color:var(--text-primary);overflow-x:auto;max-height:200px;overflow-y:auto;white-space:pre;tab-size:2;flex:1;min-width:0}
.fsummary{padding:8px 12px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:4px}
.fsg{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.fsg-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:1px 5px;border-radius:3px;font-weight:600}
.fsg-label.written{color:var(--green);background:var(--green-dim)}
.fsg-label.read{color:var(--text-muted);background:rgba(255,255,255,.04)}
.fsg-path{font-size:11px;color:var(--text-muted);padding:1px 5px;border-radius:3px;background:rgba(255,255,255,.03)}
.outcome{border:1px solid var(--panel-border);border-radius:6px;padding:10px 12px;margin-bottom:12px;background:var(--panel-muted)}
.outcome-hd{font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.outcome-row{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px}
.outcome-item{display:flex;align-items:center;gap:4px}
.outcome-lbl{font-size:11px;color:var(--text-dim)}
.outcome-val{font-size:12px;color:var(--text-primary)}
.outcome-commits{border-top:1px solid var(--panel-border);padding-top:6px;margin-top:4px}
.outcome-cr{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px}
.commit-sha{color:var(--yellow);font-weight:600;min-width:56px}
.commit-msg{color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.commit-pl{font-size:10px;color:var(--text-dim)}
.outcome-prs{border-top:1px solid var(--panel-border);padding-top:6px;margin-top:4px}
.outcome-pr{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px}
.pr-badge{font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600;text-transform:uppercase;border:1px solid rgba(74,222,128,.3);color:var(--green)}
.pr-badge.open{border-color:rgba(34,211,238,.3);color:var(--cyan)}
.pr-badge.merged{border-color:rgba(192,132,252,.3);color:var(--purple)}
.pr-badge.closed{border-color:rgba(248,113,113,.3);color:var(--red)}
.pr-badge.draft{border-color:rgba(102,102,102,.3);color:var(--text-muted)}
.pr-label{color:var(--cyan);font-weight:600}
.pr-repo{color:var(--text-muted)}
.pr-link{color:var(--text-dim);text-decoration:none;font-size:11px}
.pr-link:hover{color:var(--cyan);text-decoration:underline}
.settings-btn{position:absolute;right:16px;top:16px;background:var(--panel-muted);border:1px solid var(--panel-border);border-radius:6px;padding:6px 10px;cursor:pointer;color:var(--text-muted);font-size:12px;font-family:inherit;display:flex;align-items:center;gap:4px;transition:border-color .15s,color .15s}
.settings-btn:hover{border-color:var(--green);color:var(--green)}
.settings-btn svg{width:14px;height:14px}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;justify-content:center;align-items:center}
.modal-overlay.open{display:flex}
.modal{background:var(--panel);border:1px solid var(--panel-border);border-radius:10px;padding:20px;width:420px;max-width:90vw;position:relative}
.modal h3{margin:0 0 16px;font-size:14px;font-weight:600;color:var(--text-primary)}
.modal-close{position:absolute;right:12px;top:12px;background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}
.modal-close:hover{color:var(--text-primary);background:var(--panel-hover)}
.modal label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:4px;margin-top:12px}
.modal select,.modal input{width:100%;box-sizing:border-box;padding:8px 10px;background:var(--bg);border:1px solid var(--panel-border);border-radius:6px;color:var(--text-primary);font-size:12px;font-family:inherit}
.modal select:focus,.modal input:focus,.modal textarea:focus{outline:none;border-color:var(--green)}
.modal textarea{width:100%;box-sizing:border-box;padding:8px 10px;background:var(--bg);border:1px solid var(--panel-border);border-radius:6px;color:var(--text-primary);font-size:12px;font-family:inherit;resize:vertical;min-height:80px}
.modal-actions{margin-top:16px;display:flex;gap:8px;align-items:center}
.modal-save{padding:8px 16px;background:var(--green);color:#000;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
.modal-save:hover{opacity:.9}
.modal-save:disabled{opacity:.5;cursor:not-allowed}
.modal-status{font-size:11px;color:var(--text-muted);flex:1}
.modal-status.error{color:var(--red)}
.modal-status.ok{color:var(--green)}
.insight-panel{border:1px solid rgba(192,132,252,.2);border-radius:8px;padding:12px;margin-bottom:12px;background:rgba(192,132,252,.04)}
.insight-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.insight-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--purple)}
.insight-meta{font-size:10px;color:var(--text-dim)}
.insight-summary{font-size:12px;color:var(--text-primary);line-height:1.6;margin-bottom:8px}
.insight-section{margin-bottom:6px}
.insight-section-title{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-bottom:4px}
.insight-item{font-size:12px;color:var(--text-muted);line-height:1.5;padding:2px 0 2px 12px;position:relative}
.insight-item::before{content:'>';position:absolute;left:0;color:var(--purple)}
.insight-cost{font-size:11px;color:var(--orange);margin-top:4px}
.insight-gen-btn{padding:6px 14px;background:var(--purple-dim);color:var(--purple);border:1px solid rgba(192,132,252,.3);border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;transition:background .15s}
.insight-gen-btn:hover{background:rgba(192,132,252,.15)}
.insight-gen-btn:disabled{opacity:.5;cursor:not-allowed}
.insight-loading{font-size:12px;color:var(--text-muted);padding:8px 0}
.insight-error{font-size:12px;color:var(--red);padding:8px 0}
.pcommits{border:1px solid rgba(250,204,21,.15);border-radius:4px;padding:6px 8px;margin-bottom:8px;background:rgba(250,204,21,.04)}
.pcommit{display:flex;align-items:center;gap:8px;padding:2px 0;font-size:12px}
.hljs{background:transparent!important;color:var(--text-primary)}
.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-name{color:#c084fc}
.hljs-string,.hljs-attr{color:#4ade80}
.hljs-number,.hljs-literal{color:#fb923c}
.hljs-comment{color:#555;font-style:italic}
.hljs-type,.hljs-class .hljs-title,.hljs-title.class_{color:#22d3ee}
.hljs-function .hljs-title,.hljs-title.function_{color:#60a5fa}
.hljs-variable,.hljs-template-variable{color:#f87171}
.hljs-regexp{color:#fbbf24}
.hljs-meta{color:#666}
.hljs-punctuation{color:#888}
.hljs-property{color:#93c5fd}
.hljs-addition{color:#4ade80;background:rgba(74,222,128,.08)}
.hljs-deletion{color:#f87171;background:rgba(248,113,113,.08)}
.tab-bar{display:flex;gap:0;margin-top:10px;border-bottom:1px solid var(--line)}
.tab-btn{padding:6px 14px;font-size:12px;font-weight:600;color:var(--text-muted);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:inherit;letter-spacing:.02em;transition:color .15s,border-color .15s}
.tab-btn:hover{color:var(--text-primary)}
.tab-btn.active{color:var(--green);border-bottom-color:var(--green)}
.tab-content{display:none}.tab-content.active{display:block}
.team-mg{margin-top:14px;display:grid;gap:8px;grid-template-columns:repeat(5,minmax(0,1fr))}
.budget-bar{margin-top:12px;padding:10px 12px;border:1px solid var(--panel-border);border-radius:8px;background:var(--panel)}
.budget-track{height:8px;border-radius:4px;background:var(--panel-muted);margin-top:6px;overflow:hidden}
.budget-fill{height:100%;border-radius:4px;transition:width .3s}
.budget-fill.green{background:var(--green)}.budget-fill.orange{background:var(--orange)}.budget-fill.red{background:var(--red)}.budget-fill.pulse{animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.budget-label{font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center}
.budget-set-btn{padding:4px 10px;font-size:11px;background:var(--panel-muted);border:1px solid var(--panel-border);border-radius:4px;color:var(--text-muted);cursor:pointer;font-family:inherit}
.budget-set-btn:hover{border-color:var(--green);color:var(--green)}
.team-table{width:100%;border-collapse:collapse}
.team-table th,.team-table td{padding:7px 8px;font-size:12px;border-bottom:1px solid var(--line);text-align:left}
.team-table th{color:var(--text-dim);font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:500}
.team-row{cursor:pointer}.team-row:hover{background:var(--panel-hover)}
.time-range{display:flex;gap:4px;margin-left:auto}
.time-range-btn{padding:3px 8px;font-size:10px;background:var(--panel-muted);border:1px solid var(--panel-border);border-radius:4px;color:var(--text-muted);cursor:pointer;font-family:inherit}
.time-range-btn.active{border-color:var(--green);color:var(--green)}
.filter-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:12px;font-weight:600;border:1px solid rgba(74,222,128,.4);color:var(--green);border-radius:6px;margin-left:8px;cursor:pointer;background:var(--green-dim)}
.filter-chip:hover{background:rgba(74,222,128,.2)}
.back-team-link{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:11px;border:1px solid var(--line);color:var(--text-muted);border-radius:6px;margin-left:8px;cursor:pointer}
.back-team-link:hover{background:var(--panel-hover);color:var(--text-primary)}
.auth-gate{padding:40px 20px;text-align:center}
.auth-gate h2{font-size:16px;color:var(--text-primary);margin-bottom:8px}
.auth-gate p{font-size:12px;color:var(--text-muted);margin-bottom:16px}
.auth-gate input{width:300px;max-width:80vw;padding:8px 10px;background:var(--bg);border:1px solid var(--panel-border);border-radius:6px;color:var(--text-primary);font-size:12px;font-family:inherit}
.auth-gate input:focus{outline:none;border-color:var(--green)}
.auth-gate button{margin-top:8px;padding:8px 20px;background:var(--green);color:#000;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
.auth-gate .auth-error{color:var(--red);font-size:11px;margin-top:8px}
/* Insights tab styles */
.ins-grid{display:grid;gap:10px;grid-template-columns:1fr 1fr;margin-top:14px}
.ins-grid-3{display:grid;gap:10px;grid-template-columns:1fr 1fr 1fr;margin-top:14px}
.ins-full{grid-column:1/-1}
.ins-summary{margin-top:14px;display:grid;gap:8px;grid-template-columns:repeat(6,minmax(0,1fr))}
.ins-panel{border:1px solid var(--panel-border);border-radius:8px;background:var(--panel);overflow:hidden}
.ins-ph{padding:10px 12px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}
.ins-ph h3{margin:0;font-size:13px;font-weight:600;letter-spacing:-.01em}
.ins-ph p{margin:2px 0 0;font-size:11px;color:var(--text-dim)}
.ins-body{padding:12px}
.ins-loading{padding:40px 20px;text-align:center;color:var(--text-dim);font-size:12px}
.svg-chart{width:100%;overflow:visible}
.heatmap-grid{display:grid;grid-template-columns:28px repeat(24,1fr);gap:1px;font-size:9px}
.heatmap-cell{aspect-ratio:1;border-radius:2px;background:var(--panel-muted);transition:background .15s}
.heatmap-label{display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:9px}
.hbar-row{display:flex;align-items:center;gap:8px;padding:3px 0}
.hbar-label{flex-shrink:0;width:90px;font-size:11px;color:var(--text-muted);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hbar-track{flex:1;height:16px;background:var(--panel-muted);border-radius:3px;overflow:hidden}
.hbar-fill{height:100%;border-radius:3px;transition:width .3s}
.hbar-value{flex-shrink:0;width:52px;font-size:11px;color:var(--text-dim);font-variant-numeric:tabular-nums}
.member-card{border:1px solid var(--panel-border);border-radius:8px;background:var(--panel);overflow:hidden;margin-bottom:10px}
.member-card-hd{padding:10px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none}
.member-card-hd:hover{background:var(--panel-hover)}
.member-card-name{font-size:13px;font-weight:600;color:var(--text-primary)}
.member-card-email{font-size:10px;color:var(--text-dim)}
.member-card-stats{display:flex;gap:6px;font-size:11px}
.member-card-body{display:none;border-top:1px solid var(--line);padding:12px}
.member-card-body.open{display:block}
.member-card-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.member-card-metric{padding:8px;border:1px solid var(--panel-border);border-radius:6px;background:var(--panel-muted)}
.member-card-metric .m-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim)}
.member-card-metric .m-val{font-size:16px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}
.member-mini-chart{display:flex;align-items:end;gap:1px;height:40px}
.member-mini-bar{flex:1;border-radius:1px 1px 0 0;min-height:1px;transition:height .3s}
.donut-legend{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.donut-legend-item{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted)}
.donut-legend-swatch{width:10px;height:10px;border-radius:2px;flex-shrink:0}
.ins-score{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;border:3px solid;margin:0 auto 8px}
.ins-ai-panel{border:1px solid rgba(192,132,252,.2);border-radius:8px;padding:16px;background:rgba(192,132,252,.04);margin-top:14px}
.ins-ai-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.ins-ai-title{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--purple)}
.configure-analysis-btn{background:var(--panel-muted);border:1px solid var(--panel-border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-muted);font-size:11px;font-family:inherit;transition:border-color .15s,color .15s}
.configure-analysis-btn:hover{border-color:var(--purple);color:var(--purple)}
.context-indicator{font-size:10px;color:var(--text-dim);margin-left:8px}
.ins-ai-body{font-size:12px;color:var(--text-primary);line-height:1.7}
.ins-ai-section{margin-top:12px}
.ins-ai-section h4{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin:0 0 4px}
.ins-ai-item{font-size:12px;color:var(--text-muted);padding:2px 0 2px 14px;position:relative;line-height:1.6}
.ins-ai-item::before{content:'>';position:absolute;left:2px;color:var(--purple)}
.ins-forecast{border:1px solid rgba(251,146,60,.2);border-radius:8px;padding:12px;background:rgba(251,146,60,.04)}
.ins-forecast-val{font-size:24px;font-weight:700;color:var(--orange)}
.ins-forecast-label{font-size:11px;color:var(--text-dim);margin-top:2px}
@media(max-width:1200px){.mg{grid-template-columns:repeat(2,minmax(0,1fr))}.sg{grid-template-columns:1fr}.team-mg{grid-template-columns:repeat(2,minmax(0,1fr))}.ins-grid{grid-template-columns:1fr}.ins-grid-3{grid-template-columns:1fr}.ins-summary{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:760px){.shell{padding:12px 8px 24px}.mg{grid-template-columns:1fr}.team-mg{grid-template-columns:1fr}.ins-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.member-card-metrics{grid-template-columns:repeat(2,1fr)}th:nth-child(5),td:nth-child(5),th:nth-child(7),td:nth-child(7){display:none}.erow{grid-template-columns:18px 1fr}.emeta{grid-column:2}.pg-stats{display:none}}
</style>
</head>
<body>
<main class="shell">
<section class="hero" style="position:relative">
<h1>${title}</h1>
<p>session observability for coding agents</p>
<button class="settings-btn" onclick="openSettings()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 6 0Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>AI</button>
<div id="tab-bar" class="tab-bar" style="display:none">
<button class="tab-btn active" onclick="switchTab('sessions')">Sessions</button>
<button class="tab-btn" onclick="switchTab('team')" id="team-tab-btn">Team</button>
<button class="tab-btn" onclick="switchTab('insights')" id="insights-tab-btn">Insights</button>
</div>
<div id="status" class="status-banner">Connecting...</div>
</section>
<div id="auth-gate" class="auth-gate" style="display:none">
<h2>Authentication Required</h2>
<p>This team server requires an auth token.</p>
<input type="password" id="auth-token-input" placeholder="Enter team auth token..." onkeydown="if(event.key==='Enter')submitAuthToken()"/>
<br/>
<button onclick="submitAuthToken()">Authenticate</button>
<div class="auth-error" id="auth-error"></div>
</div>
<div id="settings-modal" class="modal-overlay" onclick="if(event.target===this)closeSettings()">
<div class="modal">
<button class="modal-close" onclick="closeSettings()">&times;</button>
<h3>AI Insights Settings</h3>
<p style="font-size:11px;color:var(--text-muted);margin:0 0 8px">Configure your own API key to generate AI-powered session insights.</p>
<label>Provider</label>
<select id="cfg-provider">
<option value="anthropic">Anthropic</option>
<option value="openai">OpenAI</option>
<option value="gemini">Gemini</option>
<option value="openrouter">OpenRouter</option>
</select>
<label>API Key</label>
<input type="password" id="cfg-apikey" placeholder="sk-..." autocomplete="off"/>
<label>Model (optional)</label>
<input type="text" id="cfg-model" placeholder="leave blank for default"/>
<div class="modal-actions">
<button class="modal-save" id="cfg-save" onclick="saveSettings()">Save</button>
<span class="modal-status" id="cfg-status"></span>
</div>
</div>
</div>
<div id="tab-sessions" class="tab-content active">
<section class="mg">
<article class="mc"><div class="label">Sessions</div><div class="val green" id="m-sessions">0</div></article>
<article class="mc"><div class="label">Total Cost</div><div class="val orange" id="m-cost">$0.00</div></article>
<article class="mc"><div class="label">Prompts</div><div class="val cyan" id="m-prompts">0</div></article>
<article class="mc"><div class="label">Tool Calls</div><div class="val" id="m-tools">0</div></article>
<article class="mc"><div class="label">Commits</div><div class="val green" id="m-commits">0</div><div class="det" id="m-commits-det"></div></article>
</section>
<section class="sg">
<section class="panel">
<header class="ph"><div><h2>My Sessions</h2><p id="stream-label">...</p></div></header>
<div class="pc"><div id="sessions-area" class="empty">Loading...</div></div>
</section>
<section class="panel">
<header class="ph"><div><h2>Daily Cost</h2><p>7-day spend</p></div></header>
<div class="pc"><div id="cost-chart" class="empty">Loading...</div></div>
</section>
</section>
<section class="panel" style="margin-top:10px">
<header class="ph"><div><h2>Session Replay</h2><p id="replay-label">select a session</p></div></header>
<div class="pc" id="replay-area"><div class="empty">No session selected.</div></div>
</section>
</div>
<div id="tab-team" class="tab-content">
<section class="team-mg">
<article class="mc"><div class="label">Members</div><div class="val cyan" id="tm-members">0</div></article>
<article class="mc"><div class="label">Total Cost</div><div class="val orange" id="tm-cost">$0.00</div></article>
<article class="mc"><div class="label">Sessions</div><div class="val green" id="tm-sessions">0</div></article>
<article class="mc"><div class="label">Commits</div><div class="val green" id="tm-commits">0</div></article>
<article class="mc"><div class="label">$/Commit</div><div class="val" id="tm-cpc">$0.00</div></article>
</section>
<div id="tm-budget-area" class="budget-bar" style="display:none">
<div class="budget-label"><span id="tm-budget-label">Budget</span><button class="budget-set-btn" onclick="openBudgetModal()">Set Budget</button></div>
<div class="budget-track"><div class="budget-fill green" id="tm-budget-fill" style="width:0%"></div></div>
</div>
<div id="tm-no-budget" style="margin-top:12px;text-align:right"><button class="budget-set-btn" onclick="openBudgetModal()">Set Budget</button></div>
<section class="sg" style="margin-top:14px">
<section class="panel">
<header class="ph"><div><h2>Team Members</h2><p id="tm-period-label"></p></div><div class="time-range" id="tm-time-range">
<button class="time-range-btn" onclick="setTeamRange('week')">This week</button>
<button class="time-range-btn" onclick="setTeamRange('month')">This month</button>
<button class="time-range-btn active" onclick="setTeamRange('30d')">Last 30 days</button>
</div></header>
<div class="pc"><div id="tm-members-area" class="empty">Loading...</div></div>
<div id="tm-member-sessions" style="display:none">
<header class="ph" style="border-top:1px solid var(--line)"><div><h2 id="tm-member-sessions-title">Sessions</h2><p id="tm-member-sessions-count"></p></div><div><button class="time-range-btn active" onclick="closeMemberSessions()">Back to Team</button></div></header>
<div class="pc"><div id="tm-member-sessions-area"></div></div>
</div>
</section>
<section class="panel">
<header class="ph"><div><h2>Daily Cost</h2><p>stacked by member</p></div></header>
<div class="pc"><div id="tm-cost-chart" class="empty">Loading...</div></div>
</section>
</section>
</div>
<div id="tab-insights" class="tab-content">
<section class="ins-summary">
<article class="mc"><div class="label">Avg $/Session</div><div class="val orange" id="ins-avg-cost">-</div></article>
<article class="mc"><div class="label">Avg Commits/Session</div><div class="val green" id="ins-avg-commits">-</div></article>
<article class="mc"><div class="label">$/Commit</div><div class="val cyan" id="ins-cost-commit">-</div></article>
<article class="mc"><div class="label">Total Tokens</div><div class="val purple" id="ins-tokens">-</div></article>
<article class="mc"><div class="label">Efficiency Score</div><div class="val green" id="ins-efficiency">-</div></article>
<article class="mc"><div class="label">Forecast (EOM)</div><div class="val orange" id="ins-forecast">-</div></article>
</section>
<div class="ins-grid" style="margin-top:14px">
<div class="ins-panel ins-full">
<div class="ins-ph"><div><h3>Cost Trend</h3><p>daily spend with cumulative overlay</p></div><div class="time-range" id="ins-time-range">
<button class="time-range-btn" onclick="setInsightsRange('week')">This week</button>
<button class="time-range-btn" onclick="setInsightsRange('month')">This month</button>
<button class="time-range-btn active" onclick="setInsightsRange('30d')">Last 30 days</button>
</div></div>
<div class="ins-body" id="ins-cost-trend"><div class="ins-loading">Loading analytics...</div></div>
</div>
</div>
<div class="ins-grid">
<div class="ins-panel">
<div class="ins-ph"><div><h3>Cost Distribution</h3><p>by team member</p></div></div>
<div class="ins-body" id="ins-donut-area"><div class="ins-loading">...</div></div>
</div>
<div class="ins-panel">
<div class="ins-ph"><div><h3>Activity Heatmap</h3><p>sessions by hour &amp; day of week</p></div></div>
<div class="ins-body" id="ins-heatmap-area"><div class="ins-loading">...</div></div>
</div>
</div>
<div class="ins-grid">
<div class="ins-panel">
<div class="ins-ph"><div><h3>Top Models</h3><p>AI models by cost</p></div></div>
<div class="ins-body" id="ins-models-area"><div class="ins-loading">...</div></div>
</div>
<div class="ins-panel">
<div class="ins-ph"><div><h3>Top Tools</h3><p>most used tools</p></div></div>
<div class="ins-body" id="ins-tools-area"><div class="ins-loading">...</div></div>
</div>
</div>
<div class="ins-panel" style="margin-top:14px">
<div class="ins-ph"><div><h3>Per-Member Analytics</h3><p>deep dive into each team member</p></div></div>
<div class="ins-body" id="ins-members-area"><div class="ins-loading">...</div></div>
</div>
<div class="ins-ai-panel" id="ins-ai-area">
<div class="ins-ai-header"><div class="ins-ai-title">AI Team Analysis</div><div><span class="context-indicator" id="context-indicator"></span><button class="configure-analysis-btn" onclick="openContextModal()">Configure Analysis</button></div></div>
<div id="ins-ai-content">
<p style="font-size:12px;color:var(--text-muted);margin:0 0 12px">Generate an AI-powered deep analysis of your team's performance, cost efficiency, and productivity patterns.</p>
<button class="insight-gen-btn" id="ins-ai-btn" onclick="generateTeamInsight()">Generate Team Analysis</button>
<div id="ins-ai-status" style="font-size:11px;color:var(--text-dim);margin-top:6px"></div>
</div>
</div>
</div>
<div id="budget-modal" class="modal-overlay" onclick="if(event.target===this)closeBudgetModal()">
<div class="modal">
<button class="modal-close" onclick="closeBudgetModal()">&times;</button>
<h3>Set Monthly Budget</h3>
<label>Monthly Limit (USD)</label>
<input type="number" id="budget-limit" placeholder="e.g. 3500" min="0" step="100"/>
<label>Alert Threshold (%)</label>
<input type="number" id="budget-threshold" value="80" min="0" max="100" step="5"/>
<div class="modal-actions">
<button class="modal-save" onclick="saveBudget()">Save Budget</button>
<span class="modal-status" id="budget-status"></span>
</div>
</div>
</div>
<div id="context-modal" class="modal-overlay" onclick="if(event.target===this)closeContextModal()">
<div class="modal" style="width:520px">
<button class="modal-close" onclick="closeContextModal()">&times;</button>
<h3>Configure Team Analysis</h3>
<label>Company Context</label>
<textarea id="context-company" rows="5" placeholder="Describe your company, team structure, project priorities, naming conventions..."></textarea>
<label>Analysis Guidelines</label>
<textarea id="context-guidelines" rows="5" placeholder="What should the AI focus on? What metrics matter most? Any specific thresholds or criteria for performance reviews?"></textarea>
<div class="modal-actions">
<button class="modal-save" id="context-save-btn" onclick="saveContext()">Save</button>
<span class="modal-status" id="context-status"></span>
</div>
</div>
</div>
</main>
<script>
(function(){
var DQ = String.fromCharCode(34);
var selectedId = null;
var sessions = [];
var costPoints = [];
var replay = null;
var insightsConfigured = false;
var insightsCache = {};
var teamData = null;
var teamRange = '30d';
var teamESource = null;
var authToken = localStorage.getItem('agent_trace_auth_token') || '';
var authRequired = false;
var currentTab = 'sessions';
var userIdFilter = null;
var currentUserEmail = ${currentUserEmailJson};
var teamMemberFilter = null;

function getAuthHeaders() {
  var h = {};
  if (authToken) h['Authorization'] = 'Bearer ' + authToken;
  return h;
}

function authFetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {}, getAuthHeaders());
  return fetch(url, opts);
}

function checkAuth() {
  return fetch('/api/auth/check', { headers: getAuthHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      authRequired = data.authRequired;
      if (authRequired && !data.authValid) {
        document.getElementById('auth-gate').style.display = 'block';
        document.getElementById('tab-sessions').classList.remove('active');
        return false;
      }
      document.getElementById('auth-gate').style.display = 'none';
      return true;
    })
    .catch(function() { return true; });
}

window.submitAuthToken = function() {
  var input = document.getElementById('auth-token-input');
  authToken = input.value.trim();
  localStorage.setItem('agent_trace_auth_token', authToken);
  document.getElementById('auth-error').textContent = '';
  checkAuth().then(function(ok) {
    if (!ok) {
      document.getElementById('auth-error').textContent = 'Invalid token. Please try again.';
    } else {
      document.getElementById('tab-sessions').classList.add('active');
      startStreaming();
    }
  });
};

window.switchTab = function(tab) {
  currentTab = tab;
  var btns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  if (tab === 'sessions') btns[0].classList.add('active');
  else if (tab === 'team') btns[1].classList.add('active');
  else if (tab === 'insights') btns[2].classList.add('active');
  document.getElementById('tab-sessions').classList.toggle('active', tab === 'sessions');
  document.getElementById('tab-team').classList.toggle('active', tab === 'team');
  document.getElementById('tab-insights').classList.toggle('active', tab === 'insights');
  if (tab === 'team' && !teamESource) startTeamStream();
  if (tab === 'insights') loadInsightsData();
};

function getTeamDateRange() {
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth();
  var from, to;
  if (teamRange === 'week') {
    var day = now.getDay();
    var monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    from = monday.toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  } else if (teamRange === 'month') {
    from = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    var lastDay = new Date(y, m + 1, 0).getDate();
    to = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
  } else {
    var d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    from = d30.toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  }
  return { from: from, to: to };
}

window.setTeamRange = function(range) {
  teamRange = range;
  var btns = document.querySelectorAll('.time-range-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  if (range === 'week') btns[0].classList.add('active');
  else if (range === 'month') btns[1].classList.add('active');
  else btns[2].classList.add('active');
  if (teamESource) { teamESource.close(); teamESource = null; }
  startTeamStream();
};

function startTeamStream() {
  var r = getTeamDateRange();
  var qs = '?from=' + r.from + '&to=' + r.to;
  teamESource = new EventSource('/api/team/stream' + qs);
  teamESource.addEventListener('team', function(e) {
    try { teamData = JSON.parse(e.data); renderTeam(); } catch(err) {}
  });
}

function fmtCost(v) { return '$' + (v||0).toFixed(2); }
function fmtNum(v) { return String(v||0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','); }

function timeAgo(isoStr) {
  if (!isoStr) return '';
  var diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

function renderTeam() {
  if (!teamData) return;
  var ov = teamData.overview || {};
  var mb = teamData.members || {};
  var cs = teamData.cost || {};
  var bg = teamData.budget || {};

  document.getElementById('tm-members').textContent = fmtNum(ov.memberCount);
  document.getElementById('tm-cost').textContent = fmtCost(ov.totalCostUsd);
  document.getElementById('tm-sessions').textContent = fmtNum(ov.totalSessions);
  document.getElementById('tm-commits').textContent = fmtNum(ov.totalCommits);
  document.getElementById('tm-cpc').textContent = fmtCost(ov.costPerCommit);

  // Show team tab if multiple members exist
  if (ov.memberCount > 1) {
    document.getElementById('tab-bar').style.display = 'flex';
  }

  // Budget bar
  if (bg.budget) {
    document.getElementById('tm-budget-area').style.display = 'block';
    document.getElementById('tm-no-budget').style.display = 'none';
    var pct = bg.percentUsed || 0;
    var fill = document.getElementById('tm-budget-fill');
    fill.style.width = Math.min(pct, 100) + '%';
    fill.className = 'budget-fill';
    if (pct > 100) { fill.classList.add('red', 'pulse'); }
    else if (pct > 80) { fill.classList.add('red'); }
    else if (pct > 60) { fill.classList.add('orange'); }
    else { fill.classList.add('green'); }
    document.getElementById('tm-budget-label').textContent = Math.round(pct) + '% of $' + bg.budget.monthlyLimitUsd.toLocaleString() + '/mo (' + fmtCost(bg.currentMonthSpend) + ' spent)';
  } else {
    document.getElementById('tm-budget-area').style.display = 'none';
    document.getElementById('tm-no-budget').style.display = 'block';
  }

  // Period label
  if (ov.period) {
    document.getElementById('tm-period-label').textContent = ov.period.from + ' to ' + ov.period.to;
  }

  // Members table
  var members = (mb.members || []);
  if (members.length === 0) {
    document.getElementById('tm-members-area').innerHTML = '<div class="empty">No team data yet.</div>';
  } else {
    var html = '<table class="team-table"><thead><tr><th>Member</th><th>Sessions</th><th>Cost</th><th>Commits</th><th>Lines</th><th>Last Active</th></tr></thead><tbody>';
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var name = m.displayName || m.userId;
      html += '<tr class="team-row" onclick="filterByMember(\\x27' + (m.userId||'').replace(/'/g,"\\\\'") + '\\x27)">';
      html += '<td><span style="color:var(--text-primary)">' + esc(name) + '</span>';
      if (m.displayName && m.userId !== m.displayName) html += '<br/><span style="font-size:10px;color:var(--text-dim)">' + esc(m.userId) + '</span>';
      html += '</td>';
      html += '<td>' + m.sessionCount + '</td>';
      html += '<td class="orange">' + fmtCost(m.totalCostUsd) + '</td>';
      html += '<td>' + m.commitCount + '</td>';
      html += '<td><span class="ls green">+' + fmtNum(m.linesAdded) + '</span><span class="ls red">-' + fmtNum(m.linesRemoved) + '</span></td>';
      html += '<td style="color:var(--text-dim)">' + timeAgo(m.lastActiveAt) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    document.getElementById('tm-members-area').innerHTML = html;
  }

  // Team daily cost chart (stacked)
  var points = (cs.points || []).slice(-7);
  if (points.length === 0) {
    document.getElementById('tm-cost-chart').innerHTML = '<div class="empty">No cost data.</div>';
  } else {
    var maxCost = 0;
    for (var i = 0; i < points.length; i++) {
      if (points[i].totalCostUsd > maxCost) maxCost = points[i].totalCostUsd;
    }
    var colors = ['var(--green)', 'var(--cyan)', 'var(--orange)', 'var(--purple)', 'var(--yellow)', 'var(--red)', 'var(--text-muted)'];
    var chartHtml = '<div class="chart">';
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var barH = maxCost > 0 ? Math.max(3, Math.round((p.totalCostUsd / maxCost) * 140)) : 3;
      chartHtml += '<div class="chart-col">';
      chartHtml += '<div class="chart-value">' + fmtCost(p.totalCostUsd) + '</div>';
      // Stacked bar segments
      var bm = p.byMember || [];
      if (bm.length <= 1) {
        chartHtml += '<div class="chart-bar" style="height:' + barH + 'px"></div>';
      } else {
        chartHtml += '<div style="display:flex;flex-direction:column-reverse;height:' + barH + 'px">';
        for (var j = 0; j < bm.length; j++) {
          var segH = maxCost > 0 ? Math.max(1, Math.round((bm[j].totalCostUsd / maxCost) * 140)) : 1;
          var col = colors[j % colors.length];
          chartHtml += '<div style="height:' + segH + 'px;background:' + col + ';min-height:1px;border-radius:1px"></div>';
        }
        chartHtml += '</div>';
      }
      chartHtml += '<div class="chart-label">' + p.date.slice(5) + '</div>';
      chartHtml += '</div>';
    }
    chartHtml += '</div>';
    document.getElementById('tm-cost-chart').innerHTML = chartHtml;
  }
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.filterByMember = function(userId) {
  teamMemberFilter = userId;
  renderMemberSessions();
};

window.clearFilter = function() {
  userIdFilter = null;
  renderSessions();
};

window.closeMemberSessions = function() {
  teamMemberFilter = null;
  document.getElementById('tm-member-sessions').style.display = 'none';
};

function renderMemberSessions() {
  if (!teamMemberFilter) return;
  var memberSessions = sessions.filter(function(s) { return s.userId === teamMemberFilter; });
  var memberName = teamMemberFilter;
  memberSessions.forEach(function(s) { if (s.userDisplayName) memberName = s.userDisplayName; });
  document.getElementById('tm-member-sessions-title').textContent = memberName + ' — Sessions';
  document.getElementById('tm-member-sessions-count').textContent = memberSessions.length + ' sessions';
  document.getElementById('tm-member-sessions').style.display = 'block';
  var area = document.getElementById('tm-member-sessions-area');
  if (memberSessions.length === 0) {
    area.innerHTML = '<div class="empty">No sessions for this member.</div>';
    return;
  }
  var h = '<table><thead><tr><th>Session</th><th>Repo</th><th>Started</th><th>Prompts</th><th>Cost</th><th>Commits</th><th>Lines</th></tr></thead><tbody>';
  memberSessions.forEach(function(s) {
    var repo = s.gitRepo ? (s.gitBranch ? s.gitRepo + '/' + s.gitBranch : s.gitRepo) : '-';
    var commits = s.commitCount > 0 ? '<span class="badge green">' + s.commitCount + '</span>' : '<span class="badge dim">0</span>';
    var lines = (s.linesAdded > 0 || s.linesRemoved > 0) ? '<span class="ls green">+' + s.linesAdded + '</span><span class="ls red">-' + s.linesRemoved + '</span>' : '<span style="color:var(--text-dim)">-</span>';
    h += '<tr class="srow" data-sid="' + esc(s.sessionId) + '" onclick="selectSession(this.dataset.sid);switchTab(\\x27sessions\\x27)"><td>' + esc(s.sessionId.slice(0,10)) + '</td><td class="repo-cell">' + esc(repo) + '</td><td>' + fmtDate(s.startedAt) + '</td><td>' + s.promptCount + '</td><td>' + fmt$(s.totalCostUsd) + '</td><td>' + commits + '</td><td>' + lines + '</td></tr>';
  });
  h += '</tbody></table>';
  area.innerHTML = h;
  document.getElementById('tm-member-sessions').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.openBudgetModal = function() {
  document.getElementById('budget-modal').classList.add('open');
  if (teamData && teamData.budget && teamData.budget.budget) {
    document.getElementById('budget-limit').value = teamData.budget.budget.monthlyLimitUsd;
    document.getElementById('budget-threshold').value = teamData.budget.budget.alertThresholdPercent;
  }
};

window.closeBudgetModal = function() {
  document.getElementById('budget-modal').classList.remove('open');
};

window.saveBudget = function() {
  var limit = parseFloat(document.getElementById('budget-limit').value);
  var threshold = parseFloat(document.getElementById('budget-threshold').value) || 80;
  if (isNaN(limit) || limit < 0) {
    document.getElementById('budget-status').textContent = 'Invalid limit';
    document.getElementById('budget-status').className = 'modal-status error';
    return;
  }
  document.getElementById('budget-status').textContent = 'Saving...';
  document.getElementById('budget-status').className = 'modal-status';
  authFetch('/api/team/budget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthlyLimitUsd: limit, alertThresholdPercent: threshold })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.status === 'ok') {
      document.getElementById('budget-status').textContent = 'Saved!';
      document.getElementById('budget-status').className = 'modal-status ok';
      setTimeout(closeBudgetModal, 800);
    } else {
      document.getElementById('budget-status').textContent = data.message || 'Error';
      document.getElementById('budget-status').className = 'modal-status error';
    }
  }).catch(function() {
    document.getElementById('budget-status').textContent = 'Network error';
    document.getElementById('budget-status').className = 'modal-status error';
  });
};

window.openSettings = function() {
  document.getElementById('settings-modal').classList.add('open');
  fetch('/api/settings/insights',{cache:'no-store'}).then(function(r){return r.json();}).then(function(data){
    if(data && data.configured){
      document.getElementById('cfg-provider').value = data.provider || 'anthropic';
      if(data.model) document.getElementById('cfg-model').value = data.model;
      document.getElementById('cfg-status').className = 'modal-status ok';
      document.getElementById('cfg-status').textContent = 'Configured (' + (data.provider||'') + ')';
      insightsConfigured = true;
    }
  }).catch(function(){});
};

window.closeSettings = function() {
  document.getElementById('settings-modal').classList.remove('open');
};

window.saveSettings = function() {
  var btn = document.getElementById('cfg-save');
  var status = document.getElementById('cfg-status');
  btn.disabled = true;
  status.className = 'modal-status';
  status.textContent = 'Validating...';
  var body = {
    provider: document.getElementById('cfg-provider').value,
    apiKey: document.getElementById('cfg-apikey').value,
    model: document.getElementById('cfg-model').value || undefined
  };
  fetch('/api/settings/insights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d};});})
  .then(function(res){
    btn.disabled = false;
    if(res.ok && res.data.status === 'ok'){
      status.className = 'modal-status ok';
      status.textContent = 'Saved! (' + (res.data.provider||'') + ' / ' + (res.data.model||'default') + ')';
      insightsConfigured = true;
      document.getElementById('cfg-apikey').value = '';
      if(replay) renderReplay();
    } else {
      status.className = 'modal-status error';
      status.textContent = res.data.message || 'Save failed';
    }
  }).catch(function(e){
    btn.disabled = false;
    status.className = 'modal-status error';
    status.textContent = String(e);
  });
};

window.generateInsight = function(sid) {
  var panel = document.getElementById('insight-panel');
  if(!panel) return;
  panel.innerHTML = '<div class="insight-loading">Generating insight...</div>';
  fetch('/api/session/' + encodeURIComponent(sid) + '/insights',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d};});})
  .then(function(res){
    if(res.ok && res.data.status === 'ok' && res.data.insight){
      insightsCache[sid] = res.data.insight;
      renderInsightContent(panel, res.data.insight);
    } else {
      panel.innerHTML = '<div class="insight-error">' + esc(res.data.message || 'Failed to generate insight') + '</div>';
    }
  }).catch(function(e){
    panel.innerHTML = '<div class="insight-error">' + esc(String(e)) + '</div>';
  });
};

function renderInsightContent(panel, insight) {
  var h = '<div class="insight-hd"><span class="insight-title">AI Insight</span><span class="insight-meta">' + esc(insight.provider||'') + ' / ' + esc(insight.model||'') + '</span></div>';
  h += '<div class="insight-summary">' + esc(insight.summary) + '</div>';
  if(insight.highlights && insight.highlights.length > 0){
    h += '<div class="insight-section"><div class="insight-section-title">Highlights</div>';
    insight.highlights.forEach(function(item){ h += '<div class="insight-item">' + esc(item) + '</div>'; });
    h += '</div>';
  }
  if(insight.suggestions && insight.suggestions.length > 0){
    h += '<div class="insight-section"><div class="insight-section-title">Suggestions</div>';
    insight.suggestions.forEach(function(item){ h += '<div class="insight-item">' + esc(item) + '</div>'; });
    h += '</div>';
  }
  if(insight.costNote) h += '<div class="insight-cost">' + esc(insight.costNote) + '</div>';
  panel.innerHTML = h;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(new RegExp(DQ,'g'),'&quot;');
}
function fmt$(v) { return '$' + v.toFixed(2); }
function fmt$4(v) { return '$' + v.toFixed(4); }
function ensureUtc(v) {
  if (v.endsWith('Z') || /[+-]\\d{2}:\\d{2}$/.test(v)) return v;
  return v.includes('T') ? v + 'Z' : v.replace(' ','T') + 'Z';
}
function fmtDate(v) { try { return new Date(ensureUtc(v)).toLocaleString(); } catch(e) { return v; } }
function fmtTime(v) { try { return new Date(ensureUtc(v)).toLocaleTimeString(); } catch(e) { return v; } }
function fmtDur(ms) { return ms < 1000 ? ms + 'ms' : (ms/1000).toFixed(1) + 's'; }

function readStr(r, k) { var v = r[k]; return typeof v === 'string' && v.length > 0 ? v : undefined; }
function readNum(r, k) { var v = r[k]; return typeof v === 'number' && isFinite(v) ? v : undefined; }
function readArr(r, k) { var v = r[k]; return Array.isArray(v) ? v : []; }
function asRec(v) { return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : undefined; }

var EXT_MAP = {ts:'typescript',tsx:'typescript',js:'javascript',jsx:'javascript',py:'python',rb:'ruby',go:'go',rs:'rust',java:'java',css:'css',html:'html',json:'json',yaml:'yaml',yml:'yaml',md:'markdown',sh:'bash',bash:'bash',sql:'sql',toml:'yaml'};
function guessLang(fp) { var e = (fp.split('.').pop()||'').toLowerCase(); return EXT_MAP[e] || e; }
function highlight(code, lang) {
  if (typeof hljs === 'undefined') return esc(code);
  try { var r = hljs.highlight(code, {language: lang || 'text', ignoreIllegals: true}); return r.value; } catch(e) { return esc(code); }
}

var READ_TOOLS = {Read:1,Glob:1,Grep:1,Search:1};
var WRITE_TOOLS = {Write:1,Edit:1,NotebookEdit:1};

function parseReplay(val) {
  var r = asRec(val); if (!r) return null;
  var sid = readStr(r,'sessionId'), sa = readStr(r,'startedAt'), m = asRec(r.metrics), tl = r.timeline;
  if (!sid || !sa || !m || !Array.isArray(tl)) return null;
  var envR = asRec(r.environment), gitR = asRec(r.git);
  var gitBranch = (envR ? readStr(envR,'gitBranch') : undefined) || readStr(r,'gitBranch');
  var cRaw = (gitR && Array.isArray(gitR.commits)) ? gitR.commits : Array.isArray(r.commits) ? r.commits : [];
  var commits = cRaw.map(function(e){var c=asRec(e);if(!c)return null;var sha=readStr(c,'sha');if(!sha||sha.indexOf('placeholder_')===0)return null;return{sha:sha,message:readStr(c,'message'),promptId:readStr(c,'promptId'),committedAt:readStr(c,'committedAt')};}).filter(Boolean);
  var pRaw = (gitR && Array.isArray(gitR.pullRequests)) ? gitR.pullRequests : Array.isArray(r.pullRequests) ? r.pullRequests : [];
  var prs = pRaw.map(function(e){var p=asRec(e);if(!p)return null;var repo=readStr(p,'repo'),n=readNum(p,'prNumber');if(!repo||n===undefined)return null;return{repo:repo,prNumber:n,state:readStr(p,'state')||'open',url:readStr(p,'url')};}).filter(Boolean);
  var timeline = tl.map(function(e){
    var ev=asRec(e);if(!ev)return null;
    var id=readStr(ev,'id'),type=readStr(ev,'type'),ts=readStr(ev,'timestamp');if(!id||!type||!ts)return null;
    var d=asRec(ev.details),tok=asRec(ev.tokens);
    return{id:id,type:type,timestamp:ts,promptId:readStr(ev,'promptId'),status:readStr(ev,'status'),costUsd:readNum(ev,'costUsd'),toolName:d?readStr(d,'toolName'):undefined,toolDurationMs:d?readNum(d,'toolDurationMs'):undefined,inputTokens:tok?readNum(tok,'input'):undefined,outputTokens:tok?readNum(tok,'output'):undefined,cacheReadTokens:tok?readNum(tok,'cacheRead'):undefined,cacheWriteTokens:tok?readNum(tok,'cacheWrite'):undefined,details:d};
  }).filter(Boolean);
  return{sessionId:sid,startedAt:sa,endedAt:readStr(r,'endedAt'),gitBranch:gitBranch,
    metrics:{promptCount:readNum(m,'promptCount')||0,toolCallCount:readNum(m,'toolCallCount')||0,totalCostUsd:readNum(m,'totalCostUsd')||0,totalInputTokens:readNum(m,'totalInputTokens')||0,totalOutputTokens:readNum(m,'totalOutputTokens')||0,totalCacheReadTokens:readNum(m,'totalCacheReadTokens')||0,totalCacheWriteTokens:readNum(m,'totalCacheWriteTokens')||0,linesAdded:readNum(m,'linesAdded')||0,linesRemoved:readNum(m,'linesRemoved')||0,modelsUsed:readArr(m,'modelsUsed').filter(function(x){return typeof x==='string'}),toolsUsed:readArr(m,'toolsUsed').filter(function(x){return typeof x==='string'}),filesTouched:readArr(m,'filesTouched').filter(function(x){return typeof x==='string'})},
    commits:commits,pullRequests:prs,timeline:timeline};
}

function extractToolDetail(ev) {
  var d = ev.details, tn = ev.toolName || ev.type;
  if (!d) return {toolName:tn};
  var rawTi = d.toolInput || d.tool_input, inp = asRec(rawTi), tiStr = typeof rawTi === 'string' ? rawTi : undefined;
  function rs(k) { return (d ? readStr(d,k) : undefined) || (inp ? readStr(inp,k) : undefined) || (tiStr ? extractFromTruncJson(tiStr,k) : undefined); }
  return {toolName:tn,filePath:rs('filePath')||rs('file_path'),command:rs('command')||rs('cmd'),pattern:rs('pattern'),oldString:(d?readStr(d,'oldString'):undefined)||(inp?readStr(inp,'old_string'):undefined),newString:(d?readStr(d,'newString'):undefined)||(inp?readStr(inp,'new_string'):undefined),writeContent:d?readStr(d,'writeContent'):undefined,description:rs('description')};
}

function extractFromTruncJson(raw, key) {
  var re = new RegExp(DQ + key + DQ + '\\\\s*:\\\\s*' + DQ + '([^' + DQ + ']*?)' + DQ);
  var m = re.exec(raw); return m && m[1] && m[1].length > 0 ? m[1] : undefined;
}

function renderToolDetail(ev) {
  var td = extractToolDetail(ev);
  if (td.toolName === 'Bash' && td.command) return '<div class="cblock"><div class="cblock-hd">bash</div><pre><code class="language-bash">' + highlight(td.command,'bash') + '</code></pre></div>';
  if (td.toolName === 'Edit' && td.filePath) {
    var h = '<div class="tool-fp">' + esc(td.filePath) + '</div>';
    if (td.oldString) {
      h += '<div class="diff-block"><div class="diff-rm"><div class="diff-lbl">-</div><pre><code>' + esc(td.oldString) + '</code></pre></div>';
      if (td.newString) h += '<div class="diff-add"><div class="diff-lbl">+</div><pre><code>' + esc(td.newString) + '</code></pre></div>';
      h += '</div>';
    }
    return h;
  }
  if ((td.toolName === 'Grep' || td.toolName === 'Glob') && td.pattern) {
    var h2 = '<span class="tool-pat">' + esc(td.toolName === 'Grep' ? '/' + td.pattern + '/' : td.pattern) + '</span>';
    if (td.filePath) h2 += ' <span class="tool-fp">' + esc(td.filePath) + '</span>';
    return h2;
  }
  if (td.toolName === 'Task' && td.description) return '<span class="edetail">' + esc(td.description) + '</span>';
  if (td.toolName === 'Write' && td.filePath) {
    var lang = guessLang(td.filePath);
    var h3 = '<div class="tool-fp">' + esc(td.filePath) + '</div>';
    if (td.writeContent) h3 += '<div class="cblock"><div class="cblock-hd">' + esc(lang) + '</div><pre><code class="language-' + esc(lang) + '">' + highlight(td.writeContent,lang) + '</code></pre></div>';
    return h3;
  }
  if (td.filePath) return '<div class="tool-fp">' + esc(td.filePath) + '</div>';
  if (td.command) return '<div class="cblock"><div class="cblock-hd">shell</div><pre><code class="language-bash">' + highlight(td.command,'bash') + '</code></pre></div>';
  return '';
}

function renderEventRow(ev) {
  var iconCls = ev.status === 'error' ? 'eicon error' : ev.toolName ? 'eicon tool' : 'eicon api';
  var iconChr = ev.status === 'error' ? '!' : ev.toolName ? 'T' : 'E';
  var meta = '';
  if (ev.toolDurationMs !== undefined) meta += '<span class="badge">' + fmtDur(ev.toolDurationMs) + '</span>';
  if (ev.costUsd !== undefined && ev.costUsd > 0) meta += '<span class="badge orange">' + fmt$4(ev.costUsd) + '</span>';
  if (ev.status) {
    var sc = ev.status === 'error' ? 'red' : (ev.status === 'ok' || ev.status === 'success') ? 'green' : '';
    meta += '<span class="badge ' + sc + '">' + esc(ev.status) + '</span>';
  }
  meta += '<span style="color:var(--text-dim)">' + fmtTime(ev.timestamp) + '</span>';
  return '<div class="erow"><div class="' + iconCls + '">' + iconChr + '</div><div class="econtent"><div class="elabel">' + esc(ev.toolName || ev.type) + '</div>' + renderToolDetail(ev) + '</div><div class="emeta">' + meta + '</div></div>';
}

function buildPromptGroups(timeline, commits) {
  var byPrompt = {};
  commits.forEach(function(c){ if(c.promptId){if(!byPrompt[c.promptId])byPrompt[c.promptId]=[];byPrompt[c.promptId].push(c);} });
  var order = [], map = {};
  timeline.forEach(function(ev){
    if(!ev.promptId) return;
    if(!map[ev.promptId]){order.push(ev.promptId);map[ev.promptId]=[];}
    map[ev.promptId].push(ev);
  });
  return order.map(function(pid){
    var evts = map[pid] || [], promptText, responseText, cost=0,tools=0,inTok=0,outTok=0,cacheRTok=0,cacheWTok=0,dur=0;
    var filesR={},filesW={},toolEvts=[];
    evts.forEach(function(ev){
      var d = ev.details;
      if(!promptText && d){var pt=readStr(d,'promptText');if(pt)promptText=pt;}
      if(ev.type==='assistant_response'||ev.type==='api_call'||ev.type==='api_response'){
        if(d){var rt=readStr(d,'responseText')||readStr(d,'lastAssistantMessage');if(rt)responseText=rt;}
      }
      cost+=(ev.costUsd||0);inTok+=(ev.inputTokens||0);outTok+=(ev.outputTokens||0);cacheRTok+=(ev.cacheReadTokens||0);cacheWTok+=(ev.cacheWriteTokens||0);
      if(ev.toolName||(ev.type==='tool_call'||ev.type==='tool_result')){
        toolEvts.push(ev);tools++;dur+=(ev.toolDurationMs||0);
        var dd=ev.details,rti=dd?(dd.toolInput||dd.tool_input):undefined,inp=asRec(rti),tiStr=typeof rti==='string'?rti:undefined;
        var fp=(dd?readStr(dd,'filePath'):undefined)||(inp?readStr(inp,'file_path'):undefined)||(tiStr?extractFromTruncJson(tiStr,'file_path'):undefined);
        if(fp){var tn=ev.toolName||'';if(WRITE_TOOLS[tn])filesW[fp]=1;else if(READ_TOOLS[tn])filesR[fp]=1;}
      }
    });
    // deduplicate tool events
    var deduped = [];
    toolEvts.forEach(function(ev){
      if(deduped.length>0){
        var prev=deduped[deduped.length-1];
        if(prev.toolName===ev.toolName){
          var pfp=prev.details?(readStr(prev.details,'filePath')||readStr(asRec(prev.details.toolInput)||{},'file_path')):undefined;
          var cfp=ev.details?(readStr(ev.details,'filePath')||readStr(asRec(ev.details.toolInput)||{},'file_path')):undefined;
          if(pfp&&pfp===cfp)return;
        }
      }
      deduped.push(ev);
    });
    return{promptId:pid,promptText:promptText,responseText:responseText,toolEvents:deduped,commits:byPrompt[pid]||[],totalCostUsd:cost,totalToolCalls:tools,totalInputTokens:inTok,totalOutputTokens:outTok,totalCacheReadTokens:cacheRTok,totalCacheWriteTokens:cacheWTok,totalDurationMs:dur,filesRead:Object.keys(filesR),filesWritten:Object.keys(filesW)};
  }).filter(function(g){return g.promptText||g.toolEvents.length>0||g.responseText;});
}

function parseTextSegments(text) {
  var segs = [], re = /\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({type:'text',content:text.slice(last,m.index)});
    segs.push({type:'code',lang:m[1]||'text',content:m[2]||''});
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({type:'text',content:text.slice(last)});
  return segs.length > 0 ? segs : [{type:'text',content:text}];
}

function renderFormattedText(text) {
  var segs = parseTextSegments(text);
  return segs.map(function(s){
    if(s.type==='code') return '<div class="cblock"><div class="cblock-hd">' + esc(s.lang) + '</div><pre><code class="language-' + esc(s.lang) + '">' + highlight(s.content,s.lang) + '</code></pre></div>';
    return '<span>' + esc(s.content) + '</span>';
  }).join('');
}

function renderPromptCard(g, idx) {
  var stats = '';
  if(g.commits.length>0) stats += '<span class="badge commit">' + (g.commits.length===1?esc(g.commits[0].sha.slice(0,7)):g.commits.length+' commits') + '</span>';
  if(g.totalToolCalls>0) stats += '<span class="badge purple">' + g.totalToolCalls + ' tools</span>';
  if(g.filesWritten.length>0) stats += '<span class="badge green">' + g.filesWritten.length + ' written</span>';
  if(g.filesRead.length>0) stats += '<span class="badge">' + g.filesRead.length + ' read</span>';
  if(g.totalCostUsd>0) stats += '<span class="badge orange">' + fmt$4(g.totalCostUsd) + '</span>';

  var body = '';
  if(g.commits.length>0){
    body += '<div class="pcommits">';
    g.commits.forEach(function(c){body += '<div class="pcommit"><span class="commit-sha">' + esc(c.sha.slice(0,7)) + '</span><span class="commit-msg">' + esc(c.message||'no message') + '</span></div>';});
    body += '</div>';
  }
  g.toolEvents.forEach(function(ev){body += renderEventRow(ev);});
  if(g.filesWritten.length>0||g.filesRead.length>0){
    body += '<div class="fsummary">';
    if(g.filesWritten.length>0){body += '<div class="fsg"><span class="fsg-label written">written</span>';g.filesWritten.forEach(function(f){body += '<span class="fsg-path">' + esc(f) + '</span>';});body += '</div>';}
    if(g.filesRead.length>0){body += '<div class="fsg"><span class="fsg-label read">read</span>';g.filesRead.forEach(function(f){body += '<span class="fsg-path">' + esc(f) + '</span>';});body += '</div>';}
    body += '</div>';
  }
  if(g.responseText) body += '<div class="rblock"><div class="rblock-label">Response</div><div class="rblock-text">' + renderFormattedText(g.responseText) + '</div></div>';

  return '<div class="pg" id="pg-' + esc(g.promptId.slice(0,12)) + '">' +
    '<div class="pg-hd" onclick="togglePrompt(this)">' +
    '<div class="pg-idx">' + idx + '</div>' +
    '<div class="pg-txt trunc">' + esc(g.promptText || 'prompt ' + g.promptId.slice(0,8)) + '</div>' +
    '<div class="pg-stats">' + stats + '</div>' +
    '<div class="pg-arrow">&gt;</div>' +
    '</div>' +
    '<div class="pg-body" style="display:none">' + body + '</div>' +
    '</div>';
}

window.togglePrompt = function(hd) {
  var pg = hd.parentElement;
  var body = pg.querySelector('.pg-body');
  var txt = pg.querySelector('.pg-txt');
  var arrow = pg.querySelector('.pg-arrow');
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  pg.classList.toggle('expanded', !open);
  txt.classList.toggle('trunc', open);
  arrow.classList.toggle('open', !open);
};

function renderSessions() {
  var area = document.getElementById('sessions-area');
  var label = document.getElementById('stream-label');
  var filtered = sessions;
  // Sessions tab always shows only the current user's sessions
  if (currentUserEmail) {
    filtered = sessions.filter(function(s) { return s.userId === currentUserEmail; });
    label.textContent = filtered.length + ' sessions (you)';
  }
  if (filtered.length === 0) { area.innerHTML = '<div class="empty">' + (currentUserEmail ? 'No sessions for you yet. Start a Claude Code session.' : 'No sessions captured yet.') + '</div>'; return; }
  var h = '<table><thead><tr><th>Session</th><th>Repo</th><th>Started</th><th>Prompts</th><th>Cost</th><th>Commits</th><th>Lines</th></tr></thead><tbody>';
  filtered.forEach(function(s){
    var active = s.sessionId === selectedId ? ' active' : '';
    var repo = s.gitRepo ? (s.gitBranch ? s.gitRepo + '/' + s.gitBranch : s.gitRepo) : '-';
    var commits = s.commitCount > 0 ? '<span class="badge green">' + s.commitCount + '</span>' : '<span class="badge dim">0</span>';
    var lines = (s.linesAdded > 0 || s.linesRemoved > 0) ? '<span class="ls green">+' + s.linesAdded + '</span><span class="ls red">-' + s.linesRemoved + '</span>' : '<span style="color:var(--text-dim)">-</span>';
    h += '<tr class="srow' + active + '" data-sid="' + esc(s.sessionId) + '" onclick="selectSession(this.dataset.sid)"><td>' + esc(s.sessionId.slice(0,10)) + '</td><td class="repo-cell">' + esc(repo) + '</td><td>' + fmtDate(s.startedAt) + '</td><td>' + s.promptCount + '</td><td>' + fmt$(s.totalCostUsd) + '</td><td>' + commits + '</td><td>' + lines + '</td></tr>';
  });
  h += '</tbody></table>';
  area.innerHTML = h;
}

function renderMetrics() {
  var my = currentUserEmail ? sessions.filter(function(s){return s.userId === currentUserEmail;}) : sessions;
  document.getElementById('m-sessions').textContent = my.length;
  document.getElementById('m-cost').textContent = fmt$(my.reduce(function(s,x){return s+x.totalCostUsd;},0));
  document.getElementById('m-prompts').textContent = my.reduce(function(s,x){return s+x.promptCount;},0);
  document.getElementById('m-tools').textContent = my.reduce(function(s,x){return s+x.toolCallCount;},0);
  var tc = my.reduce(function(s,x){return s+x.commitCount;},0);
  var sc = my.filter(function(x){return x.commitCount>0;}).length;
  document.getElementById('m-commits').textContent = tc;
  document.getElementById('m-commits-det').textContent = sc + '/' + my.length + ' sessions produced commits';
}

function renderCostChart() {
  var el = document.getElementById('cost-chart');
  if (costPoints.length === 0) { el.innerHTML = '<div class="empty">No cost data yet.</div>'; return; }
  var pts = costPoints.slice(-7);
  var max = Math.max(0.01, Math.max.apply(null, pts.map(function(p){return p.totalCostUsd;})));
  var h = '<div class="chart">';
  pts.forEach(function(p){
    var ht = Math.max(4, Math.round((p.totalCostUsd / max) * 140));
    h += '<div class="chart-col"><div class="chart-bar" style="height:' + ht + 'px"></div><div class="chart-value">' + fmt$(p.totalCostUsd) + '</div><div class="chart-label">' + esc(p.date.slice(5)) + '</div></div>';
  });
  h += '</div>';
  el.innerHTML = h;
}

function renderReplay() {
  var area = document.getElementById('replay-area');
  var label = document.getElementById('replay-label');
  if (!replay) {
    label.textContent = selectedId ? selectedId.slice(0,12) : 'select a session';
    area.innerHTML = '<div class="empty">No replay data.</div>';
    return;
  }
  label.textContent = replay.sessionId.slice(0,12) + ' \\u2014 ' + replay.metrics.promptCount + ' prompts, ' + fmt$(replay.metrics.totalCostUsd);
  var h = '';
  // meta
  h += '<div class="tm">';
  h += '<span class="tmi">Cost <span class="badge orange">' + fmt$4(replay.metrics.totalCostUsd) + '</span></span>';
  h += '<span class="tmi">Tokens <span class="badge cyan">' + replay.metrics.totalInputTokens + ' in / ' + replay.metrics.totalOutputTokens + ' out</span></span>';
  if (replay.metrics.totalCacheReadTokens > 0 || replay.metrics.totalCacheWriteTokens > 0) h += '<span class="tmi">Cache <span class="badge purple">' + replay.metrics.totalCacheReadTokens + ' read / ' + replay.metrics.totalCacheWriteTokens + ' write</span></span>';
  if (replay.metrics.linesAdded > 0 || replay.metrics.linesRemoved > 0) h += '<span class="tmi">Lines <span class="badge green">+' + replay.metrics.linesAdded + '</span> <span class="badge red">-' + replay.metrics.linesRemoved + '</span></span>';
  if (replay.metrics.modelsUsed.length > 0) h += '<span class="tmi">' + esc(replay.metrics.modelsUsed.join(', ')) + '</span>';
  if (replay.metrics.filesTouched.length > 0) h += '<span class="tmi">' + replay.metrics.filesTouched.length + ' files</span>';
  h += '</div>';
  // outcome
  if (replay.commits.length > 0 || replay.pullRequests.length > 0 || replay.gitBranch) {
    h += '<div class="outcome"><div class="outcome-hd">Outcome</div><div class="outcome-row">';
    if (replay.gitBranch) h += '<span class="outcome-item"><span class="outcome-lbl">branch</span><span class="outcome-val">' + esc(replay.gitBranch) + '</span></span>';
    if (replay.commits.length > 0) h += '<span class="outcome-item"><span class="outcome-lbl">' + (replay.commits.length===1?'commit':'commits') + '</span><span class="outcome-val">' + replay.commits.length + '</span></span>';
    if (replay.metrics.linesAdded > 0 || replay.metrics.linesRemoved > 0) h += '<span class="outcome-item"><span class="outcome-lbl">lines</span><span class="outcome-val"><span class="ls green">+' + replay.metrics.linesAdded + '</span><span class="ls red">-' + replay.metrics.linesRemoved + '</span></span></span>';
    if (replay.metrics.filesTouched.length > 0) h += '<span class="outcome-item"><span class="outcome-lbl">files</span><span class="outcome-val">' + replay.metrics.filesTouched.length + '</span></span>';
    h += '</div>';
    if (replay.commits.length > 0) {
      h += '<div class="outcome-commits">';
      replay.commits.forEach(function(c){ h += '<div class="outcome-cr"><span class="commit-sha">' + esc(c.sha.slice(0,7)) + '</span><span class="commit-msg">' + esc(c.message||'-') + '</span>' + (c.promptId ? '<span class="commit-pl">prompt ' + esc(c.promptId.slice(0,6)) + '</span>' : '') + '</div>'; });
      h += '</div>';
    }
    if (replay.pullRequests.length > 0) {
      h += '<div class="outcome-prs">';
      replay.pullRequests.forEach(function(pr){ h += '<div class="outcome-pr"><span class="pr-badge ' + esc(pr.state) + '">' + esc(pr.state) + '</span><span class="pr-label">PR #' + pr.prNumber + '</span><span class="pr-repo">' + esc(pr.repo) + '</span>' + (pr.url ? '<a class="pr-link" href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">' + esc(pr.url) + '</a>' : '') + '</div>'; });
      h += '</div>';
    }
    h += '</div>';
  }
  // AI insight panel
  h += '<div class="insight-panel" id="insight-panel">';
  var cachedInsight = insightsCache[replay.sessionId];
  if (cachedInsight) {
    // will be rendered after innerHTML set
  } else if (insightsConfigured) {
    h += '<div style="display:flex;align-items:center;justify-content:space-between"><span class="insight-title">AI Insight</span><button class="insight-gen-btn" data-sid="' + esc(replay.sessionId) + '">Generate Insight</button></div>';
  } else {
    h += '<div style="display:flex;align-items:center;justify-content:space-between"><span class="insight-title">AI Insight</span><span style="font-size:11px;color:var(--text-dim)">Configure an API key in settings to enable AI insights</span></div>';
  }
  h += '</div>';
  // prompt groups
  var groups = buildPromptGroups(replay.timeline, replay.commits);
  if (groups.length === 0) {
    h += '<div class="empty">No prompts in this session.</div>';
  } else {
    groups.forEach(function(g, i) { h += renderPromptCard(g, i + 1); });
  }
  area.innerHTML = h;
  if (cachedInsight) {
    var ip = document.getElementById('insight-panel');
    if (ip) renderInsightContent(ip, cachedInsight);
  }
  var genBtn = area.querySelector('.insight-gen-btn[data-sid]');
  if (genBtn) {
    genBtn.addEventListener('click', function() { generateInsight(genBtn.getAttribute('data-sid')); });
  }
}

function parseSummary(v) {
  var r = asRec(v); if (!r) return null;
  var sid = readStr(r,'sessionId'), uid = readStr(r,'userId'), sa = readStr(r,'startedAt');
  if (!sid || !uid || !sa) return null;
  return {sessionId:sid,userId:uid,gitRepo:typeof r.gitRepo==='string'?r.gitRepo:null,gitBranch:typeof r.gitBranch==='string'?r.gitBranch:null,startedAt:sa,endedAt:typeof r.endedAt==='string'?r.endedAt:null,promptCount:readNum(r,'promptCount')||0,toolCallCount:readNum(r,'toolCallCount')||0,totalCostUsd:readNum(r,'totalCostUsd')||0,commitCount:readNum(r,'commitCount')||0,linesAdded:readNum(r,'linesAdded')||0,linesRemoved:readNum(r,'linesRemoved')||0};
}

function parseCostPoint(v) {
  var r = asRec(v); if (!r) return null;
  var d = readStr(r,'date'); if (!d) return null;
  return {date:d,totalCostUsd:readNum(r,'totalCostUsd')||0,sessionCount:readNum(r,'sessionCount')||0,promptCount:readNum(r,'promptCount')||0,toolCallCount:readNum(r,'toolCallCount')||0};
}

function sortLatest(arr) { return arr.slice().sort(function(a,b){ return Date.parse(ensureUtc(b.startedAt)) - Date.parse(ensureUtc(a.startedAt)); }); }

function setSessions(raw) {
  sessions = sortLatest(raw.map(parseSummary).filter(Boolean));
  renderMetrics();
  renderSessions();
  if (teamMemberFilter) renderMemberSessions();
  var my = currentUserEmail ? sessions.filter(function(s){return s.userId === currentUserEmail;}) : sessions;
  if (my.length > 0 && (!selectedId || !my.some(function(s){return s.sessionId===selectedId;}))) {
    selectSession(my[0].sessionId);
  }
}

window.selectSession = function(sid) {
  selectedId = sid;
  renderSessions();
  loadReplay(sid);
};

function loadReplay(sid) {
  replay = null;
  renderReplay();
  fetch('/api/session/' + encodeURIComponent(sid), {cache:'no-store'}).then(function(r){
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('replay failed (' + r.status + ')');
    return r.json();
  }).then(function(payload){
    if (!payload) return;
    var p = asRec(payload);
    if (!p || readStr(p,'status') !== 'ok') return;
    replay = parseReplay(p.session);
    renderReplay();
  }).catch(function(e){ document.getElementById('replay-area').innerHTML = '<div class="empty" style="color:var(--red)">' + esc(String(e)) + '</div>'; });
}

function loadSnapshot() {
  return Promise.all([
    fetch('/api/sessions', {cache:'no-store'}),
    fetch('/api/analytics/cost/daily', {cache:'no-store'}).catch(function(){return null;})
  ]).then(function(results){
    var sr = results[0], cr = results[1];
    if (!sr.ok) throw new Error('sessions failed (' + sr.status + ')');
    return Promise.all([sr.json(), cr && cr.ok ? cr.json() : {points:[]}]);
  }).then(function(data){
    var sp = asRec(data[0]), cp = asRec(data[1]);
    if (sp && Array.isArray(sp.sessions)) setSessions(sp.sessions);
    if (cp && Array.isArray(cp.points)) { costPoints = cp.points.map(parseCostPoint).filter(Boolean); renderCostChart(); }
    document.getElementById('status').className = 'status-banner';
  }).catch(function(e){
    document.getElementById('status').className = 'status-banner warning';
    document.getElementById('status').textContent = String(e);
  });
}

function startStreaming() {
  fetch('/api/settings/insights',{cache:'no-store'}).then(function(r){return r.json();}).then(function(data){
    if(data && data.configured) insightsConfigured = true;
  }).catch(function(){});
  loadSnapshot().then(function(){
    if (typeof EventSource !== 'undefined') {
      var es = new EventSource('/api/sessions/stream');
      es.addEventListener('sessions', function(event) {
        var p = asRec(JSON.parse(event.data));
        if (p && Array.isArray(p.sessions)) {
          setSessions(p.sessions);
          document.getElementById('stream-label').textContent = 'live';
          document.getElementById('status').className = 'status-banner';
          document.getElementById('status').textContent = 'Live';
          // Auto-detect multi-user and show team tab
          var userIds = {};
          sessions.forEach(function(s){ if(s.userId && s.userId !== 'unknown_user') userIds[s.userId] = 1; });
          if (Object.keys(userIds).length > 1) {
            document.getElementById('tab-bar').style.display = 'flex';
          }
        }
      });
      es.addEventListener('bridge_error', function(event) {
        document.getElementById('status').className = 'status-banner warning';
        document.getElementById('status').textContent = 'Bridge error: ' + event.data;
      });
      es.onerror = function() {
        document.getElementById('stream-label').textContent = 'polling';
        document.getElementById('status').textContent = 'Polling';
      };
    } else {
      document.getElementById('stream-label').textContent = 'polling';
    }
    setInterval(function(){ loadSnapshot(); }, 15000);
  });
}

// ===== INSIGHTS TAB =====
var insightsData = null;
var insightsRange = '30d';
var insightsLoading = false;
var MEMBER_COLORS = ['#4ade80','#22d3ee','#fb923c','#c084fc','#facc15','#f87171','#60a5fa','#a78bfa','#34d399','#fbbf24'];

function getInsightsDateRange() {
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth();
  var from, to;
  if (insightsRange === 'week') {
    var day = now.getDay();
    var monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    from = monday.toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  } else if (insightsRange === 'month') {
    from = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    var lastDay = new Date(y, m + 1, 0).getDate();
    to = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
  } else {
    var d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    from = d30.toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  }
  return { from: from, to: to };
}

window.setInsightsRange = function(range) {
  insightsRange = range;
  var btns = document.querySelectorAll('#ins-time-range .time-range-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  if (range === 'week') btns[0].classList.add('active');
  else if (range === 'month') btns[1].classList.add('active');
  else btns[2].classList.add('active');
  insightsData = null;
  loadInsightsData();
};

function loadInsightsData() {
  if (insightsLoading) return;
  if (insightsData) { renderInsights(); return; }
  insightsLoading = true;
  var r = getInsightsDateRange();
  authFetch('/api/team/analytics?from=' + r.from + '&to=' + r.to)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      insightsLoading = false;
      if (data && data.status === 'ok') {
        insightsData = data;
        renderInsights();
      }
    })
    .catch(function() { insightsLoading = false; });
}

function renderInsights() {
  if (!insightsData) return;
  var d = insightsData;

  // Summary cards
  document.getElementById('ins-avg-cost').textContent = '$' + (d.avgCostPerSession || 0).toFixed(2);
  document.getElementById('ins-avg-commits').textContent = (d.avgCommitsPerSession || 0).toFixed(1);
  document.getElementById('ins-cost-commit').textContent = '$' + (d.avgCostPerCommit || 0).toFixed(2);
  document.getElementById('ins-tokens').textContent = formatLargeNum(d.totalTokensUsed || 0);
  document.getElementById('ins-efficiency').textContent = (d.costEfficiencyScore || 0) + '/100';

  // Forecast: linear extrapolation to end of month
  var forecast = computeForecast(d.costTrend || []);
  document.getElementById('ins-forecast').textContent = '$' + forecast.toFixed(0);

  renderCostTrendChart(d.costTrend || []);
  renderDonutChart(d.memberAnalytics || []);
  renderHeatmap(d.hourlyHeatmap || []);
  renderTopModels(d.topModels || []);
  renderTopTools(d.topTools || []);
  renderMemberCards(d.memberAnalytics || []);
}

function formatLargeNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function computeForecast(costTrend) {
  if (!costTrend || costTrend.length < 2) return 0;
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var dayOfMonth = now.getDate();
  var totalSoFar = 0;
  for (var i = 0; i < costTrend.length; i++) totalSoFar += costTrend[i].costUsd;
  if (dayOfMonth === 0) return totalSoFar;
  return (totalSoFar / dayOfMonth) * daysInMonth;
}

function renderCostTrendChart(trend) {
  var el = document.getElementById('ins-cost-trend');
  if (!trend || trend.length === 0) { el.innerHTML = '<div class="ins-loading">No cost data available.</div>'; return; }

  var W = 800, H = 200, PL = 50, PR = 50, PT = 20, PB = 30;
  var cw = W - PL - PR, ch = H - PT - PB;
  var maxDaily = 0.01, maxCum = 0.01;
  for (var i = 0; i < trend.length; i++) {
    if (trend[i].costUsd > maxDaily) maxDaily = trend[i].costUsd;
    if (trend[i].cumulativeCostUsd > maxCum) maxCum = trend[i].cumulativeCostUsd;
  }

  var svg = '<svg class="svg-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';

  // Grid lines
  for (var g = 0; g <= 4; g++) {
    var gy = PT + (ch / 4) * g;
    svg += '<line x1="' + PL + '" y1="' + gy + '" x2="' + (W - PR) + '" y2="' + gy + '" stroke="#1a1a1a" stroke-width="1"/>';
    var label = '$' + ((maxDaily * (4 - g) / 4)).toFixed(2);
    svg += '<text x="' + (PL - 4) + '" y="' + (gy + 3) + '" text-anchor="end" fill="#444" font-size="9" font-family="inherit">' + label + '</text>';
  }

  // Bars (daily cost)
  var barW = Math.max(4, (cw / trend.length) - 2);
  for (var i = 0; i < trend.length; i++) {
    var x = PL + (i / trend.length) * cw + 1;
    var barH = (trend[i].costUsd / maxDaily) * ch;
    var y = PT + ch - barH;
    svg += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH + '" rx="2" fill="rgba(74,222,128,0.3)"/>';
    // Date label every N bars
    if (trend.length <= 14 || i % Math.ceil(trend.length / 10) === 0) {
      svg += '<text x="' + (x + barW / 2) + '" y="' + (H - 4) + '" text-anchor="middle" fill="#444" font-size="8" font-family="inherit">' + trend[i].date.slice(5) + '</text>';
    }
  }

  // Cumulative line
  var linePts = '';
  var areaPts = '';
  for (var i = 0; i < trend.length; i++) {
    var lx = PL + (i / (trend.length - 1 || 1)) * cw;
    var ly = PT + ch - (trend[i].cumulativeCostUsd / maxCum) * ch;
    linePts += (i === 0 ? 'M' : 'L') + lx + ',' + ly;
    areaPts += (i === 0 ? 'M' : 'L') + lx + ',' + ly;
  }
  // Area fill
  areaPts += 'L' + (PL + cw) + ',' + (PT + ch) + 'L' + PL + ',' + (PT + ch) + 'Z';
  svg += '<defs><linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(34,211,238,0.15)"/><stop offset="100%" stop-color="rgba(34,211,238,0)"/></linearGradient></defs>';
  svg += '<path d="' + areaPts + '" fill="url(#cumGrad)"/>';
  svg += '<path d="' + linePts + '" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

  // Dots on cumulative line
  for (var i = 0; i < trend.length; i++) {
    var dx = PL + (i / (trend.length - 1 || 1)) * cw;
    var dy = PT + ch - (trend[i].cumulativeCostUsd / maxCum) * ch;
    svg += '<circle cx="' + dx + '" cy="' + dy + '" r="3" fill="#22d3ee" stroke="#000" stroke-width="1"/>';
  }

  // Right Y axis label for cumulative
  svg += '<text x="' + (W - 4) + '" y="' + (PT + 3) + '" text-anchor="end" fill="#22d3ee" font-size="9" font-family="inherit">$' + maxCum.toFixed(0) + ' total</text>';

  svg += '</svg>';
  svg += '<div style="display:flex;gap:16px;margin-top:4px;font-size:10px;color:var(--text-dim)">';
  svg += '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(74,222,128,0.3);border-radius:2px;vertical-align:middle;margin-right:3px"></span>Daily cost</span>';
  svg += '<span><span style="display:inline-block;width:10px;height:2px;background:#22d3ee;vertical-align:middle;margin-right:3px"></span>Cumulative</span>';
  svg += '</div>';
  el.innerHTML = svg;
}

function renderDonutChart(members) {
  var el = document.getElementById('ins-donut-area');
  if (!members || members.length === 0) { el.innerHTML = '<div class="ins-loading">No member data.</div>'; return; }

  var total = 0;
  for (var i = 0; i < members.length; i++) total += members[i].totalCostUsd;
  if (total <= 0) { el.innerHTML = '<div class="ins-loading">No cost data.</div>'; return; }

  var R = 70, r = 42, cx = 90, cy = 90;
  var svg = '<svg width="180" height="180" viewBox="0 0 180 180">';
  var startAngle = -Math.PI / 2;

  for (var i = 0; i < members.length; i++) {
    var pct = members[i].totalCostUsd / total;
    var endAngle = startAngle + pct * 2 * Math.PI;
    var largeArc = pct > 0.5 ? 1 : 0;
    var x1 = cx + R * Math.cos(startAngle);
    var y1 = cy + R * Math.sin(startAngle);
    var x2 = cx + R * Math.cos(endAngle);
    var y2 = cy + R * Math.sin(endAngle);
    var ix1 = cx + r * Math.cos(endAngle);
    var iy1 = cy + r * Math.sin(endAngle);
    var ix2 = cx + r * Math.cos(startAngle);
    var iy2 = cy + r * Math.sin(startAngle);
    var col = MEMBER_COLORS[i % MEMBER_COLORS.length];
    svg += '<path d="M' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + largeArc + ',1 ' + x2 + ',' + y2 + ' L' + ix1 + ',' + iy1 + ' A' + r + ',' + r + ' 0 ' + largeArc + ',0 ' + ix2 + ',' + iy2 + 'Z" fill="' + col + '" opacity="0.85"/>';
    startAngle = endAngle;
  }

  // Center label
  svg += '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" fill="#d4d4d4" font-size="16" font-weight="700" font-family="inherit">$' + total.toFixed(0) + '</text>';
  svg += '<text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" fill="#666" font-size="9" font-family="inherit">total</text>';
  svg += '</svg>';

  // Legend
  var legend = '<div class="donut-legend">';
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    var pctLabel = ((m.totalCostUsd / total) * 100).toFixed(0);
    legend += '<div class="donut-legend-item"><div class="donut-legend-swatch" style="background:' + MEMBER_COLORS[i % MEMBER_COLORS.length] + '"></div>' + esc(m.displayName || m.userId) + ' (' + pctLabel + '%, $' + m.totalCostUsd.toFixed(2) + ')</div>';
  }
  legend += '</div>';
  el.innerHTML = '<div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap"><div>' + svg + '</div><div style="flex:1;min-width:160px">' + legend + '</div></div>';
}

function renderHeatmap(heatmap) {
  var el = document.getElementById('ins-heatmap-area');
  if (!heatmap || heatmap.length === 0) { el.innerHTML = '<div class="ins-loading">No activity data.</div>'; return; }

  var maxCount = 1;
  for (var i = 0; i < heatmap.length; i++) {
    if (heatmap[i].count > maxCount) maxCount = heatmap[i].count;
  }

  var dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var grid = {};
  for (var i = 0; i < heatmap.length; i++) {
    grid[heatmap[i].day + '-' + heatmap[i].hour] = heatmap[i].count;
  }

  var h = '<div class="heatmap-grid">';
  // Header row
  h += '<div class="heatmap-label"></div>';
  for (var hr = 0; hr < 24; hr++) {
    h += '<div class="heatmap-label">' + (hr % 3 === 0 ? hr + 'h' : '') + '</div>';
  }
  // Data rows
  for (var d = 1; d <= 7; d++) {
    var dayIdx = d % 7; // Mon=1 -> dayIdx=1, Sun=0 -> dayIdx=0
    h += '<div class="heatmap-label">' + dayLabels[dayIdx] + '</div>';
    for (var hr = 0; hr < 24; hr++) {
      var count = grid[dayIdx + '-' + hr] || 0;
      var intensity = count / maxCount;
      var bg;
      if (count === 0) bg = 'var(--panel-muted)';
      else if (intensity < 0.25) bg = 'rgba(74,222,128,0.15)';
      else if (intensity < 0.5) bg = 'rgba(74,222,128,0.3)';
      else if (intensity < 0.75) bg = 'rgba(74,222,128,0.55)';
      else bg = 'rgba(74,222,128,0.8)';
      h += '<div class="heatmap-cell" style="background:' + bg + '" title="' + dayLabels[dayIdx] + ' ' + hr + ':00 - ' + count + ' sessions"></div>';
    }
  }
  h += '</div>';
  h += '<div style="display:flex;align-items:center;gap:4px;margin-top:6px;font-size:9px;color:var(--text-dim)"><span>Less</span>';
  h += '<div style="width:10px;height:10px;background:var(--panel-muted);border-radius:2px"></div>';
  h += '<div style="width:10px;height:10px;background:rgba(74,222,128,0.15);border-radius:2px"></div>';
  h += '<div style="width:10px;height:10px;background:rgba(74,222,128,0.3);border-radius:2px"></div>';
  h += '<div style="width:10px;height:10px;background:rgba(74,222,128,0.55);border-radius:2px"></div>';
  h += '<div style="width:10px;height:10px;background:rgba(74,222,128,0.8);border-radius:2px"></div>';
  h += '<span>More</span></div>';
  el.innerHTML = h;
}

function renderTopModels(models) {
  var el = document.getElementById('ins-models-area');
  if (!models || models.length === 0) { el.innerHTML = '<div class="ins-loading">No model data.</div>'; return; }

  var maxCost = 0.01;
  for (var i = 0; i < models.length; i++) {
    if (models[i].totalCostUsd > maxCost) maxCost = models[i].totalCostUsd;
  }

  var h = '';
  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var pct = (m.totalCostUsd / maxCost) * 100;
    var col = MEMBER_COLORS[i % MEMBER_COLORS.length];
    h += '<div class="hbar-row">';
    h += '<div class="hbar-label" title="' + esc(m.model) + '">' + esc((m.model.indexOf('/') >= 0 ? m.model.split('/').pop() : m.model)) + '</div>';
    h += '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:' + col + '"></div></div>';
    h += '<div class="hbar-value">$' + m.totalCostUsd.toFixed(2) + '</div>';
    h += '</div>';
  }
  el.innerHTML = h;
}

function renderTopTools(tools) {
  var el = document.getElementById('ins-tools-area');
  if (!tools || tools.length === 0) { el.innerHTML = '<div class="ins-loading">No tool data.</div>'; return; }

  var maxCalls = 1;
  for (var i = 0; i < tools.length; i++) {
    if (tools[i].callCount > maxCalls) maxCalls = tools[i].callCount;
  }

  var h = '';
  var shown = tools.slice(0, 10);
  for (var i = 0; i < shown.length; i++) {
    var t = shown[i];
    var pct = (t.callCount / maxCalls) * 100;
    var col = MEMBER_COLORS[i % MEMBER_COLORS.length];
    h += '<div class="hbar-row">';
    h += '<div class="hbar-label">' + esc(t.tool) + '</div>';
    h += '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:' + col + '"></div></div>';
    h += '<div class="hbar-value">' + fmtNum(t.callCount) + '</div>';
    h += '</div>';
  }
  el.innerHTML = h;
}

function renderMemberCards(members) {
  var el = document.getElementById('ins-members-area');
  if (!members || members.length === 0) { el.innerHTML = '<div class="ins-loading">No member data.</div>'; return; }

  var h = '';
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    var col = MEMBER_COLORS[i % MEMBER_COLORS.length];
    var name = m.displayName || m.userId;
    h += '<div class="member-card">';
    h += '<div class="member-card-hd" onclick="toggleMemberCard(this)">';
    h += '<div><div class="member-card-name" style="color:' + col + '">' + esc(name) + '</div>';
    if (m.displayName && m.userId !== m.displayName) h += '<div class="member-card-email">' + esc(m.userId) + '</div>';
    h += '</div>';
    h += '<div class="member-card-stats">';
    h += '<span class="badge orange">' + fmtCost(m.totalCostUsd) + '</span>';
    h += '<span class="badge green">' + m.sessionCount + ' sessions</span>';
    h += '<span class="badge">' + m.commitCount + ' commits</span>';
    h += '</div>';
    h += '</div>';
    h += '<div class="member-card-body" id="mc-body-' + i + '">';

    // Metrics grid
    h += '<div class="member-card-metrics">';
    h += '<div class="member-card-metric"><div class="m-label">Avg $/Session</div><div class="m-val orange">$' + (m.avgSessionCostUsd || 0).toFixed(2) + '</div></div>';
    h += '<div class="member-card-metric"><div class="m-label">$/Commit</div><div class="m-val cyan">$' + (m.costPerCommit || 0).toFixed(2) + '</div></div>';
    h += '<div class="member-card-metric"><div class="m-label">Lines Changed</div><div class="m-val"><span class="green">+' + fmtNum(m.linesAdded) + '</span> <span class="red">-' + fmtNum(m.linesRemoved) + '</span></div></div>';
    h += '<div class="member-card-metric"><div class="m-label">Pull Requests</div><div class="m-val purple">' + m.prCount + '</div></div>';
    h += '</div>';

    // Tokens
    h += '<div style="margin-bottom:12px;font-size:11px;color:var(--text-dim)">';
    h += '<span style="margin-right:12px">Input tokens: <span class="cyan">' + formatLargeNum(m.totalInputTokens) + '</span></span>';
    h += '<span>Output tokens: <span class="cyan">' + formatLargeNum(m.totalOutputTokens) + '</span></span>';
    h += '</div>';

    // Models used
    if (m.models && m.models.length > 0) {
      h += '<div style="margin-bottom:10px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:4px">Models</div>';
      for (var j = 0; j < m.models.length; j++) {
        var mdl = m.models[j];
        h += '<div class="hbar-row"><div class="hbar-label" style="width:120px">' + esc((mdl.model.indexOf('/') >= 0 ? mdl.model.split('/').pop() : mdl.model)) + '</div>';
        var modelMax = m.models[0].totalCostUsd || 0.01;
        h += '<div class="hbar-track"><div class="hbar-fill" style="width:' + ((mdl.totalCostUsd / modelMax) * 100) + '%;background:' + col + '"></div></div>';
        h += '<div class="hbar-value">$' + mdl.totalCostUsd.toFixed(2) + '</div></div>';
      }
      h += '</div>';
    }

    // Repos
    if (m.repos && m.repos.length > 0) {
      h += '<div style="margin-bottom:10px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:4px">Repositories</div>';
      for (var j = 0; j < m.repos.length; j++) {
        var rp = m.repos[j];
        h += '<div style="display:flex;align-items:center;gap:8px;padding:2px 0;font-size:11px">';
        h += '<span style="color:var(--text-primary)">' + esc(rp.repo) + '</span>';
        h += '<span class="badge">' + rp.sessionCount + ' sessions</span>';
        h += '<span class="badge green">' + rp.commitCount + ' commits</span>';
        h += '</div>';
      }
      h += '</div>';
    }

    // Activity mini-charts (hourly)
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    // Hourly
    h += '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:4px">Hourly Activity</div>';
    h += '<div class="member-mini-chart">';
    var maxHour = 1;
    if (m.hourlyActivity) { for (var hr = 0; hr < 24; hr++) { if (m.hourlyActivity[hr] > maxHour) maxHour = m.hourlyActivity[hr]; } }
    for (var hr = 0; hr < 24; hr++) {
      var val = (m.hourlyActivity && m.hourlyActivity[hr]) || 0;
      var barH = val > 0 ? Math.max(2, Math.round((val / maxHour) * 36)) : 1;
      h += '<div class="member-mini-bar" style="height:' + barH + 'px;background:' + (val > 0 ? col : 'var(--panel-muted)') + '"></div>';
    }
    h += '</div><div style="display:flex;justify-content:space-between;font-size:8px;color:var(--text-dim);margin-top:2px"><span>0h</span><span>12h</span><span>23h</span></div>';
    h += '</div>';

    // Daily
    h += '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:4px">Daily Activity</div>';
    h += '<div class="member-mini-chart" style="gap:3px">';
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var maxDay = 1;
    if (m.dailyActivity) { for (var dd = 0; dd < 7; dd++) { if (m.dailyActivity[dd] > maxDay) maxDay = m.dailyActivity[dd]; } }
    for (var dd = 0; dd < 7; dd++) {
      var val = (m.dailyActivity && m.dailyActivity[dd]) || 0;
      var barH = val > 0 ? Math.max(2, Math.round((val / maxDay) * 36)) : 1;
      h += '<div style="display:flex;flex-direction:column;align-items:center;flex:1"><div class="member-mini-bar" style="height:' + barH + 'px;background:' + (val > 0 ? col : 'var(--panel-muted)') + ';width:100%"></div><div style="font-size:8px;color:var(--text-dim);margin-top:2px">' + dayNames[dd].charAt(0) + '</div></div>';
    }
    h += '</div>';
    h += '</div>';
    h += '</div>';

    h += '</div>'; // member-card-body
    h += '</div>'; // member-card
  }
  el.innerHTML = h;
}

window.toggleMemberCard = function(hd) {
  var body = hd.nextElementSibling;
  body.classList.toggle('open');
};

// ===== AI TEAM INSIGHTS =====
var teamInsightData = null;

window.generateTeamInsight = function(force) {
  var btn = document.getElementById('ins-ai-btn');
  var status = document.getElementById('ins-ai-status');
  var content = document.getElementById('ins-ai-content');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  if (status) {
    status.textContent = 'Sending team data to AI provider. This may take 15-30 seconds...';
    status.style.color = 'var(--text-dim)';
  }

  var r = getInsightsDateRange();
  var forceQs = force ? '&force=true' : '';
  authFetch('/api/team/insights/generate?from=' + r.from + '&to=' + r.to + forceQs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
  .then(function(res) {
    btn.disabled = false;
    btn.textContent = 'Regenerate Team Analysis';
    if (status) status.textContent = '';
    if (res.ok && res.data.status === 'ok' && res.data.insight) {
      teamInsightData = res.data.insight;
      renderTeamInsight(res.data.insight);
    } else {
      var msg = (res.data && res.data.message) ? res.data.message : 'Failed to generate team insight';
      if (status) {
        status.textContent = msg;
        status.style.color = 'var(--red)';
      }
    }
  })
  .catch(function(e) {
    btn.disabled = false;
    btn.textContent = 'Generate Team Analysis';
    if (status) {
      status.textContent = String(e);
      status.style.color = 'var(--red)';
    }
  });
};

function renderTeamInsight(insight) {
  var el = document.getElementById('ins-ai-content');
  if (!el) return;

  var h = '';

  // Header with provider info
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
  h += '<div style="font-size:10px;color:var(--text-dim)">' + esc(insight.provider || '') + ' / ' + esc(insight.model || '') + ' &mdash; ' + new Date(insight.generatedAt).toLocaleString() + '</div>';
  h += '<button class="insight-gen-btn" onclick="generateTeamInsight(true)" style="font-size:10px;padding:4px 10px">Regenerate</button>';
  h += '</div>';

  // Executive Summary
  h += '<div style="border:1px solid rgba(192,132,252,.15);border-radius:8px;padding:12px;margin-bottom:14px;background:rgba(192,132,252,.06)">';
  h += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--purple);margin-bottom:6px;font-weight:600">Executive Summary</div>';
  h += '<div style="font-size:13px;color:var(--text-primary);line-height:1.7">' + esc(insight.executiveSummary) + '</div>';
  h += '</div>';

  // Cost & Productivity Analysis side by side
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';

  // Cost Analysis
  h += '<div style="border:1px solid rgba(251,146,60,.15);border-radius:8px;padding:12px;background:rgba(251,146,60,.04)">';
  h += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--orange);margin-bottom:6px;font-weight:600">Cost Analysis</div>';
  h += '<div style="font-size:12px;color:var(--text-primary);line-height:1.7">' + esc(insight.costAnalysis) + '</div>';
  h += '</div>';

  // Productivity Analysis
  h += '<div style="border:1px solid rgba(74,222,128,.15);border-radius:8px;padding:12px;background:rgba(74,222,128,.04)">';
  h += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--green);margin-bottom:6px;font-weight:600">Productivity Analysis</div>';
  h += '<div style="font-size:12px;color:var(--text-primary);line-height:1.7">' + esc(insight.productivityAnalysis) + '</div>';
  h += '</div>';

  h += '</div>';

  // Member Highlights
  if (insight.memberHighlights && insight.memberHighlights.length > 0) {
    h += '<div style="margin-bottom:14px">';
    h += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:8px;font-weight:600">Member Highlights</div>';
    for (var i = 0; i < insight.memberHighlights.length; i++) {
      var mh = insight.memberHighlights[i];
      var col = MEMBER_COLORS[i % MEMBER_COLORS.length];
      h += '<div style="border:1px solid var(--panel-border);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--panel);border-left:3px solid ' + col + '">';
      h += '<div style="font-size:12px;font-weight:600;color:' + col + ';margin-bottom:4px">' + esc(mh.displayName || mh.userId) + '</div>';
      h += '<div style="font-size:11px;color:var(--text-muted);line-height:1.6">';
      h += '<div style="margin-bottom:3px"><span style="color:var(--green);font-weight:600">Strength:</span> ' + esc(mh.strength) + '</div>';
      if (mh.concern) {
        h += '<div style="margin-bottom:3px"><span style="color:var(--orange);font-weight:600">Watch:</span> ' + esc(mh.concern) + '</div>';
      }
      h += '<div><span style="color:var(--cyan);font-weight:600">Recommendation:</span> ' + esc(mh.recommendation) + '</div>';
      h += '</div>';
      h += '</div>';
    }
    h += '</div>';
  }

  // Risks and Recommendations side by side
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';

  // Risks
  if (insight.risks && insight.risks.length > 0) {
    h += '<div style="border:1px solid rgba(248,113,113,.15);border-radius:8px;padding:12px;background:rgba(248,113,113,.04)">';
    h += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--red);margin-bottom:8px;font-weight:600">Risks</div>';
    for (var i = 0; i < insight.risks.length; i++) {
      h += '<div class="ins-ai-item">' + esc(insight.risks[i]) + '</div>';
    }
    h += '</div>';
  } else {
    h += '<div></div>';
  }

  // Recommendations
  if (insight.recommendations && insight.recommendations.length > 0) {
    h += '<div style="border:1px solid rgba(34,211,238,.15);border-radius:8px;padding:12px;background:rgba(34,211,238,.04)">';
    h += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--cyan);margin-bottom:8px;font-weight:600">Recommendations</div>';
    for (var i = 0; i < insight.recommendations.length; i++) {
      h += '<div class="ins-ai-item" style="color:var(--text-muted)">' + esc(insight.recommendations[i]) + '</div>';
    }
    h += '</div>';
  } else {
    h += '<div></div>';
  }

  h += '</div>';

  // Forecast
  if (insight.forecast) {
    h += '<div class="ins-forecast" style="margin-bottom:8px">';
    h += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--orange);margin-bottom:4px;font-weight:600">Forecast</div>';
    h += '<div style="font-size:12px;color:var(--text-primary);line-height:1.6">' + esc(insight.forecast) + '</div>';
    h += '</div>';
  }

  el.innerHTML = h;
}

// ===== TEAM INSIGHTS CONTEXT =====
window.openContextModal = function() {
  var modal = document.getElementById('context-modal');
  if (!modal) return;
  var statusEl = document.getElementById('context-status');
  if (statusEl) statusEl.textContent = '';
  authFetch('/api/team/insights/context')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.configured && data.context) {
        var co = document.getElementById('context-company');
        var gu = document.getElementById('context-guidelines');
        if (co) co.value = data.context.companyContext || '';
        if (gu) gu.value = data.context.analysisGuidelines || '';
      }
      modal.classList.add('open');
    })
    .catch(function() { modal.classList.add('open'); });
};

window.closeContextModal = function() {
  var modal = document.getElementById('context-modal');
  if (modal) modal.classList.remove('open');
};

window.saveContext = function() {
  var btn = document.getElementById('context-save-btn');
  var statusEl = document.getElementById('context-status');
  var co = document.getElementById('context-company');
  var gu = document.getElementById('context-guidelines');
  if (!co || !gu) return;
  var body = { companyContext: co.value, analysisGuidelines: gu.value };
  if (!body.companyContext && !body.analysisGuidelines) {
    if (statusEl) { statusEl.textContent = 'Enter at least one field'; statusEl.className = 'modal-status error'; }
    return;
  }
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = 'Saving...'; statusEl.className = 'modal-status'; }
  authFetch('/api/team/insights/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
  .then(function(res) {
    if (btn) btn.disabled = false;
    if (res.ok && res.data.status === 'ok') {
      if (statusEl) { statusEl.textContent = 'Saved'; statusEl.className = 'modal-status ok'; }
      updateContextIndicator();
      setTimeout(function() { window.closeContextModal(); }, 800);
    } else {
      var msg = (res.data && res.data.message) ? res.data.message : 'Failed to save';
      if (statusEl) { statusEl.textContent = msg; statusEl.className = 'modal-status error'; }
    }
  })
  .catch(function(e) {
    if (btn) btn.disabled = false;
    if (statusEl) { statusEl.textContent = String(e); statusEl.className = 'modal-status error'; }
  });
};

function updateContextIndicator() {
  authFetch('/api/team/insights/context')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var el = document.getElementById('context-indicator');
      if (!el) return;
      if (data.configured && data.context && data.context.updatedAt) {
        el.textContent = 'Custom context active \u00b7 saved ' + new Date(data.context.updatedAt).toLocaleDateString();
      } else {
        el.textContent = '';
      }
    })
    .catch(function() {});
}

function boot() {
  checkAuth().then(function(ok) {
    if (!ok) return;
    startStreaming();
    updateContextIndicator();
  });
}

boot();
})();
<\/script>
</body>
</html>`;
}
