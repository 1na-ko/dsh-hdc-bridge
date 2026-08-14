// dsh-hdc-bridge browser bundle: floating dev panel, top-right.
// Shows the WHOLE plugin: toolchain badges, device detail (name/brand/OS/
// battery), system stats, per-device screenshots, hilog tail. Draggable by
// its header, 8-way resizable, screenshot closable. Hand-written in the
// client module format (window.__ModuleLoader__); plain DOM + fetch only.
window.__ModuleLoader__.load({
  id: 'dsh-hdc-bridge',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    var NL = String.fromCharCode(10);
    var CSS = [
      '#hdc-panel-root{position:fixed;top:70px;width:330px;z-index:2147483000;font:12px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--dsw-alias-text-primary,#e9e9ef);}',
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
      '#hdc-panel-root .hdcp-tools{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px 8px;border-top:1px solid var(--dsw-alias-border-l2,#3a3d46);}',
      '#hdc-panel-root .hdcp-tool-badge{background:rgba(90,150,255,.12);color:#8fb3f5;border-radius:4px;padding:1px 7px;font-size:11px;}',
      '#hdc-panel-root .hdcp-body{padding:10px;border-top:1px solid var(--dsw-alias-border-l2,#3a3d46);flex:1 1 auto;display:flex;flex-direction:column;min-height:0;overflow:auto;}',
      '#hdc-panel-root .hdcp-hint{color:var(--dsw-alias-text-secondary,#9ba0ab);margin:2px 0 6px;}',
      '#hdc-panel-root .hdcp-dev{padding:5px 4px;border-bottom:1px dashed var(--dsw-alias-border-l2,#2c2e37);display:flex;align-items:flex-start;gap:6px;cursor:pointer;border-radius:4px;}',
      '#hdc-panel-root .hdcp-dev:hover{background:rgba(255,255,255,.05);}',
      '#hdc-panel-root .hdcp-dev-pref{background:rgba(90,150,255,.10);}',
      '#hdc-panel-root .hdcp-dev-main{flex:1 1 auto;min-width:0;}',
      '#hdc-panel-root .hdcp-dev-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#hdc-panel-root .hdcp-dev-id{font-family:ui-monospace,Consolas,monospace;color:var(--dsw-alias-text-secondary,#9ba0ab);font-size:11px;}',
      '#hdc-panel-root .hdcp-dev-sub{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;}',
      '#hdc-panel-root .hdcp-dev-shot{flex:0 0 auto;background:transparent;border:1px solid var(--dsw-alias-border-l2,#3a3d46);border-radius:6px;color:inherit;padding:2px 7px;font:inherit;font-size:11px;cursor:pointer;margin-top:1px;}',
      '#hdc-panel-root .hdcp-dev-shot:hover{background:var(--dsw-alias-bg-layer-4,#2c2e37);}',
      '#hdc-panel-root .hdcp-badge{background:rgba(90,150,255,.16);color:#7aa7ff;border-radius:4px;padding:0 6px;font-size:11px;}',
      '#hdc-panel-root .hdcp-badge-pref{background:rgba(52,199,89,.20);color:#5dd37c;}',
      '#hdc-panel-root .hdcp-sys{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin:8px 0;padding:6px 8px;background:rgba(255,255,255,.03);border-radius:6px;color:var(--dsw-alias-text-secondary,#9ba0ab);font-size:11px;}',
      '#hdc-panel-root .hdcp-shot{margin-top:8px;position:relative;}',
      '#hdc-panel-root .hdcp-shot img{max-width:100%;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#3a3d46);display:block;}',
      '#hdc-panel-root .hdcp-shot-label{font-size:11px;color:var(--dsw-alias-text-secondary,#9ba0ab);margin-bottom:2px;}',
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
      '#hdc-panel-root .hdcp-resize-se{bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;}',
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
      div.textContent = 'dsh-hdc-bridge 开发面板已挂载';
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
        root.style.left = Math.max(0, window.innerWidth - 330 - 16) + 'px';
        root.innerHTML =
          '<div class="hdcp-card">' +
          '<div class="hdcp-head" id="hdcp-head">' +
          '<span class="hdcp-dot" id="hdcp-dot"></span>' +
          '<span class="hdcp-title">鸿蒙开发面板</span>' +
          '<button class="hdcp-btn" id="hdcp-shot">截图</button>' +
          '<button class="hdcp-btn" id="hdcp-refresh">刷新</button>' +
          '<button class="hdcp-btn" id="hdcp-collapse">收起</button>' +
          '</div>' +
          '<div class="hdcp-tools" id="hdcp-tools"></div>' +
          '<div class="hdcp-body" id="hdcp-body">' +
          '<div class="hdcp-hint">正在获取设备状态…</div>' +
          '<div id="hdcp-devices"></div>' +
          '<div class="hdcp-sys" id="hdcp-sys" style="display:none"></div>' +
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
        var toolsBox = root.querySelector('#hdcp-tools');
        var body = root.querySelector('#hdcp-body');
        var hint = root.querySelector('.hdcp-hint');
        var devBox = root.querySelector('#hdcp-devices');
        var sysBox = root.querySelector('#hdcp-sys');
        var shotBox = root.querySelector('#hdcp-shotbox');
        var pre = root.querySelector('#hdcp-pre');
        var foot = root.querySelector('.hdcp-foot');
        var errBox = root.querySelector('#hdcp-err');
        var shotBtn = root.querySelector('#hdcp-shot');
        var refreshBtn = root.querySelector('#hdcp-refresh');
        var collapseBtn = root.querySelector('#hdcp-collapse');
        var resizeHandles = root.querySelectorAll('.hdcp-resize');

        head.addEventListener('pointerdown', function (e) {
          if (e.target && e.target.closest && e.target.closest('.hdcp-btn')) return;
          dragInfo = { sx: e.clientX, sy: e.clientY, left: root.offsetLeft, top: root.offsetTop };
          try { head.setPointerCapture(e.pointerId); } catch (err) { }
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
              try { handle.setPointerCapture(e.pointerId); } catch (err) { }
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
            var title = '鸿蒙开发面板';
            if (s.hdc) title += ' · ' + s.hdc;
            root.querySelector('.hdcp-title').textContent = title;
            var tc = s.toolchain || {};
            var badges = [];
            if (tc.studio) badges.push('<span class="hdcp-tool-badge">Studio ' + tc.studio + '</span>');
            if (tc.sdk) badges.push('<span class="hdcp-tool-badge">SDK API ' + tc.sdk + '</span>');
            badges.push('<span class="hdcp-tool-badge">devecocli ' + (tc.devecocli ? '有' : '无') + '</span>');
            if (tc.knowledge) badges.push('<span class="hdcp-tool-badge">知识 ' + tc.knowledge + ' 题</span>');
            toolsBox.innerHTML = badges.join('');
            hint.style.display = s.devices && s.devices.length ? 'none' : 'block';
            hint.textContent = s.error || '无已连接设备（含连接指引：hdc_connect 127.0.0.1:5555）';
            var pref = s.preferred || (s.devices && s.devices[0] && s.devices[0].id) || '';
            var rows = [];
            for (var i = 0; i < (s.devices || []).length; i++) {
              var d = s.devices[i];
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
              rows.push('<div class="hdcp-dev' + (isPref ? ' hdcp-dev-pref' : '') + '" data-id="' + d.id + '" title="点击设为默认设备"><button class="hdcp-dev-shot" data-shot="' + d.id + '" title="截此设备">截</button><div class="hdcp-dev-main"><div class="hdcp-dev-name">' + nameLine + '</div><div class="hdcp-dev-sub">' + subBadges.join('') + '</div></div></div>');
            }
            devBox.innerHTML = rows.join('');
            var sys = s.system || {};
            var kv = [];
            if (sys.mem && sys.mem.availMB) kv.push('<span>内存可用 ' + sys.mem.availMB + '/' + (sys.mem.totalMB || '?') + ' MB</span>');
            if (sys.storage) kv.push('<span>存储已用 ' + sys.storage.usePct + '</span>');
            if (sys.display) kv.push('<span>分辨率 ' + sys.display.w + '×' + sys.display.h + '</span>');
            var osVer = (s.devices && s.devices.length && (s.devices.find(function (x) { return x.id === pref; }) || s.devices[0]).softwareVersion) || '';
            if (osVer) kv.push('<span>OS ' + osVer + '</span>');
            sysBox.style.display = kv.length ? 'grid' : 'none';
            sysBox.innerHTML = kv.join('');
            if (s.screenshot && s.screenshot.available) {
              if (s.screenshot.at !== lastShotAt) { lastShotAt = s.screenshot.at; shotHidden = false; }
              if (!shotHidden) {
                var img = shotBox.querySelector('img');
                var label = shotBox.querySelector('.hdcp-shot-label');
                if (!img) {
                  label = document.createElement('div');
                  label.className = 'hdcp-shot-label';
                  shotBox.appendChild(label);
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
                label.textContent = '截图 @ ' + s.screenshot.target;
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
            hint.textContent = '面板数据通道不可用：host 半边需升级插件（重启 DSH 后生效）';
            errBox.textContent = err;
          }
        }

        function postRefresh(shot, target) {
          if (shot) { shotBusy = true; shotBtn.disabled = true; shotBtn.textContent = '截图…'; }
          else { refreshBtn.disabled = true; refreshBtn.textContent = '刷新…'; }
          fetch(currentBase() + '/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shot: !!shot, target: target || '' }) })
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

        devBox.addEventListener('click', function (e) {
          var shotEl = e.target && e.target.closest ? e.target.closest('.hdcp-dev-shot') : null;
          if (shotEl) {
            var shotId = shotEl.getAttribute('data-shot');
            if (shotId) postRefresh(true, shotId);
            return;
          }
          var row = e.target && e.target.closest ? e.target.closest('.hdcp-dev') : null;
          if (!row) return;
          var id = row.getAttribute('data-id');
          if (!id) return;
          fetch(currentBase() + '/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: id }) })
            .then(function (r) { return r.json(); })
            .then(function (s) { baseLocked = true; render(s); })
            .catch(function () { poll(); });
        });
        shotBtn.addEventListener('click', () => postRefresh(true, ''));
        refreshBtn.addEventListener('click', () => postRefresh(false, ''));
        collapseBtn.addEventListener('click', () => {
          collapsed = !collapsed;
          if (collapsed) { if (root.style.height) resizedH = root.style.height; root.style.height = 'auto'; }
          else if (resizedH) { root.style.height = resizedH; }
          body.style.display = collapsed ? 'none' : 'block';
          toolsBox.style.display = collapsed ? 'none' : 'flex';
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
