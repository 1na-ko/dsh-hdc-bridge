// dsh-hdc-bridge browser bundle — official client-plugin shape:
// a React surface registered into the platform `shell.overlay` slot
// (frame-wide floating layer, declared by client-ui-layout), themed with
// the official `--dsw-alias-*` tokens, styled via the official
// `style[data-plugin-css]` injection convention. No wild DOM: the platform
// renders, layers, unloads and re-renders us like any shipped surface.
//
// Data comes from the host half's read-only REST routes (/api2/hdc-bridge/*).
// The panel defaults to hidden; the bottom-left FAB toggles it and the
// visibility persists. Hidden = 60s slow poll (FAB dot stays fresh),
// visible = 8s/20s backoff. Drag/resize persist through localStorage.
window.__ModuleLoader__.load({
  id: 'dsh-hdc-bridge',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    var React = require('react');
    var NL = String.fromCharCode(10);
    var STORE_KEY = 'dsh-hdc-bridge-panel-v2';
    var POLL_FAST = 8000;
    var POLL_SLOW = 20000;
    var POLL_HIDDEN = 60000;

    var CSS = [
      '.hdcp-layer{position:fixed;inset:0;pointer-events:none;z-index:0;}',
      '.hdcp-fab{position:fixed;left:16px;bottom:16px;pointer-events:auto;width:46px;height:46px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2,#3a3d46);background:var(--dsw-alias-button-floating-fill,#23252c);color:var(--dsw-alias-label-primary,#e9e9ef);cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:13px/1 system-ui,-apple-system,Segoe UI,sans-serif;padding:0;}',
      '.hdcp-fab:hover{background:var(--dsw-alias-button-floating-hover,#2c2e37);}',
      '.hdcp-fab-on{border-color:var(--dsw-alias-brand-primary,#3d7bfd);}',
      '.hdcp-fab-dot{position:absolute;top:2px;right:2px;width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-label-quaternary,#8a8f99);border:2px solid var(--dsw-alias-bg-layer-3,#23252c);}',
      '.hdcp-dot-ok{background:var(--dsw-alias-state-success-primary,#34c759);}',
      '.hdcp-dot-err{background:var(--dsw-alias-state-error-primary,#ff5252);}',
      '.hdcp-dot-warn{background:var(--dsw-alias-state-warn-primary,#ffb020);}',
      '.hdcp-fab-badge{position:absolute;bottom:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--dsw-alias-brand-primary,#3d7bfd);color:var(--dsw-alias-label-primary-inverted,#fff);font-size:10px;line-height:16px;text-align:center;}',
      '.hdcp-root{position:fixed;top:70px;right:16px;width:330px;pointer-events:auto;font:12px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--dsw-alias-label-primary,#e9e9ef);}',
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
      '.hdcp-body{padding:10px;border-top:1px solid var(--dsw-alias-border-l2,#3a3d46);flex:1 1 auto;display:flex;flex-direction:column;min-height:0;overflow:auto;}',
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
      '.hdcp-pre{flex:0 0 auto;max-height:160px;overflow:auto;background:var(--dsw-alias-markdown-code-block,#16171c);padding:6px;border-radius:6px;font:10px/1.4 ui-monospace,Consolas,monospace;margin:8px 0 0;white-space:pre-wrap;word-break:break-all;}',
      '.hdcp-foot{color:var(--dsw-alias-label-tertiary,#9ba0ab);margin-top:6px;}',
      '.hdcp-err{color:var(--dsw-alias-state-error-primary,#ff6b6b);margin-top:4px;}',
      '.hdcp-resize{position:absolute;z-index:5;touch-action:none;}',
      '.hdcp-resize-e{right:0;top:10px;bottom:10px;width:8px;cursor:ew-resize;}',
      '.hdcp-resize-w{left:0;top:10px;bottom:10px;width:8px;cursor:ew-resize;}',
      '.hdcp-resize-n{top:0;left:10px;right:10px;height:8px;cursor:ns-resize;}',
      '.hdcp-resize-s{bottom:0;left:10px;right:10px;height:8px;cursor:ns-resize;}',
      '.hdcp-resize-ne{top:0;right:0;width:14px;height:14px;cursor:nesw-resize;}',
      '.hdcp-resize-nw{top:0;left:0;width:14px;height:14px;cursor:nwse-resize;}',
      '.hdcp-resize-se{bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;}',
      '.hdcp-resize-sw{bottom:0;left:0;width:14px;height:14px;cursor:nesw-resize;}',
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
      var base = { visible: false, left: -1, top: -1, width: 0, height: 0, collapsed: false };
      try {
        var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (saved && typeof saved === 'object') {
          if (saved.visible === true) base.visible = true;
          if (saved.collapsed === true) base.collapsed = true;
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
        var prev = loadLayout();
        localStorage.setItem(STORE_KEY, JSON.stringify({
          visible: prev.visible,
          collapsed: prev.collapsed,
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

    // ---- data hook: poll the host REST state (visible = fast, hidden = slow) ----
    function usePanelData(visible) {
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
        var interval = visible ? (devCount > 0 ? POLL_FAST : POLL_SLOW) : POLL_HIDDEN;
        var t = setInterval(poll, interval);
        return function () { dead = true; clearInterval(t); };
      }, [visible, devCount]);
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

    // ---- panel surface: drag/resize are direct DOM (position persists) ----
    function PanelSurface(props) {
      var data = props.data;
      var layout = props.layout;
      var s = data.state || {};
      var rootRef = React.useRef(null);
      var [collapsed, setCollapsed] = React.useState(layout.collapsed === true);
      var [shotHidden, setShotHidden] = React.useState(false);
      var drag = React.useRef(null);
      var resize = React.useRef(null);

      React.useEffect(function () {
        var root = rootRef.current;
        if (!root) return;
        var vw = window.innerWidth, vh = window.innerHeight;
        if (layout.left >= 0) root.style.left = Math.max(-200, Math.min(vw - 60, layout.left)) + 'px';
        if (layout.top >= 0) root.style.top = Math.max(0, Math.min(vh - 40, layout.top)) + 'px';
        if (layout.width >= 240) root.style.width = layout.width + 'px';
        if (layout.height >= 160) root.style.height = layout.height + 'px';
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      function persist() {
        var root = rootRef.current;
        if (root) saveLayout(root);
      }
      function clampMove(nx, ny) {
        var root = rootRef.current;
        nx = Math.max(-root.offsetWidth + 80, Math.min(window.innerWidth - 80, nx));
        ny = Math.max(0, Math.min(window.innerHeight - 60, ny));
        return [nx, ny];
      }
      function onHeadPointerDown(e) {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        var root = rootRef.current;
        drag.current = { sx: e.clientX, sy: e.clientY, left: root.offsetLeft, top: root.offsetTop };
        var move = function (ev) {
          var d = drag.current;
          if (!d) return;
          var pos = clampMove(d.left + (ev.clientX - d.sx), d.top + (ev.clientY - d.sy));
          root.style.left = pos[0] + 'px';
          root.style.top = pos[1] + 'px';
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
          var root = rootRef.current;
          resize.current = { dir: dir, sx: e.clientX, sy: e.clientY, left: root.offsetLeft, top: root.offsetTop, w: root.offsetWidth, h: root.offsetHeight };
          var move = function (ev) {
            var r = resize.current;
            if (!r) return;
            var dx = ev.clientX - r.sx;
            var dy = ev.clientY - r.sy;
            var W = r.w, H = r.h, L = r.left, T = r.top;
            if (dir.indexOf('e') >= 0) W = Math.max(240, r.w + dx);
            if (dir.indexOf('s') >= 0) H = Math.max(160, r.h + dy);
            if (dir.indexOf('w') >= 0) { W = Math.max(240, r.w - dx); L = r.left + (r.w - W); }
            if (dir.indexOf('n') >= 0) { H = Math.max(160, r.h - dy); T = r.top + (r.h - H); }
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
        root.style.left = Math.max(0, window.innerWidth - 330 - 16) + 'px';
        root.style.top = '70px';
        root.style.width = '330px';
        root.style.height = 'auto';
        setCollapsed(false);
        persist();
      }
      function toggleCollapse() {
        setCollapsed(function (c) {
          var nc = !c;
          var prev = loadLayout();
          prev.collapsed = nc;
          try { localStorage.setItem(STORE_KEY, JSON.stringify(prev)); } catch (e) { /* noop */ }
          return nc;
        });
      }
      function onDevClick(e) {
        var shotEl = e.target && e.target.closest ? e.target.closest('.hdcp-dev-shot') : null;
        if (shotEl) {
          var shotId = shotEl.getAttribute('data-shot');
          if (shotId) data.refresh(true, shotId);
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
        React.createElement('button', { className: 'hdcp-btn', onClick: function () { data.refresh(true, ''); }, disabled: data.shotBusy }, '截图'),
        React.createElement('button', { className: 'hdcp-btn', onClick: function () { data.refresh(false, ''); }, disabled: data.shotBusy }, '刷新'),
        React.createElement('button', { className: 'hdcp-btn', onClick: toggleCollapse }, collapsed ? '展开' : '收起'),
        React.createElement('button', { className: 'hdcp-btn', onClick: resetLayout }, '归位')
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
          React.createElement('div', { className: 'hdcp-tools', dangerouslySetInnerHTML: { __html: '<span class="hdcp-tools-label">本地工具链</span>' + badges.join('') } }),
          collapsed ? null : React.createElement('div', { className: 'hdcp-body' }, bodyKids),
          handles
        )
      );
    }

    function PanelRoot() {
      var [layout] = React.useState(loadLayout);
      var [visible, setVisible] = React.useState(layout.visible === true);
      var data = usePanelData(visible);
      function toggle() {
        setVisible(function (v) {
          var nv = !v;
          var prev = loadLayout();
          prev.visible = nv;
          try { localStorage.setItem(STORE_KEY, JSON.stringify(prev)); } catch (e) { /* noop */ }
          return nv;
        });
      }
      var devCount = data.state && data.state.devices ? data.state.devices.length : 0;
      var badge = devCount > 0 ? React.createElement('span', { className: 'hdcp-fab-badge' }, devCount > 9 ? '9+' : String(devCount)) : null;
      return React.createElement('div', { className: 'hdcp-layer' },
        React.createElement('button', {
          className: 'hdcp-fab' + (visible ? ' hdcp-fab-on' : ''),
          onClick: toggle,
          title: visible ? '收起鸿蒙开发面板' : '展开鸿蒙开发面板',
          'aria-pressed': visible,
        },
          React.createElement('span', { className: 'hdcp-fab-dot ' + dotClass(data.state, data.err) }),
          React.createElement('span', null, '鸿蒙'),
          badge
        ),
        visible ? React.createElement(PanelSurface, { data: data, layout: layout }) : null
      );
    }

    var inject = ['slots'];
    function apply(ctx) {
      injectStyles();
      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register(
          { name: 'shell.overlay', id: 'hdc-bridge', order: 100, label: '鸿蒙开发面板' },
          PanelRoot
        );
      });
    }
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
