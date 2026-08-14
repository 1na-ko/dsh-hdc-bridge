// dsh-hdc-bridge browser bundle (v0.6): floating device panel, top-right.
// Draggable by its header, resizable from the bottom-right corner, and
// the screenshot can be closed. Hand-written in the client module format
// (lazy CJS factory registered through window.__ModuleLoader__) - no
// bundler step. Plain DOM + fetch only; no injected services needed.
window.__ModuleLoader__.load({
  id: 'dsh-hdc-bridge',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    var NL = String.fromCharCode(10);
    var CSS = [
      '#hdc-panel-root{position:fixed;top:70px;width:302px;z-index:2147483000;font:12px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--dsw-alias-text-primary,#e9e9ef);}',
      '#hdc-panel-root .hdcp-card{background:var(--dsw-alias-bg-layer-3,#23252c);border:1px solid var(--dsw-alias-border-l2,#3a3d46);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.38);display:flex;flex-direction:column;height:100%;position:relative;overflow:hidden;}',
      '#hdc-panel-root .hdcp-head{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:move;user-select:none;-webkit-user-select:none;touch-action:none;}',
      '#hdc-panel-root .hdcp-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:#8a8f99;}',
      '#hdc-panel-root .hdcp-dot.ok{background:#34c759;}',
      '#hdc-panel-root .hdcp-dot.err{background:#ff5252;}',
      '#hdc-panel-root .hdcp-dot.warn{background:#ffb020;}',
      '#hdc-panel-root .hdcp-title{font-weight:600;flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#hdc-panel-root .hdcp-btn{background:transparent;border:1px solid var(--dsw-alias-border-l2,#3a3d46);border-radius:6px;color:inherit;padding:2px 8px;font:inherit;cursor:pointer;flex:0 0 auto;}',
      '#hdc-panel-root .hdcp-btn:hover{background:var(--dsw-alias-bg-layer-4,#2c2e37);}',
      '#hdc-panel-root .hdcp-btn:disabled{opacity:.5;cursor:default;}',
      '#hdc-panel-root .hdcp-body{padding:10px;border-top:1px solid var(--dsw-alias-border-l2,#3a3d46);flex:1 1 auto;display:flex;flex-direction:column;min-height:0;overflow:auto;}',
      '#hdc-panel-root .hdcp-hint{color:var(--dsw-alias-text-secondary,#9ba0ab);margin:2px 0 6px;}',
      '#hdc-panel-root .hdcp-dev{padding:4px 0;border-bottom:1px dashed var(--dsw-alias-border-l2,#2c2e37);display:flex;align-items:center;gap:6px;}',
      '#hdc-panel-root .hdcp-dev:last-child{border-bottom:none;}',
      '#hdc-panel-root .hdcp-dev-name{font-family:ui-monospace,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;}',
      '#hdc-panel-root .hdcp-badge{background:rgba(90,150,255,.16);color:#7aa7ff;border-radius:4px;padding:0 6px;font-size:11px;flex:0 0 auto;}',
      '#hdc-panel-root .hdcp-shot{margin-top:8px;position:relative;}',
      '#hdc-panel-root .hdcp-shot img{max-width:100%;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#3a3d46);display:block;}',
      '#hdc-panel-root .hdcp-shot-close{position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:14px;line-height:1;cursor:pointer;padding:0;}',
      '#hdc-panel-root .hdcp-shot-close:hover{background:rgba(0,0,0,.75);}',
      '#hdc-panel-root .hdcp-pre{flex:0 0 auto;max-height:160px;overflow:auto;background:#16171c;padding:6px;border-radius:6px;font:10px/1.4 ui-monospace,Consolas,monospace;margin:8px 0 0;white-space:pre-wrap;word-break:break-all;}',
      '#hdc-panel-root.hdcp-sized .hdcp-pre{flex:1 1 auto;max-height:none;min-height:48px;}',
      '#hdc-panel-root .hdcp-foot{color:var(--dsw-alias-text-secondary,#9ba0ab);margin-top:6px;}',
      '#hdc-panel-root .hdcp-err{color:var(--dsw-alias-state-danger-primary,#ff6b6b);margin-top:4px;}',
      '#hdc-panel-root .hdcp-resize{position:absolute;z-index:5;touch-action:none;}',
      '#hdc-panel-root .hdcp-resize-e{right:0;top:10px;bottom:10px;width:8px;cursor:ew-resize;}',
      '#hdc-panel-root .hdcp-resize-w{left:0;top:10px;bottom:10px;width:8px;cursor:ew-resize;}',
      '#hdc-panel-root .hdcp-resize-n{top:0;left:10px;right:10px;height:8px;cursor:ns-resize;}',
      '#hdc-panel-root .hdcp-resize-s{bottom:0;left:10px;right:10px;height:8px;cursor:ns-resize;}',
      '#hdc-panel-root .hdcp-resize-ne{top:0;right:0;width:14px;height:14px;cursor:nesw-resize;}',
      '#hdc-panel-root .hdcp-resize-nw{top:0;left:0;width:14px;height:14px;cursor:nwse-resize;}',
      '#hdc-panel-root .hdcp-resize-se{bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,var(--dsw-alias-border-l2,#3a3d46) 50%);}',
      '#hdc-panel-root .hdcp-resize-sw{bottom:0;left:0;width:14px;height:14px;cursor:nesw-resize;}',
      '#hdc-panel-toast{position:fixed;top:24px;right:24px;z-index:2147483001;padding:10px 14px;border-radius:10px;background:#2c3b57;border:1px solid #4d6ca3;color:#eaf1ff;font:13px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.4);transition:opacity .5s;}',
    ].join('');

    function injectStyles() {
      if (document.getElementById('hdc-panel-style')) return;
      var tag = document.createElement('style');
      tag.id = 'hdc-panel-style';
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function toast() {
      var div = document.createElement('div');
      div.id = 'hdc-panel-toast';
      div.textContent = 'dsh-hdc-bridge 设备面板已挂载';
      div.style.opacity = '0';
      document.body.appendChild(div);
      requestAnimationFrame(() => { div.style.opacity = '1'; });
      setTimeout(() => { div.style.opacity = '0'; }, 4500);
      setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5200);
    }

    function fmtTime(ms) {
      var d = new Date(ms);
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
    }

    function apply(ctx) {
      ctx.effect(() => { injectStyles(); toast(); }, 'hdc-bridge panel: styles + toast');
      ctx.effect(() => {
        var root = document.createElement('div');
        root.id = 'hdc-panel-root';
        document.body.appendChild(root);
        var collapsed = false;
        var shotBusy = false;
        var state = null;
        var shotHidden = false;
        var lastShotAt = 0;
        var resizedH = null;
        var dragInfo = null;
        var resizeInfo = null;
        root.style.left = Math.max(0, window.innerWidth - 302 - 16) + 'px';
        root.innerHTML =
          '<div class="hdcp-card">' +
          '<div class="hdcp-head" id="hdcp-head">' +
          '<span class="hdcp-dot" id="hdcp-dot"></span>' +
          '<span class="hdcp-title">hdc 设备面板</span>' +
          '<button class="hdcp-btn" id="hdcp-shot">截图</button>' +
          '<button class="hdcp-btn" id="hdcp-refresh">刷新</button>' +
          '<button class="hdcp-btn" id="hdcp-collapse">收起</button>' +
          '</div>' +
          '<div class="hdcp-body" id="hdcp-body">' +
          '<div class="hdcp-hint">正在获取设备状态…</div>' +
          '<div id="hdcp-devices"></div>' +
          '<div class="hdcp-shot" id="hdcp-shotbox"></div>' +
          '<pre class="hdcp-pre" id="hdcp-pre" style="display:none"></pre>' +
          '<div class="hdcp-foot"></div>' +
          '<div class="hdcp-err" id="hdcp-err"></div>' +
          '</div>' +
          '<div class="hdcp-resize hdcp-resize-e" data-dir="e"></div>' +
          '<div class="hdcp-resize hdcp-resize-w" data-dir="w"></div>' +
          '<div class="hdcp-resize hdcp-resize-n" data-dir="n"></div>' +
          '<div class="hdcp-resize hdcp-resize-s" data-dir="s"></div>' +
          '<div class="hdcp-resize hdcp-resize-ne" data-dir="ne"></div>' +
          '<div class="hdcp-resize hdcp-resize-nw" data-dir="nw"></div>' +
          '<div class="hdcp-resize hdcp-resize-se" data-dir="se"></div>' +
          '<div class="hdcp-resize hdcp-resize-sw" data-dir="sw"></div>' +
          '</div>';
        var head = root.querySelector('#hdcp-head');
        var dot = root.querySelector('#hdcp-dot');
        var body = root.querySelector('#hdcp-body');
        var hint = root.querySelector('.hdcp-hint');
        var devBox = root.querySelector('#hdcp-devices');
        var shotBox = root.querySelector('#hdcp-shotbox');
        var pre = root.querySelector('#hdcp-pre');
        var foot = root.querySelector('.hdcp-foot');
        var errBox = root.querySelector('#hdcp-err');
        var shotBtn = root.querySelector('#hdcp-shot');
        var refreshBtn = root.querySelector('#hdcp-refresh');
        var collapseBtn = root.querySelector('#hdcp-collapse');
        var resizeHandles = root.querySelectorAll('.hdcp-resize');

        // ---- drag by header ----
        head.addEventListener('pointerdown', function (e) {
          if (e.target && e.target.closest && e.target.closest('.hdcp-btn')) return;
          dragInfo = { sx: e.clientX, sy: e.clientY, left: root.offsetLeft, top: root.offsetTop };
          try { head.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
          e.preventDefault();
        });
        head.addEventListener('pointermove', function (e) {
          if (!dragInfo) return;
          var nx = dragInfo.left + (e.clientX - dragInfo.sx);
          var ny = dragInfo.top + (e.clientY - dragInfo.sy);
          nx = Math.max(-root.offsetWidth + 80, Math.min(window.innerWidth - 80, nx));
          ny = Math.max(0, Math.min(window.innerHeight - 60, ny));
          root.style.left = nx + 'px';
          root.style.top = ny + 'px';
        });
        head.addEventListener('pointerup', function () { dragInfo = null; });
        head.addEventListener('pointercancel', function () { dragInfo = null; });

        // ---- 8-way resize: every edge and corner ----
        function applyResize(e) {
          if (!resizeInfo) return;
          var dir = resizeInfo.dir;
          var dx = e.clientX - resizeInfo.sx;
          var dy = e.clientY - resizeInfo.sy;
          var L = resizeInfo.left;
          var T = resizeInfo.top;
          var W = resizeInfo.w;
          var H = resizeInfo.h;
          if (dir.indexOf('e') >= 0) W = Math.max(240, resizeInfo.w + dx);
          if (dir.indexOf('s') >= 0) H = Math.max(160, resizeInfo.h + dy);
          if (dir.indexOf('w') >= 0) { W = Math.max(240, resizeInfo.w - dx); L = resizeInfo.left + (resizeInfo.w - W); }
          if (dir.indexOf('n') >= 0) { H = Math.max(160, resizeInfo.h - dy); T = resizeInfo.top + (resizeInfo.h - H); }
          root.style.left = L + 'px';
          root.style.top = T + 'px';
          root.style.width = W + 'px';
          root.style.height = H + 'px';
          resizedH = H + 'px';
          root.classList.add('hdcp-sized');
        }
        for (var hi = 0; hi < resizeHandles.length; hi++) {
          (function (handle) {
            handle.addEventListener('pointerdown', function (e) {
              resizeInfo = { dir: handle.getAttribute('data-dir') || 'se', sx: e.clientX, sy: e.clientY, left: root.offsetLeft, top: root.offsetTop, w: root.offsetWidth, h: root.offsetHeight };
              try { handle.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
              e.preventDefault();
            });
            handle.addEventListener('pointermove', applyResize);
            handle.addEventListener('pointerup', function () { resizeInfo = null; });
            handle.addEventListener('pointercancel', function () { resizeInfo = null; });
          })(resizeHandles[hi]);
        }

        function render(s, err) {
          state = s;
          if (s) {
            var hasErr = !!s.error || !!s.lastError;
            dot.className = 'hdcp-dot' + (hasErr ? ' warn' : (s.devices && s.devices.length ? ' ok' : ' err'));
            var title = 'hdc 设备面板';
            if (s.hdc) title += ' · ' + s.hdc;
            if (s.devices && s.devices.length) title += ' (' + s.devices.length + ')';
            root.querySelector('.hdcp-title').textContent = title;
            hint.style.display = s.devices && s.devices.length ? 'none' : 'block';
            hint.textContent = s.error || '无已连接设备（含连接指引：hdc_connect 127.0.0.1:5555）';
            var rows = [];
            for (var i = 0; i < (s.devices || []).length; i++) {
              var d = s.devices[i];
              var badge = d.model ? d.model + (d.apiVersion ? ' · API ' + d.apiVersion : '') : (d.apiVersion ? 'API ' + d.apiVersion : '');
              rows.push('<div class="hdcp-dev"><span class="hdcp-dev-name">' + d.id + '</span>' + (badge ? '<span class="hdcp-badge">' + badge + '</span>' : '') + '</div>');
            }
            devBox.innerHTML = rows.join('');
            if (s.screenshot && s.screenshot.available) {
              if (s.screenshot.at !== lastShotAt) { lastShotAt = s.screenshot.at; shotHidden = false; }
              if (!shotHidden) {
                var img = shotBox.querySelector('img');
                if (!img) {
                  img = document.createElement('img');
                  shotBox.appendChild(img);
                  var closeBtn = document.createElement('button');
                  closeBtn.className = 'hdcp-shot-close';
                  closeBtn.type = 'button';
                  closeBtn.title = '关闭截图';
                  closeBtn.textContent = '×';
                  shotBox.appendChild(closeBtn);
                  closeBtn.addEventListener('click', function () { shotHidden = true; shotBox.innerHTML = ''; });
                }
                img.src = s.screenshot.url + '&r=' + Date.now();
              }
            } else if (!shotBusy) {
              shotBox.innerHTML = '';
            }
            if (s.hilog && s.hilog.available && s.hilog.lines.length) {
              pre.style.display = 'block';
              pre.textContent = s.hilog.lines.join(NL);
            } else { pre.style.display = 'none'; }
            foot.textContent = '更新 ' + fmtTime(s.updatedAt);
            errBox.textContent = s.lastError || '';
          } else if (err) {
            dot.className = 'hdcp-dot err';
            hint.textContent = '面板数据通道不可用：host 半边需 0.6.0（升级插件或重启 DSH 后生效）';
            errBox.textContent = err;
          }
        }

        function postRefresh(shot) {
          if (shot) { shotBusy = true; shotBtn.disabled = true; shotBtn.textContent = '截图…'; }
          else { refreshBtn.disabled = true; refreshBtn.textContent = '刷新…'; }
          fetch(currentBase() + '/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shot: !!shot }) })
            .then((r) => r.json())
            .then((s) => { render(s); })
            .catch((e) => { render(state, String(e && e.message ? e.message : e)); })
            .finally(() => {
              shotBusy = false; shotBtn.disabled = false; shotBtn.textContent = '截图';
              refreshBtn.disabled = false; refreshBtn.textContent = '刷新';
            });
        }

        var bases = ['/api2/hdc-bridge', '/api2/hdc-panel-live'];
        var baseIdx = 0;
        var baseLocked = false;
        function currentBase() { return bases[baseIdx]; }
        function advanceBase() {
          if (baseLocked) return;
          if (baseIdx + 1 < bases.length) baseIdx += 1;
        }
        function poll() {
          var url = currentBase() + '/panel-state';
          fetch(url)
            .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then((s) => { baseLocked = true; render(s); })
            .catch((e) => { advanceBase(); render(state, String(e && e.message ? e.message : e)); });
        }

        shotBtn.addEventListener('click', () => postRefresh(true));
        refreshBtn.addEventListener('click', () => postRefresh(false));
        collapseBtn.addEventListener('click', () => {
          collapsed = !collapsed;
          if (collapsed) { if (root.style.height) resizedH = root.style.height; root.style.height = 'auto'; }
          else if (resizedH) { root.style.height = resizedH; }
          body.style.display = collapsed ? 'none' : 'block';
          collapseBtn.textContent = collapsed ? '展开' : '收起';
        });
        poll();
        var timer = setInterval(poll, 8000);
        return () => { clearInterval(timer); if (root.parentNode) root.parentNode.removeChild(root); };
      }, 'hdc-bridge panel: mount');
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
