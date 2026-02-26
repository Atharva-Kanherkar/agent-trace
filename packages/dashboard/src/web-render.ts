import type { DashboardRenderOptions } from "./web-types";

export function renderDashboardHtml(options: DashboardRenderOptions = {}): string {
  const title = options.title ?? "agent-trace dashboard";

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
.pr-label{color:var(--cyan);font-weight:600}
.pr-repo{color:var(--text-muted)}
.pr-link{color:var(--text-dim);text-decoration:none;font-size:11px}
.pr-link:hover{color:var(--cyan);text-decoration:underline}
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
@media(max-width:1200px){.mg{grid-template-columns:repeat(2,minmax(0,1fr))}.sg{grid-template-columns:1fr}}
@media(max-width:760px){.shell{padding:12px 8px 24px}.mg{grid-template-columns:1fr}th:nth-child(5),td:nth-child(5),th:nth-child(7),td:nth-child(7){display:none}.erow{grid-template-columns:18px 1fr}.emeta{grid-column:2}.pg-stats{display:none}}
</style>
</head>
<body>
<main class="shell">
<section class="hero">
<h1>${title}</h1>
<p>session observability for coding agents</p>
<div id="status" class="status-banner">Connecting...</div>
</section>
<section class="mg">
<article class="mc"><div class="label">Sessions</div><div class="val green" id="m-sessions">0</div></article>
<article class="mc"><div class="label">Total Cost</div><div class="val orange" id="m-cost">$0.00</div></article>
<article class="mc"><div class="label">Prompts</div><div class="val cyan" id="m-prompts">0</div></article>
<article class="mc"><div class="label">Tool Calls</div><div class="val" id="m-tools">0</div></article>
<article class="mc"><div class="label">Commits</div><div class="val green" id="m-commits">0</div><div class="det" id="m-commits-det"></div></article>
</section>
<section class="sg">
<section class="panel">
<header class="ph"><div><h2>Sessions</h2><p id="stream-label">...</p></div></header>
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
</main>
<script>
(function(){
var DQ = String.fromCharCode(34);
var selectedId = null;
var sessions = [];
var costPoints = [];
var replay = null;

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
  if (sessions.length === 0) { area.innerHTML = '<div class="empty">No sessions captured yet.</div>'; return; }
  var h = '<table><thead><tr><th>Session</th><th>Repo</th><th>Started</th><th>Prompts</th><th>Cost</th><th>Commits</th><th>Lines</th></tr></thead><tbody>';
  sessions.forEach(function(s){
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
  document.getElementById('m-sessions').textContent = sessions.length;
  document.getElementById('m-cost').textContent = fmt$(sessions.reduce(function(s,x){return s+x.totalCostUsd;},0));
  document.getElementById('m-prompts').textContent = sessions.reduce(function(s,x){return s+x.promptCount;},0);
  document.getElementById('m-tools').textContent = sessions.reduce(function(s,x){return s+x.toolCallCount;},0);
  var tc = sessions.reduce(function(s,x){return s+x.commitCount;},0);
  var sc = sessions.filter(function(x){return x.commitCount>0;}).length;
  document.getElementById('m-commits').textContent = tc;
  document.getElementById('m-commits-det').textContent = sc + '/' + sessions.length + ' sessions produced commits';
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
      replay.pullRequests.forEach(function(pr){ h += '<div class="outcome-pr"><span class="pr-badge">' + esc(pr.state) + '</span><span class="pr-label">PR #' + pr.prNumber + '</span><span class="pr-repo">' + esc(pr.repo) + '</span>' + (pr.url ? '<a class="pr-link" href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">' + esc(pr.url) + '</a>' : '') + '</div>'; });
      h += '</div>';
    }
    h += '</div>';
  }
  // prompt groups
  var groups = buildPromptGroups(replay.timeline, replay.commits);
  if (groups.length === 0) {
    h += '<div class="empty">No prompts in this session.</div>';
  } else {
    groups.forEach(function(g, i) { h += renderPromptCard(g, i + 1); });
  }
  area.innerHTML = h;
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
  if (sessions.length > 0 && (!selectedId || !sessions.some(function(s){return s.sessionId===selectedId;}))) {
    selectSession(sessions[0].sessionId);
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

function boot() {
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

boot();
})();
<\/script>
</body>
</html>`;
}
