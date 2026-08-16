// dsh-hdc-bridge browser bundle — official client-plugin shape, modeled on
// the platform's own side-panel plugins (client-ui-cordis) and the
// third-party remote-control plugin (@linxin666/dsh-remote-web-ui):
//   * entry: a sidebar-foot action button (slot 'sidebar.footer.action',
//     declared by client-ui-sidebar) — icon in the rail, icon+label when wide
//   * surface: a centered modal opened via ReactDOM.createPortal to body,
//     mask + card, platform theme tokens (--dsw-alias-*) throughout
//   * styles: official idempotent style[data-plugin-css] injection
// Data comes from the host half's read-only REST routes (/api2/hdc-bridge/*).
// Polling: 8s/20s while open, 60s while closed (keeps the entry status dot
// and device-count badge fresh). Drag/resize persist through localStorage.
window.__ModuleLoader__.load({
  id: 'dsh-hdc-bridge',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    var React = require('react');
    var ReactDOM = require('react-dom');
    var NL = String.fromCharCode(10);
    var STORE_KEY = 'dsh-hdc-bridge-panel-v3';
    var POLL_FAST = 8000;
    var POLL_SLOW = 20000;
    var POLL_CLOSED = 60000;

    var CSS = [
      // ---- sidebar footer entry (rail = icon, wide = icon + label) ----
      '.hdcp-entry{position:relative;width:36px;height:36px;flex:none;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--dsw-alias-label-secondary,#9ba0ab);cursor:pointer;background:transparent;border:none;border-radius:50%;padding:0;transition:background-color .12s,color .12s,box-shadow .12s;}',
      '.hdcp-entry:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#e9e9ef);}',
      '.hdcp-entry[data-wide]{width:auto;padding:0 10px;border-radius:8px;}',
      '.hdcp-entry-dot{position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;border:2px solid var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base,#f9fafb));background:var(--dsw-alias-label-quaternary,#8a8f99);}',
      '.hdcp-dot-ok{background:var(--dsw-alias-state-success-primary,#34c759);}',
      '.hdcp-dot-err{background:var(--dsw-alias-state-error-primary,#ff5252);}',
      '.hdcp-dot-warn{background:var(--dsw-alias-state-warn-primary,#ffb020);}',
      '.hdcp-entry-label{font:12px/1 system-ui,-apple-system,Segoe UI,sans-serif;}',
      '.hdcp-entry-count{min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--dsw-alias-brand-primary,#3d7bfd);color:var(--dsw-alias-label-primary-inverted,#fff);font:10px/16px system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;}',
      // ---- floating panel (portal to body so the sidebar container never clips it) ----
      '.hdcp-root{position:fixed;top:70px;right:16px;z-index:1000;width:330px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);pointer-events:auto;font:12px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--dsw-alias-label-primary,#e9e9ef);}',
      '.hdcp-card{background:var(--dsw-alias-bg-layer-3,#23252c);border:1px solid var(--dsw-alias-border-l2,#3a3d46);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.38);display:flex;flex-direction:column;position:relative;overflow:hidden;}',
      '.hdcp-head{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:move;user-select:none;-webkit-user-select:none;touch-action:none;}',
      '.hdcp-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-label-quaternary,#8a8f99);}',
      '.hdcp-title{font-weight:600;flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.hdcp-btn{background:transparent;border:1px solid var(--dsw-alias-border-l2,#3a3d46);border-radius:6px;color:inherit;padding:2px 8px;font:inherit;cursor:pointer;flex:0 0 auto;}',
      '.hdcp-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#2c2e37);}',
      '.hdcp-btn:disabled{opacity:.5;cursor:default;}',
      '.hdcp-tools{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l2,#3a3d46);}',
      '.hdcp-tools-label{color:var(--dsw-alias-label-tertiary,#9ba0ab);font-size:11px;margin-right:2px;}',
      '.hdcp-tool-badge{background:var(--dsw-alias-fill-tsp-secondary,rgba(255,255,255,.08));color:var(--dsw-alias-state-business-primary,#8fb3f5);border-radius:4px;padding:1px 7px;font-size:11px;}',
      '.hdcp-body{padding:10px;border-top:1px solid var(--dsw-alias-border-l2,#3a3d46);flex:1 1 auto;display:flex;flex-direction:column;min-height:0;overflow:auto;max-height:calc(100vh - 140px);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);}',
      '.hdcp-hint{color:var(--dsw-alias-label-tertiary,#9ba0ab);margin:2px 0 6px;}',
      '.hdcp-dev{padding:5px 4px;border-bottom:1px solid var(--dsw-alias-separator-primary,rgba(255,255,255,.06));display:flex;align-items:flex-start;gap:6px;cursor:pointer;border-radius:4px;}',
      '.hdcp-dev:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05));}',
      '.hdcp-dev-pref{background:var(--dsw-alias-fill-tsp-secondary,rgba(90,150,255,.10));}',
      '.hdcp-dev-main{flex:1 1 auto;min-width:0;}',
      '.hdcp-dev-state{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-label-quaternary,#8a8f99);margin-top:4px;}',
      '.hdcp-dev-state.on{background:var(--dsw-alias-state-success-primary,#34c759);}',
      '.hdcp-dev-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.hdcp-dev-id{font-family:ui-monospace,Consolas,monospace;color:var(--dsw-alias-label-quaternary,#9ba0ab);font-size:11px;}',
      '.hdcp-dev-sub{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;}',
      '.hdcp-dev-shot{flex:0 0 auto;background:transparent;border:1px solid var(--dsw-alias-border-l2,#3a3d46);border-radius:6px;color:inherit;padding:2px 7px;font:inherit;font-size:11px;cursor:pointer;margin-top:1px;}',
      '.hdcp-dev-shot:hover{background:var(--dsw-alias-interactive-bg-hover,#2c2e37);}',
      '.hdcp-badge{background:var(--dsw-alias-fill-tsp-secondary,rgba(90,150,255,.16));color:var(--dsw-alias-state-business-primary,#7aa7ff);border-radius:4px;padding:0 6px;font-size:11px;}',
      '.hdcp-badge-pref{background:var(--dsw-alias-state-success-secondary,rgba(52,199,89,.20));color:var(--dsw-alias-state-success-primary,#5dd37c);}',
      '.hdcp-sys{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin:8px 0;padding:6px 8px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03));border-radius:6px;color:var(--dsw-alias-label-secondary,#9ba0ab);font-size:11px;}',
      '.hdcp-shot{margin-top:8px;position:relative;}',
      '.hdcp-shot img{max-width:100%;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#3a3d46);display:block;}',
      '.hdcp-shot-label{font-size:11px;color:var(--dsw-alias-label-tertiary,#9ba0ab);margin-bottom:2px;}',
      '.hdcp-shot-close{position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;border-radius:50%;background:var(--dsw-alias-bg-mask-2,rgba(0,0,0,.55));color:var(--dsw-alias-label-primary-inverted,#fff);font-size:14px;line-height:1;cursor:pointer;padding:0;}',
      '.hdcp-pre{flex:0 0 auto;max-height:160px;overflow:auto;background:var(--dsw-alias-markdown-code-block,#16171c);padding:6px;border-radius:6px;font:10px/1.4 ui-monospace,Consolas,monospace;margin:8px 0 0;white-space:pre-wrap;word-break:break-all;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);}',
      '.hdcp-foot{color:var(--dsw-alias-label-tertiary,#9ba0ab);margin-top:6px;}',
      '.hdcp-err{color:var(--dsw-alias-state-error-primary,#ff6b6b);margin-top:4px;}',
      '.hdcp-resize{position:absolute;z-index:5;touch-action:none;user-select:none;-webkit-user-select:none;}',
      '.hdcp-resize-e{right:0;top:10px;bottom:10px;width:8px;cursor:ew-resize;}',
      '.hdcp-resize-w{left:0;top:10px;bottom:10px;width:8px;cursor:ew-resize;}',
      '.hdcp-resize-n{top:0;left:10px;right:10px;height:8px;cursor:ns-resize;}',
      '.hdcp-resize-s{bottom:0;left:10px;right:10px;height:8px;cursor:ns-resize;}',
      '.hdcp-resize-ne{top:0;right:0;width:14px;height:14px;cursor:nesw-resize;}',
      '.hdcp-resize-nw{top:0;left:0;width:14px;height:14px;cursor:nwse-resize;}',
      '.hdcp-resize-se{bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;}',
      '.hdcp-resize-sw{bottom:0;left:0;width:14px;height:14px;cursor:nesw-resize;}',
      '.hdcp-btn:focus-visible,.hdcp-entry:focus-visible,.hdcp-dev-shot:focus-visible,.hdcp-shot-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3d7bfd);outline-offset:1px;}',
      '@media (prefers-reduced-motion:reduce){.hdcp-entry{transition:none;}}',
    ].join('');

    // Official CSS-injection convention: idempotent <style data-plugin-css>.
    function injectStyles() {
      var tagId = 'dsh-hdc-bridge/panel.css';
      if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
        var tag = document.createElement('style');
        tag.setAttribute('data-plugin-css', tagId);
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }
    }

    function loadLayout() {
      var base = { left: -1, top: -1, width: 0, height: 0 };
      try {
        var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (saved && typeof saved === 'object') {
          if (typeof saved.left === 'number') base.left = saved.left;
          if (typeof saved.top === 'number') base.top = saved.top;
          if (typeof saved.width === 'number') base.width = saved.width;
          if (typeof saved.height === 'number') base.height = saved.height;
        }
      } catch (e) { /* localStorage unavailable */ }
      return base;
    }

    function saveLayout(root) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({
          left: root.offsetLeft,
          top: root.offsetTop,
          width: root.offsetWidth,
          height: root.offsetHeight,
        }));
      } catch (e) { /* localStorage unavailable */ }
    }

    function dotClass(state, err) {
      if (err) return 'hdcp-dot-warn';
      if (state && state.devices && state.devices.length) return 'hdcp-dot-ok';
      return 'hdcp-dot-err';
    }

    function fmtTime(ms) {
      var d = new Date(ms);
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
    }

    function PhoneIcon() {
      return React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        React.createElement('rect', { x: 3.5, y: 1, width: 9, height: 14, rx: 2, stroke: 'currentColor', strokeWidth: 1.2 }),
        React.createElement('line', { x1: 6, y1: 12.5, x2: 10, y2: 12.5, stroke: 'currentColor', strokeWidth: 1.2 })
      );
    }

    // ---- data hook: poll the host REST state (open = fast, closed = slow) ----
    function usePanelData(open) {
      var [state, setState] = React.useState(null);
      var [err, setErr] = React.useState('');
      var [shotBusy, setShotBusy] = React.useState(false);
      var devCount = state && state.devices ? state.devices.length : 0;
      React.useEffect(function () {
        var dead = false;
        function poll() {
          fetch('/api2/hdc-bridge/panel-state')
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (s) { if (!dead) { setErr(''); setState(s); } })
            .catch(function (e) { if (!dead) setErr(String(e && e.message ? e.message : e)); });
        }
        poll();
        var interval = open ? (devCount > 0 ? POLL_FAST : POLL_SLOW) : POLL_CLOSED;
        var t = setInterval(poll, interval);
        return function () { dead = true; clearInterval(t); };
      }, [open, devCount]);
      function refresh(shot, target) {
        if (shot) setShotBusy(true);
        fetch('/api2/hdc-bridge/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shot: !!shot, target: target || '' }) })
          .then(function (r) { return r.json(); })
          .then(function (s) { setErr(''); setState(s); })
          .catch(function (e) { setErr(String(e && e.message ? e.message : e)); })
          .finally(function () { setShotBusy(false); });
      }
      function select(id) {
        fetch('/api2/hdc-bridge/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: id }) })
          .then(function (r) { return r.json(); })
          .then(function (s) { setErr(''); setState(s); })
          .catch(function () { /* next poll heals */ });
      }
      return { state, err, shotBusy, refresh, select };
    }

    // ---- modal panel surface (portal body): drag/resize are direct DOM ----
    function PanelSurface(props) {
      var data = props.data;
      var s = data.state || {};
      var rootRef = React.useRef(null);
      var [shotHidden, setShotHidden] = React.useState(false);
      var [collapsed, setCollapsed] = React.useState(false);
      var drag = React.useRef(null);
      var resize = React.useRef(null);
      var layout = loadLayout();

      React.useEffect(function () {
        var root = rootRef.current;
        if (!root) return;
        var vw = window.innerWidth, vh = window.innerHeight;
        if (layout.left >= 0) root.style.left = Math.max(0, Math.min(vw - root.offsetWidth, layout.left)) + 'px';
        if (layout.top >= 0) root.style.top = Math.max(0, Math.min(vh - 60, layout.top)) + 'px';
        if (layout.width >= 320) root.style.width = layout.width + 'px';
        if (layout.height >= 200) root.style.height = layout.height + 'px';
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      function persist() {
        var root = rootRef.current;
        if (root) saveLayout(root);
      }
      function onHeadPointerDown(e) {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        e.preventDefault();
        var root = rootRef.current;
        drag.current = { sx: e.clientX, sy: e.clientY, left: root.offsetLeft, top: root.offsetTop };
        var move = function (ev) {
          var d = drag.current;
          if (!d) return;
          var nx = Math.max(0, Math.min(window.innerWidth - root.offsetWidth, d.left + (ev.clientX - d.sx)));
          var ny = Math.max(0, Math.min(window.innerHeight - 60, d.top + (ev.clientY - d.sy)));
          root.style.left = nx + 'px';
          root.style.top = ny + 'px';
        };
        var up = function () {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          drag.current = null;
          persist();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }
      function onResizePointerDown(dir) {
        return function (e) {
          e.preventDefault();
          var root = rootRef.current;
          resize.current = { dir: dir, sx: e.clientX, sy: e.clientY, left: root.offsetLeft, top: root.offsetTop, w: root.offsetWidth, h: root.offsetHeight };
          var move = function (ev) {
            var r = resize.current;
            if (!r) return;
            var dx = ev.clientX - r.sx;
            var dy = ev.clientY - r.sy;
            var W = r.w, H = r.h, L = r.left, T = r.top;
            if (dir.indexOf('e') >= 0) W = Math.max(320, r.w + dx);
            if (dir.indexOf('s') >= 0) H = Math.max(200, r.h + dy);
            if (dir.indexOf('w') >= 0) { W = Math.max(320, r.w - dx); L = r.left + (r.w - W); }
            if (dir.indexOf('n') >= 0) { H = Math.max(200, r.h - dy); T = r.top + (r.h - H); }
            root.style.left = L + 'px';
            root.style.top = T + 'px';
            root.style.width = W + 'px';
            root.style.height = H + 'px';
          };
          var up = function () {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            resize.current = null;
            persist();
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        };
      }
      function resetLayout() {
        var root = rootRef.current;
        try { localStorage.removeItem(STORE_KEY); } catch (e) { /* noop */ }
        root.style.left = '';
        root.style.top = '';
        root.style.width = '';
        root.style.height = '';
        setShotHidden(false);
      }
      function onDevClick(e) {
        var shotEl = e.target && e.target.closest ? e.target.closest('.hdcp-dev-shot') : null;
        if (shotEl) {
          var shotId = shotEl.getAttribute('data-shot');
          if (shotId) { setShotHidden(false); data.refresh(true, shotId); }
          return;
        }
        var row = e.target && e.target.closest ? e.target.closest('.hdcp-dev') : null;
        if (!row) return;
        var id = row.getAttribute('data-id');
        if (id) data.select(id);
      }

      var title = '鸿蒙开发面板';
      if (s.hdc) title += ' · ' + s.hdc;

      var tc = s.toolchain || {};
      var badges = [];
      if (s.version) badges.push('<span class="hdcp-tool-badge">v' + s.version + '</span>');
      if (tc.studio) badges.push('<span class="hdcp-tool-badge">Studio ' + tc.studio + '</span>');
      if (tc.sdk) badges.push('<span class="hdcp-tool-badge">SDK API ' + tc.sdk + '</span>');
      badges.push('<span class="hdcp-tool-badge">devecocli ' + (tc.devecocli ? '有' : '无') + '</span>');
      if (tc.knowledge) badges.push('<span class="hdcp-tool-badge">离线知识 ' + tc.knowledge + ' 篇</span>');

      var pref = s.preferred || (s.devices && s.devices[0] && s.devices[0].id) || '';
      var devList = (s.devices || []).slice().sort(function (a, b) {
        if (a.id === s.preferred) return -1;
        if (b.id === s.preferred) return 1;
        return 0;
      });
      var rows = [];
      for (var i = 0; i < devList.length; i++) {
        var d = devList[i];
        var isPref = s.preferred === d.id;
        var subBadges = [];
        if (d.model) subBadges.push('<span class="hdcp-badge">' + d.model + '</span>');
        if (d.apiVersion) subBadges.push('<span class="hdcp-badge">API ' + d.apiVersion + '</span>');
        if (d.battery) {
          var b = d.battery;
          subBadges.push('<span class="hdcp-badge">电池 ' + b.capacity + '%</span>');
          if (b.charging) subBadges.push('<span class="hdcp-badge">充电中</span>');
          if (b.temperature !== null && b.temperature !== undefined) subBadges.push('<span class="hdcp-badge">' + b.temperature + '°C</span>');
        }
        var nameLine = (d.name || d.model || d.id) + ' <span class="hdcp-dev-id">' + d.id + '</span>' + (isPref ? ' <span class="hdcp-badge hdcp-badge-pref">默认</span>' : '');
        rows.push('<div class="hdcp-dev' + (isPref ? ' hdcp-dev-pref' : '') + '" data-id="' + d.id + '" title="点击设为默认设备"><span class="hdcp-dev-state' + (/connected/i.test(d.state) ? ' on' : '') + '"></span><button class="hdcp-dev-shot" data-shot="' + d.id + '" title="截此设备">截图</button><div class="hdcp-dev-main"><div class="hdcp-dev-name">' + nameLine + '</div><div class="hdcp-dev-sub">' + subBadges.join('') + '</div></div></div>');
      }

      var sys = s.system || {};
      var kv = [];
      if (sys.mem && sys.mem.availMB) kv.push('<span>内存可用 ' + sys.mem.availMB + '/' + (sys.mem.totalMB || '?') + ' MB</span>');
      if (sys.storage) kv.push('<span>存储已用 ' + sys.storage.usePct + '</span>');
      if (sys.display) kv.push('<span>分辨率 ' + sys.display.w + '×' + sys.display.h + '</span>');
      var osVer = (s.devices && s.devices.length && (s.devices.find(function (x) { return x.id === pref; }) || s.devices[0]).softwareVersion) || '';
      if (osVer) kv.push('<span>OS ' + osVer + '</span>');

      var shot = s.screenshot && s.screenshot.available && !shotHidden ? s.screenshot : null;
      var logLines = s.hilog && s.hilog.available && s.hilog.lines ? s.hilog.lines : [];

      var head = React.createElement('div', { className: 'hdcp-head', onPointerDown: onHeadPointerDown },
        React.createElement('span', { className: 'hdcp-dot ' + dotClass(s, data.err) }),
        React.createElement('span', { className: 'hdcp-title' }, title),
        React.createElement('button', { className: 'hdcp-btn', onClick: function () { setShotHidden(false); data.refresh(true, ''); }, disabled: data.shotBusy }, data.shotBusy ? '截图…' : '截图'),
        React.createElement('button', { className: 'hdcp-btn', onClick: function () { data.refresh(false, ''); }, disabled: data.shotBusy }, '刷新'),
        React.createElement('button', { className: 'hdcp-btn', onClick: function () { setCollapsed(function (c) { return !c; }); } }, collapsed ? '展开' : '收起'),
        React.createElement('button', { className: 'hdcp-btn', onClick: resetLayout }, '归位'),
        React.createElement('button', { className: 'hdcp-btn', onClick: props.onClose, title: '关闭' }, '×')
      );

      var bodyKids = [];
      if (s.devices && s.devices.length) {
        bodyKids.push(React.createElement('div', { className: 'hdcp-devices', onClick: onDevClick, dangerouslySetInnerHTML: { __html: rows.join('') } }));
        if (kv.length) bodyKids.push(React.createElement('div', { className: 'hdcp-sys', dangerouslySetInnerHTML: { __html: kv.join('') } }));
        if (shot) bodyKids.push(React.createElement('div', { className: 'hdcp-shot' },
          React.createElement('div', { className: 'hdcp-shot-label' }, '截图 @ ' + shot.target),
          React.createElement('img', { src: shot.url, alt: '设备截图' }),
          React.createElement('button', { className: 'hdcp-shot-close', onClick: function () { setShotHidden(true); }, title: '关闭截图' }, '×')
        ));
        if (logLines.length) bodyKids.push(React.createElement('pre', { className: 'hdcp-pre' }, logLines.join(NL)));
        bodyKids.push(React.createElement('div', { className: 'hdcp-foot' }, '更新 ' + fmtTime(s.updatedAt || Date.now())));
      } else {
        bodyKids.push(React.createElement('div', { className: 'hdcp-hint' }, s.error || data.err || '无已连接设备（含连接指引：hdc_connect 127.0.0.1:5555）'));
      }
      if (s.lastError || data.err) bodyKids.push(React.createElement('div', { className: 'hdcp-err' }, s.lastError || data.err || ''));

      var resizeDirs = ['e', 'w', 'n', 's', 'ne', 'nw', 'se', 'sw'];
      var handles = resizeDirs.map(function (dir) {
        return React.createElement('div', { key: dir, className: 'hdcp-resize hdcp-resize-' + dir, onPointerDown: onResizePointerDown(dir) });
      });

      return React.createElement('div', { className: 'hdcp-root', ref: rootRef },
        React.createElement('div', { className: 'hdcp-card' },
          head,
          collapsed ? null : React.createElement('div', { className: 'hdcp-tools', dangerouslySetInnerHTML: { __html: '<span class="hdcp-tools-label">本地工具链</span>' + badges.join('') } }),
          collapsed ? null : React.createElement('div', { className: 'hdcp-body' }, bodyKids),
          handles
        )
      );
    }

    // ---- sidebar footer entry + modal (the remote-control plugin pattern) ----
    function EntryButton(props) {
      var wide = props.wide;
      var [open, setOpen] = React.useState(false);
      var data = usePanelData(open);
      var devCount = data.state && data.state.devices ? data.state.devices.length : 0;
      function close() { setOpen(false); }
      function toggle() { setOpen(function (v) { return !v; }); }
      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button',
          className: 'hdcp-entry',
          'data-wide': wide ? '' : undefined,
          'aria-label': '鸿蒙开发面板',
          'aria-expanded': open,
          title: '鸿蒙开发面板',
          onClick: toggle,
        },
          PhoneIcon(),
          React.createElement('span', { className: 'hdcp-entry-dot ' + dotClass(data.state, data.err) }),
          wide ? React.createElement('span', { className: 'hdcp-entry-label' }, '鸿蒙') : null,
          devCount > 0 ? React.createElement('span', { className: 'hdcp-entry-count' }, devCount > 9 ? '9+' : String(devCount)) : null
        ),
        open ? ReactDOM.createPortal(React.createElement(PanelSurface, { data: data, onClose: close }), document.body) : null
      );
    }

    var inject = ['slots'];
    function apply(ctx) {
      injectStyles();
      ctx.slots.inject('sidebar.footer.action', function () {
        return ctx.slots.register(
          { name: 'sidebar.footer.action', id: 'hdc-bridge', order: 100, label: '鸿蒙开发面板' },
          EntryButton
        );
      });
    }
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
