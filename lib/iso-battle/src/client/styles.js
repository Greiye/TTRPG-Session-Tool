// All selectors are scoped under .isob so nothing leaks into (or is easily clobbered by) the host page.
// Theme by overriding the --isob-* custom properties on the container or .isob.
export const CSS = `
.isob { --isob-bg:#151924; --isob-panel:#1f2533ee; --isob-line:#384157; --isob-fg:#e4e8f2; --isob-dim:#8a93a8; --isob-acc:#ffd84a; --isob-red:#ff6a5a; --isob-blue:#7ad0ff;
  --isob-font: ui-monospace, Menlo, Consolas, monospace;
  container: isob / size; position:relative; width:100%; height:100%; min-height:420px; overflow:hidden; background:var(--isob-bg); color:var(--isob-fg);
  font:13px/1.35 var(--isob-font); text-align:left; color-scheme:dark; outline:none; user-select:none; -webkit-user-select:none; }
.isob *, .isob *::before, .isob *::after { box-sizing:border-box; }
.isob .isob-view { position:absolute; inset:0; }
.isob .isob-view canvas { display:block; touch-action:none; }
.isob .isob-panel { position:absolute; background:var(--isob-panel); border:1px solid var(--isob-line); border-radius:6px; padding:8px; z-index:2; }
.isob button, .isob select, .isob input { font:inherit; color:var(--isob-fg); background:#2a3245; border:1px solid var(--isob-line); border-radius:4px; padding:3px 7px; margin:0; text-transform:none; letter-spacing:normal; width:auto; height:auto; line-height:1.3; box-shadow:none; }
.isob button:hover:not(:disabled) { border-color:var(--isob-acc); cursor:pointer; }
.isob button:focus-visible, .isob select:focus-visible, .isob input:focus-visible { outline:2px solid var(--isob-blue); outline-offset:1px; }
.isob button:disabled { opacity:.4; }
.isob button.on { background:#4a4020; border-color:var(--isob-acc); }
.isob input[type=number] { width:56px; }
.isob h3 { margin:0 0 6px; font-size:12px; font-weight:bold; color:var(--isob-dim); text-transform:uppercase; letter-spacing:.06em; }
.isob .isob-top { top:8px; left:50%; transform:translateX(-50%); display:flex; gap:10px; align-items:center; white-space:nowrap; }
.isob .isob-init { top:8px; left:8px; width:210px; max-height:60%; overflow:auto; }
.isob .ini { display:flex; align-items:center; gap:6px; padding:2px 3px; border-radius:4px; cursor:pointer; }
.isob .ini.active { background:#4a4020; } .isob .ini.sel { outline:1px solid var(--isob-blue); }
.isob .ini img { width:28px; height:28px; image-rendering:pixelated; }
.isob .ini .nm { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.isob .ini .hp { color:var(--isob-dim); font-size:11px; }
.isob .ini.dead .nm { text-decoration:line-through; color:var(--isob-dim); }
.isob .ini.monsters .nm { color:#ffc4b8; } .isob .ini.players .nm { color:#bfe3ff; }
.isob .ini button { padding:0 4px; font-size:10px; }
.isob .isob-actions { bottom:8px; left:50%; transform:translateX(-50%); display:flex; gap:6px; align-items:center; white-space:nowrap; max-width:calc(100% - 16px); overflow-x:auto; }
.isob .isob-actions img { width:32px; height:32px; image-rendering:pixelated; }
.isob .pips { display:inline-flex; gap:2px; margin:0 6px; } .isob .pip { width:9px; height:14px; background:#333a4c; border-radius:2px; } .isob .pip.f { background:var(--isob-acc); } .isob .pip.cost { background:#a05040; }
.isob .isob-dm { top:8px; right:8px; width:250px; max-height:calc(100% - 16px); overflow:auto; }
.isob .isob-dm .tools { display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:6px; }
.isob .row { display:flex; gap:4px; align-items:center; margin:4px 0; flex-wrap:wrap; }
.isob hr { border:0; border-top:1px solid var(--isob-line); margin:8px 0; }
.isob label { color:inherit; font:inherit; display:inline-flex; gap:4px; align-items:center; }
.isob .isob-log { bottom:8px; left:8px; width:300px; height:150px; overflow:auto; font-size:11px; color:#c8cede; }
.isob .isob-hint { position:absolute; bottom:64px; left:50%; transform:translateX(-50%); color:var(--isob-dim); background:#0008; padding:3px 8px; border-radius:4px; pointer-events:none; white-space:nowrap; z-index:2; }
.isob .isob-toast { position:absolute; top:52px; left:50%; transform:translateX(-50%); background:#5a2020; border:1px solid var(--isob-red); padding:4px 10px; border-radius:4px; z-index:3; }
.isob .k { color:var(--isob-dim); }
.isob [hidden] { display:none !important; }
@container isob (max-width: 800px) { .isob .isob-log { display:none; } .isob .isob-init { width:160px; } .isob .isob-dm { width:200px; } }
`;

let injected = new WeakSet();
export function injectStyles(doc = document) {
  if (injected.has(doc)) return;
  const el = doc.createElement('style'); el.dataset.isob = ''; el.textContent = CSS;
  doc.head.appendChild(el); injected.add(doc);
}
