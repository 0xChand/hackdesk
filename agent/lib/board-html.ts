// Server-rendered board page. No framework, no external assets: one HTML
// response with inline CSS/JS, rendered from the same ChallengeView the tools use.

import type { Brief } from "./store.ts";
import type { ChallengeView } from "./view.ts";

/** Tiny markdown subset for the brief: headings, bullets, bold. Input is escaped first. */
function md(src: string): string {
  return src
    .split("\n")
    .map((l) => {
      const e = esc(l).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      if (/^# /.test(l)) return `<h4>${e.slice(2)}</h4>`;
      if (/^## /.test(l)) return `<h5>${e.slice(3)}</h5>`;
      if (/^- /.test(l)) return `<div class="li">${e.slice(2)}</div>`;
      return e ? `<p>${e}</p>` : "";
    })
    .join("");
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function card(v: ChallengeView): string {
  const pct = v.progress.total ? Math.round((v.progress.done / v.progress.total) * 100) : 0;
  const item = (i: { id: string; text: string }, done: boolean, optional = false) => `
      <li class="${done ? "done" : ""}">
        <label><input type="checkbox" data-c="${esc(v.id)}" data-i="${esc(i.id)}" ${done ? "checked" : ""}/>
        <span>${esc(i.text)}${optional ? ' <em>optional</em>' : ""}</span></label>
      </li>`;
  const audit = v.lastAudit
    ? `<span class="pill ${v.lastAudit.score >= 80 ? "ok" : v.lastAudit.score >= 60 ? "mid" : "bad"}" title="last audit ${esc(v.lastAudit.at)}">repo ${v.lastAudit.score}/100</span>`
    : "";
  const changes = v.unacknowledgedChanges.length
    ? `<div class="alert">⚠ Page changed: ${esc(v.unacknowledgedChanges[0]!.summary)} <button data-ack="${esc(v.id)}">dismiss</button></div>`
    : "";
  const assumed = v.deadlineAssumptions.length
    ? `<details class="assume"><summary>⚠ ${v.deadlineAssumptions.length} deadline caveat${v.deadlineAssumptions.length > 1 ? "s" : ""}</summary><ul>${v.deadlineAssumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>`
    : "";
  return `
  <article class="card u-${v.urgency}" data-id="${esc(v.id)}">
    <header>
      <div>
        <h2><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.name)}</a></h2>
        <div class="meta">${esc(v.deadlineLabel)}${v.planDiffers ? ` · <b>plan for ${esc(v.planAt.slice(0, 16).replace("T", " "))} UTC</b>` : ""}${v.prizes ? ` · ${esc(v.prizes)}` : ""}</div>
        ${assumed}
      </div>
      <div class="count" data-at="${esc(v.planAt)}" title="${v.planDiffers ? "counting down to the earliest reading of the deadline" : ""}">${esc(v.left)}</div>
    </header>
    ${changes}
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="row"><span>${v.progress.done}/${v.progress.total} done</span>${audit}
      ${v.judgingCriteria.length ? `<span class="crit">judged on: ${esc(v.judgingCriteria.join(", "))}</span>` : ""}</div>
    <ul>
      ${v.openRequired.map((i) => item(i, false)).join("")}
      ${v.openOptional.map((i) => item(i, false, true)).join("")}
      ${v.done.map((i) => item(i, true)).join("")}
    </ul>
    <footer>
      ${v.repoUrl ? `<button data-audit="${esc(v.id)}" data-repo="${esc(v.repoUrl)}">Audit repo</button>` : ""}
      <button data-watch="${esc(v.id)}">Check page for changes</button>
      <a href="${esc(v.addToGoogleCalendar)}" target="_blank" rel="noopener">+ Google Calendar</a>
    </footer>
    <pre class="out" hidden></pre>
  </article>`;
}

export function renderBoard(args: {
  views: ChallengeView[];
  now: Date;
  latestBrief: Brief | null;
  brief: string;
  token: string | null;
}): string {
  const live = args.views.filter((v) => v.hoursLeft >= 0);
  const past = args.views.filter((v) => v.hoursLeft < 0);
  const q = args.token ? `?token=${encodeURIComponent(args.token)}` : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>hackdesk board</title>
<style>
:root{--bg:#0b0d10;--panel:#12161b;--line:#222a33;--text:#e6edf3;--dim:#8b98a5;--accent:#7c9cff;
--ok:#3fb950;--mid:#d29922;--bad:#f85149;--crit:#ff6b6b;--soon:#f0b429;color-scheme:dark}
@media (prefers-color-scheme: light){:root{--bg:#f6f7f9;--panel:#fff;--line:#e3e7ec;--text:#14181d;--dim:#5b6673;--accent:#3355dd;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 16px 80px}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:22px}
h1{margin:0;font-size:26px;letter-spacing:-.02em}h1 small{color:var(--dim);font-weight:500;font-size:14px;margin-left:8px}
.links a{color:var(--accent);text-decoration:none;margin-left:14px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px}
.card{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.u-critical{border-left-color:var(--crit)}.u-soon{border-left-color:var(--soon)}.u-comfortable{border-left-color:var(--ok)}.u-overdue{opacity:.55}
.card header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.card header>div:first-child{min-width:0;flex:1}
h2{margin:0;font-size:17px}h2 a{color:inherit;text-decoration:none}h2 a:hover{text-decoration:underline}
.meta,.crit,.assume{color:var(--dim);font-size:13px}.assume{color:var(--mid)}
.count{font:600 18px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;text-align:right;flex:none}
.u-critical .count{color:var(--crit)}.u-soon .count{color:var(--soon)}
.bar{height:6px;background:var(--line);border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--dim)}
.pill{padding:1px 8px;border-radius:99px;font-weight:600;font-size:12px}.pill.ok{background:#3fb95022;color:var(--ok)}.pill.mid{background:#d2992222;color:var(--mid)}.pill.bad{background:#f8514922;color:var(--bad)}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
li label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}li input{margin-top:4px;accent-color:var(--accent)}
li.done span{color:var(--dim);text-decoration:line-through}em{color:var(--dim);font-size:12px}
footer{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:4px}
button{background:transparent;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:5px 10px;font:inherit;font-size:13px;cursor:pointer}
button:hover{border-color:var(--accent)}button[disabled]{opacity:.5;cursor:wait}
footer a{color:var(--accent);font-size:13px;text-decoration:none}
.alert{background:#d2992218;border:1px solid #d2992255;color:var(--mid);border-radius:8px;padding:6px 10px;font-size:13px}
.alert button{margin-left:6px;padding:1px 8px}
pre.out{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12px;white-space:pre-wrap;max-height:260px;overflow:auto;margin:0}
.brief{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 18px;margin-bottom:18px;font-size:14px}
.brief h4{margin:0 0 6px;font-size:15px}.brief h5{margin:10px 0 4px;font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em}.brief .li{padding-left:14px;text-indent:-10px}.brief .li::before{content:"· ";color:var(--dim)}.brief p{margin:0}
details.assume summary{cursor:pointer}details.assume ul{margin:4px 0 0;padding-left:2px;gap:2px}details.assume li{color:var(--mid);font-size:12px}
.empty{color:var(--dim);padding:40px;text-align:center;border:1px dashed var(--line);border-radius:12px}
h3{font-size:14px;color:var(--dim);margin:28px 0 10px;text-transform:uppercase;letter-spacing:.06em}
.chat{position:fixed;right:16px;bottom:16px;width:min(420px,calc(100vw - 32px));background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 40px #0006;display:flex;flex-direction:column;max-height:70vh}
.chat summary{padding:10px 14px;cursor:pointer;font-weight:600;list-style:none}.chat summary::after{content:" ▴";color:var(--dim)}
.chat[open] summary::after{content:" ▾"}
#log{padding:0 14px;overflow:auto;display:flex;flex-direction:column;gap:8px;max-height:46vh}
.m{padding:8px 10px;border-radius:10px;font-size:14px;white-space:pre-wrap}.m.u{background:var(--accent);color:#fff;align-self:flex-end;max-width:85%}.m.a{background:var(--bg);border:1px solid var(--line)}.m.t{color:var(--dim);font-size:12px;padding:0 4px}
form{display:flex;gap:8px;padding:12px 14px}form input{flex:1;background:var(--bg);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px 10px;font:inherit}
</style></head>
<body><div class="wrap">
  <div class="top">
    <h1>hackdesk <small>${live.length} open · ${esc(args.now.toUTCString())}</small></h1>
    <div class="links">
      <a href="calendar.ics${q}" id="ics">Subscribe (iCal)</a>
      <a href="api/challenges${q}">JSON</a>
      <a href="https://github.com/0xChand/hackdesk" target="_blank" rel="noopener">GitHub</a>
    </div>
  </div>
  <div class="brief">${md(args.latestBrief?.markdown ?? args.brief)}</div>
  ${live.length ? `<div class="grid">${live.map(card).join("")}</div>` : `<div class="empty">Nothing tracked yet. Ask hackdesk: <b>track https://…</b></div>`}
  ${past.length ? `<h3>Closed</h3><div class="grid">${past.map(card).join("")}</div>` : ""}
</div>

<details class="chat" id="chat"><summary>Ask hackdesk</summary>
  <div id="log"><div class="m t">e.g. "track https://eve.dev/challenge" · "what should I work on?" · "judge my repo"</div></div>
  <form id="f"><input id="q" placeholder="Message hackdesk…" autocomplete="off"/><button>Send</button></form>
</details>

<script>
const Q=${JSON.stringify(q)};
// Live countdowns.
function fmt(ms){const o=ms<0;ms=Math.abs(ms);const d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5),m=Math.floor(ms%36e5/6e4),s=Math.floor(ms%6e4/1e3);
  const t=d>0?d+"d "+h+"h "+String(m).padStart(2,"0")+"m":h>0?h+"h "+String(m).padStart(2,"0")+"m "+String(s).padStart(2,"0")+"s":m+"m "+String(s).padStart(2,"0")+"s";return o?"overdue "+t:t}
function tick(){for(const el of document.querySelectorAll(".count[data-at]"))el.textContent=fmt(new Date(el.dataset.at)-Date.now())}
tick();setInterval(tick,1000);
// webcal:// makes calendar apps subscribe instead of import once.
const ics=document.getElementById("ics");ics.href="webcal://"+location.host+location.pathname.replace(/\\/?$/,"/")+"calendar.ics"+Q;
if(!location.pathname.endsWith("/")){for(const a of document.querySelectorAll(".links a[href^='api'],.links a[href^='calendar']"))a.href=location.pathname+"/"+a.getAttribute("href")}

async function run(tool,input){const r=await fetch(location.pathname.replace(/\\/$/,"")+"/api/run"+Q,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tool,input})});return r.json()}
document.addEventListener("change",async e=>{const cb=e.target;if(!cb.dataset||!cb.dataset.i)return;cb.disabled=true;
  const r=await run("update_checklist",{challengeId:cb.dataset.c,items:[{id:cb.dataset.i,done:cb.checked}]});cb.disabled=false;
  if(r.ok)cb.closest("li").classList.toggle("done",cb.checked);else{cb.checked=!cb.checked;alert(r.error)}});
document.addEventListener("click",async e=>{const b=e.target.closest("button");if(!b||b.form)return;const card=b.closest(".card");const out=card&&card.querySelector(".out");
  if(b.dataset.ack){await run("update_checklist",{challengeId:b.dataset.ack,acknowledgeChanges:true});b.parentElement.remove();return}
  if(b.dataset.audit||b.dataset.watch){b.disabled=true;out.hidden=false;out.textContent="running…";
    const r=b.dataset.audit?await run("audit_repo",{repo:b.dataset.repo,challengeId:b.dataset.audit}):await run("check_updates",{challengeId:b.dataset.watch});
    b.disabled=false;if(!r.ok){out.textContent=r.error;return}
    if(b.dataset.audit){const o=r.output;out.textContent="score "+o.score+"/100\\n"+o.findings.map(f=>(f.status==="pass"?"✓":f.status==="warn"?"!":"✗")+" "+f.check+": "+f.detail+(f.fix?"\\n    → "+f.fix:"")).join("\\n")}
    else{const x=r.output.results[0]||{};out.textContent=x.status==="changed"?"CHANGED: "+x.summary+"\\n+ "+x.added.slice(0,8).join("\\n+ ")+"\\n- "+x.removed.slice(0,8).join("\\n- "):x.status==="error"?x.error:"No changes since last check ("+x.status+")."}}});

// Chat over eve's session API, streaming NDJSON.
let sid=null;const doneTurns=new Set();const log=document.getElementById("log");
const old=x=>x&&x.scope&&doneTurns.has(x.scope.turnId);
function add(cls,text){const d=document.createElement("div");d.className="m "+cls;d.textContent=text;log.appendChild(d);log.scrollTop=1e9;return d}
async function stream(id){const r=await fetch("/eve/v1/session/"+id+"/stream");const rd=r.body.getReader();const dec=new TextDecoder();let buf="",cur=null,parts={};
  for(;;){const{value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
    while((i=buf.indexOf("\\n"))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(!line.trim())continue;let ev;try{ev=JSON.parse(line)}catch{continue}
      const p=ev.progress;if(p&&!old(p)&&p.type==="content.delta"&&p.data.delta!==undefined&&!p.data.kind){(parts[p.data.partId]||(parts[p.data.partId]=add("a",""))).textContent+=p.data.delta;log.scrollTop=1e9}
      for(const f of ev.facts||[]){if(old(f))continue;
        if(f.type==="call.requested"&&f.data.capability&&!f.data.capability.hidden)add("t","→ "+(f.data.capability.label||f.data.capability.name));
        if(f.type==="content.completed"&&f.data.kind==="text"){const el=parts[f.data.partId]||(parts[f.data.partId]=add("a",""));el.textContent=f.data.value}
        if(f.type==="content.completed"&&f.data.kind==="reasoning"){const el=parts[f.data.partId];if(el)el.remove()}
        if(f.type==="turn.settled"){doneTurns.add(f.data.turnId);if(f.data.outcome==="failed")add("t","✗ "+(f.data.error&&f.data.error.message||"failed"));rd.cancel();return}}}}}
document.getElementById("f").addEventListener("submit",async e=>{e.preventDefault();const q=document.getElementById("q");const text=q.value.trim();if(!text)return;q.value="";add("u",text);
  const url=sid?"/eve/v1/session/"+sid:"/eve/v1/session";const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:text})});const j=await r.json();
  if(!j.ok){add("t","✗ "+(j.error||r.status));return}sid=j.sessionId;await stream(sid);if(/track|audit|done|check/i.test(text))setTimeout(()=>location.reload(),800)});
</script>
</body></html>`;
}
