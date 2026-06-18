export const dashboardStyles = `    :root {
      --bg: #0b0d10;
      --surface: #12161b;
      --surface-2: #181e24;
      --surface-3: #202832;
      --ink: #edf2f7;
      --muted: #9aa8b5;
      --faint: #657280;
      --line: #26313b;
      --line-strong: #354350;
      --ok: #31c48d;
      --warn: #e4b363;
      --danger: #ee6a7c;
      --info: #63b3ed;
      --accent: #b8d45b;
      --shadow: rgba(0,0,0,.32);
    }
    * { box-sizing: border-box; }
    html { overflow-x: hidden; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    button, input { font: inherit; }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 252px minmax(0, 1fr);
      width: 100%;
      max-width: 100vw;
      overflow-x: hidden;
    }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 20px 16px;
      border-right: 1px solid var(--line);
      background: #0f1318;
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
      max-width: 100%;
    }
    .brand { display: grid; gap: 5px; padding: 6px 8px 14px; border-bottom: 1px solid var(--line); }
    .brand strong { font-size: 1.05rem; letter-spacing: 0; }
    .brand span { color: var(--muted); font-size: .82rem; }
    .nav { display: grid; gap: 6px; }
    .nav button {
      width: 100%;
      border: 1px solid transparent;
      color: var(--muted);
      background: transparent;
      border-radius: 8px;
      padding: 10px 11px;
      text-align: left;
      cursor: pointer;
    }
    .nav button[aria-selected="true"], .nav button:hover {
      color: var(--ink);
      border-color: var(--line);
      background: var(--surface);
    }
    .sidebar-footer {
      margin-top: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: var(--surface);
      color: var(--muted);
      font-size: .82rem;
      line-height: 1.45;
    }
    main { min-width: 0; padding: 22px; }
    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: center;
      margin-bottom: 18px;
    }
    .titleblock { display: grid; gap: 4px; min-width: 0; max-width: 100%; }
    h1 { margin: 0; font-size: 1.8rem; line-height: 1.08; letter-spacing: 0; }
    h2 { margin: 0; font-size: .82rem; text-transform: uppercase; letter-spacing: 0; color: var(--muted); }
    h3 { margin: 0; font-size: .95rem; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); line-height: 1.45; overflow-wrap: anywhere; }
    code { color: var(--accent); }
    .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; max-width: 100%; }
    .search {
      width: min(460px, 44vw);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      background: var(--surface);
      color: var(--ink);
      outline: none;
    }
    .search:focus { border-color: var(--info); box-shadow: 0 0 0 3px rgba(99,179,237,.12); }
    .button {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
    }
    .button:hover { border-color: var(--line-strong); background: var(--surface-2); }
    .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; min-width: 0; max-width: 100%; }
    .span-3 { grid-column: span 3; }
    .span-4 { grid-column: span 4; }
    .span-5 { grid-column: span 5; }
    .span-6 { grid-column: span 6; }
    .span-7 { grid-column: span 7; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    .panel {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      box-shadow: 0 16px 48px var(--shadow);
      min-width: 0;
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .panel-body { padding: 14px 16px; }
    .metric { font-size: 2.05rem; line-height: 1; font-weight: 800; letter-spacing: 0; }
    .metric-small { font-size: 1.35rem; line-height: 1; font-weight: 800; }
    .kpi { display: grid; gap: 10px; min-height: 136px; }
    .kpi p { min-height: 38px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 8px;
      color: var(--muted);
      background: var(--surface-2);
      font-size: .78rem;
      white-space: nowrap;
    }
    .badge-ok { color: var(--ok); border-color: rgba(49,196,141,.35); }
    .badge-warn { color: var(--warn); border-color: rgba(228,179,99,.35); }
    .badge-danger { color: var(--danger); border-color: rgba(238,106,124,.35); }
    .status-operational, .status-complete, .status-passed, .status-approved, .status-available, .status-ready, .status-created, .ok { color: var(--ok); }
    .status-degraded, .status-pending, .status-queued, .status-needs-hardening, .status-unconfigured, .status-warning, .warn { color: var(--warn); }
    .status-failed, .status-blocked, .status-missing, .danger { color: var(--danger); }
    .meter { height: 7px; border-radius: 999px; background: #2a333d; overflow: hidden; margin-top: 9px; }
    .meter > div { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--ok), var(--accent)); }
    .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .list li {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #101419;
      color: var(--muted);
    }
    .split { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .table-wrap { overflow: auto; min-width: 0; max-width: 100%; }
    table { width: 100%; border-collapse: collapse; min-width: 620px; }
    th, td { padding: 10px 9px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0; }
    td { color: var(--ink); font-size: .9rem; }
    td.muted { color: var(--muted); }
    .command-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .command {
      display: grid;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #101419;
      min-width: 0;
    }
    .command code {
      display: block;
      overflow-wrap: anywhere;
      border-radius: 6px;
      padding: 8px;
      background: #090c0f;
    }
    .tool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .tool {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 10px;
      background: #101419;
      overflow-wrap: anywhere;
    }
    .view { display: none; min-width: 0; max-width: 100%; }
    .view.active { display: grid; }
    .hidden { display: none; }
    .status-box {
      margin: 0;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-height: 72px;
      background: #090c0f;
      color: var(--muted);
    }
    .workflow-result { display: grid; gap: 12px; }
    .workflow-headline {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .workflow-kv {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      margin: 0;
    }
    .workflow-kv dt {
      color: var(--faint);
      font-size: .72rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .workflow-kv dd {
      margin: 3px 0 0;
      color: var(--ink);
      overflow-wrap: anywhere;
    }
    .workflow-highlights { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    details {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #101419;
      overflow: hidden;
    }
    summary {
      cursor: pointer;
      padding: 10px 12px;
      color: var(--ink);
    }
    details pre {
      margin: 0;
      border-top: 1px solid var(--line);
      padding: 12px;
      white-space: pre-wrap;
      color: var(--muted);
      overflow: auto;
    }
    @media (max-width: 1040px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { position: static; height: auto; }
      .nav { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .topbar { align-items: stretch; flex-direction: column; }
      .search { width: 100%; }
      .span-3, .span-4, .span-5, .span-6, .span-7, .span-8 { grid-column: span 12; }
      .command-grid, .tool-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      main { padding: 14px; }
      .sidebar { width: 100%; padding: 18px 14px; }
      .nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .toolbar { align-items: stretch; flex-direction: column; }
      .button { width: 100%; }
      .workflow-headline { align-items: flex-start; flex-direction: column; }
      .workflow-kv, .workflow-highlights { grid-template-columns: 1fr; }
      h1 { font-size: 1.45rem; }
      .metric { font-size: 1.7rem; overflow-wrap: anywhere; }
      .panel-body { padding: 12px; }
    }`;
