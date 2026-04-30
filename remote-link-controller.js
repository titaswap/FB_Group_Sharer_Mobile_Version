/**
 * ================================================================
 * REMOTE LINK CONTROLLER
 * ================================================================
 * Feature: Control which Facebook post URL gets shared next
 * by editing a Google Sheet — no need to open the extension.
 *
 * How it works:
 *   1. Enable "Remote Sheet Control" in the panel
 *   2. Create a Google Sheet tab named "Remote" (configurable)
 *   3. Add Facebook URLs in Column A (row 1 = header, optional)
 *   4. Put "active" in Column B next to the link you want to share
 *   5. On each schedule run, extension fetches the sheet and uses
 *      the FIRST row where Column B = "active"
 *   6. Update the sheet from anywhere (phone, tablet, etc.) to
 *      change what gets shared next — extension picks it up live
 *
 * Priority order in background.js:
 *   Remote Control (if enabled + link found)
 *     → Rotator (if enabled + has links)
 *       → Manual URL from config
 *
 * Storage keys:
 *   remoteCtrlEnabled   : boolean
 *   remoteCtrlConfig    : {
 *       sheetTab     : string  (default: "Remote")
 *       urlColIdx    : number  (default: 0 = Column A)
 *       markerColIdx : number  (default: 1 = Column B)
 *       markerValue  : string  (default: "active")
 *       skipHeader   : boolean (default: true — skip row 0)
 *   }
 *
 * Public API (window.RemoteLinkController):
 *   .isEnabled()          — true if remote control is on
 *   .getConfig()          — returns current config object
 *   .testFetch(cb)        — fetch sheet now, call cb({ok,url,error})
 *   .init()               — call once on DOMContentLoaded
 */

(function () {
    'use strict';

    // ── CONSTANTS ────────────────────────────────────────────────
    const SK_ENABLED = 'remoteCtrlEnabled';
    const SK_CONFIG  = 'remoteCtrlConfig';

    const DEFAULT_CONFIG = {
        sheetTab:     'Remote',
        urlColIdx:    0,   // Column A = 0
        markerColIdx: 1,   // Column B = 1
        markerValue:  'active',
        skipHeader:   true
    };

    // ── STATE ────────────────────────────────────────────────────
    let _enabled  = false;
    let _isCollapsed = false; // New explicitly tracked state for accordion
    let _config   = { ...DEFAULT_CONFIG };

    // ── STORAGE HELPERS ──────────────────────────────────────────
    function get(keys, cb) { chrome.storage.local.get(keys, cb); }
    function set(obj, cb)  { chrome.storage.local.set(obj, cb || (() => {})); }

    function _loadState(cb) {
        get([SK_ENABLED, SK_CONFIG], res => {
            _enabled = res[SK_ENABLED] || false;
            _config  = { ...DEFAULT_CONFIG, ...(res[SK_CONFIG] || {}) };
            if (cb) cb();
        });
    }

    // ── PUBLIC API ───────────────────────────────────────────────
    window.RemoteLinkController = {

        isEnabled() { return _enabled; },

        getConfig() { return { ..._config }; },

        /**
         * Test-fetch — calls cb({ ok, urls[], currentIdx, nextUrl, error })
         */
        testFetch(cb) {
            _fetchActiveUrls((urls, err, shortLinksPool) => {
                if (err)           { cb({ ok: false, urls: [], error: err, shortLinksPool: [] }); return; }
                if (urls.length === 0) { cb({ ok: false, urls: [], error: null, shortLinksPool: shortLinksPool || [] }); return; }
                // Determine which URL would be used next (based on current stored index)
                chrome.storage.local.get(['remoteCtrlIndex'], res => {
                    const idx     = (res.remoteCtrlIndex || 0) % urls.length;
                    const nextUrl = urls[idx];
                    cb({ ok: true, urls, currentIdx: idx, nextUrl, error: null, shortLinksPool: shortLinksPool || [] });
                });
            });
        },

        init() {
            console.log('[RCLR] init() called');
            _injectUI();
            _loadState(() => {
                console.log('[RCLR] State loaded — enabled:', _enabled, '| config:', _config);
                _syncUI();
                // Delayed re-sync: ensures RCLR wins the race if MLR restores the
                // input after us on extension open (both load async from storage)
                setTimeout(_syncMainLinkInput, 250);
            });
            _bindEvents();
        }
    };

    // ── SHEET FETCH LOGIC ─────────────────────────────────────────
    /**
     * Fetches all "active" URLs from the sheet.
     * Calls cb(activeUrls[], error) — activeUrls may be empty [].
     */
    function _fetchActiveUrls(cb) {
        get(['settings_sheet_url'], async res => {
            const sheetUrl = res.settings_sheet_url;
            if (!sheetUrl) { cb([], 'Sheet URL not set in Settings.'); return; }

            let sheetId = '';
            try {
                const u = new URL(sheetUrl);
                const parts = u.pathname.split('/');
                const di = parts.indexOf('d');
                if (di === -1 || di + 1 >= parts.length) throw new Error();
                sheetId = parts[di + 1];
            } catch {
                cb([], 'Invalid Google Sheet URL in Settings.');
                return;
            }

            const cfg = _config;
            const apiUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(cfg.sheetTab)}&headers=0`;

            try {
                const resp = await fetch(apiUrl);
                let text = await resp.text();

                const prefix = 'google.visualization.Query.setResponse(';
                const pi = text.indexOf(prefix);
                if (pi === -1) throw new Error('Could not parse sheet. Is it Public?');
                text = text.substring(pi + prefix.length, text.lastIndexOf(')'));

                const json = JSON.parse(text);
                if (json.status === 'error') throw new Error(json.errors[0].message);

                let rows = json.table.rows || [];
                if (cfg.skipHeader && rows.length > 0) rows = rows.slice(1);

                // Collect ALL active URLs and short links
                const activeUrls = [];
                const shortLinksPool = [];
                const shortLinkColIdx = 2; // Column C

                for (const row of rows) {
                    if (!row.c) continue;
                    const urlCell    = row.c[cfg.urlColIdx];
                    const markerCell = cfg.markerColIdx >= 0 ? row.c[cfg.markerColIdx] : null;
                    const shortLinkCell = row.c.length > shortLinkColIdx ? row.c[shortLinkColIdx] : null;

                    // Collect Short Link from Column C
                    if (shortLinkCell && shortLinkCell.v) {
                        const slUrl = String(shortLinkCell.v).trim();
                        if (slUrl.startsWith('http')) {
                            shortLinksPool.push(slUrl);
                        }
                    }

                    if (!urlCell || !urlCell.v) continue;
                    const url = String(urlCell.v).trim();
                    if (!url.startsWith('http')) continue;

                    if (cfg.markerColIdx < 0) {
                        activeUrls.push(url); // no marker = collect all
                    } else if (markerCell && markerCell.v) {
                        const marker   = String(markerCell.v).trim().toLowerCase();
                        const expected = cfg.markerValue.trim().toLowerCase();
                        if (marker === expected) activeUrls.push(url);
                    }
                }

                cb(activeUrls, null, shortLinksPool);

            } catch (err) {
                cb([], err.message);
            }
        });
    }

    // ── UI INJECTION ──────────────────────────────────────────────
    function _injectUI() {
        // Inject BELOW the MLR section (after #mlr-section) or
        // ABOVE the "Post Link to Share" field-header if MLR not present
        const mlrSection = document.getElementById('mlr-section');
        const anchor = mlrSection
            ? mlrSection.nextSibling
            : (() => {
                const headers = document.querySelectorAll('.field-header');
                for (const h of headers) {
                    if (h.textContent.includes('Post Link to Share')) return h;
                }
                return null;
            })();

        if (!anchor) { console.warn('[RCLR] Could not find injection anchor'); return; }

        const section = document.createElement('div');
        section.id = 'rclr-section';
        section.innerHTML = _buildHTML();

        if (mlrSection) {
            mlrSection.parentNode.insertBefore(section, anchor);
        } else {
            anchor.parentNode.insertBefore(section, anchor);
        }

        console.log('[RCLR] UI injected.');
    }

    function _buildHTML() {
        return `
<style>
  #rclr-section {
    --rclr-card-surface: #12141d;
    --rclr-card-surface-hover: #161925;
    --rclr-text-primary: #e2e8f0;
    --rclr-text-secondary: #8b949e;
    --rclr-accent-color: #6366f1;
    --rclr-accent-glow: rgba(99, 102, 241, 0.35);
    --rclr-border-color: #2a2e3d;
    --rclr-border-gradient: linear-gradient(145deg, #2a2e3d, #1a1c26);
    --rclr-radius-lg: 16px;
    --rclr-radius-md: 10px;
    --rclr-transition-speed: 0.35s;
    --rclr-easing: cubic-bezier(0.4, 0, 0.2, 1);
    margin-bottom: 14px;
    position: relative;
    z-index: 5;
  }

  .rclr-panel-container {
    width: 100%;
    background: rgba(30,178,255,0.02); /* Matching the surrounding theme base */
    border: 1px solid rgba(30,178,255,0.2);
    border-radius: var(--rclr-radius-lg);
    position: relative;
    transition: all var(--rclr-transition-speed) var(--rclr-easing);
  }

  .rclr-panel-container.is-active {
    background: rgba(139, 92, 246, 0.06); 
    border-color: rgba(139, 92, 246, 0.4);
    box-shadow: 0 4px 20px rgba(139, 92, 246, 0.15);
  }

  .rclr-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    cursor: pointer;
    user-select: none;
    border-radius: var(--rclr-radius-lg);
    background: transparent;
    transition: background var(--rclr-transition-speed);
  }

  .rclr-panel-header:hover { background: rgba(255,255,255,0.03); }

  .rclr-header-left { display: flex; align-items: center; gap: 10px; }
  .rclr-header-icon { color: var(--rclr-accent-color); display: flex; align-items: center; }
  .rclr-header-title { font-size: 15px; font-weight: 700; margin: 0; color: var(--rclr-text-primary); letter-spacing: 0.3px; }

  .rclr-header-right { display: flex; align-items: center; gap: 12px; }

  .rclr-chevron-btn {
    background: rgba(255, 255, 255, 0.08); 
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #ffffff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border-radius: 50%;
    transition: all var(--rclr-transition-speed) var(--rclr-easing);
    flex-shrink: 0; 
    width: 28px;
    height: 28px;
  }
  .rclr-chevron-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.2);
  }
  .rclr-chevron-btn svg { transition: transform var(--rclr-transition-speed) var(--rclr-easing); }
  .rclr-panel-container.is-collapsed .rclr-chevron-btn svg { transform: rotate(-180deg); }

  .rclr-toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
  .rclr-toggle input { opacity: 0; width: 0; height: 0; }
  .rclr-toggle-slider {
    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
    background-color: #374151; border-radius: 30px;
    transition: background-color var(--rclr-transition-speed) var(--rclr-easing);
  }
  .rclr-toggle-slider:before {
    position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
    background-color: white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    transition: transform var(--rclr-transition-speed) var(--rclr-easing);
  }
  .rclr-toggle input:checked + .rclr-toggle-slider { background-color: var(--rclr-accent-color); }
  .rclr-toggle input:checked + .rclr-toggle-slider:before { transform: translateX(20px); }

  .rclr-panel-content-wrapper {
    display: grid; grid-template-rows: 1fr;
    transition: grid-template-rows var(--rclr-transition-speed) var(--rclr-easing), opacity var(--rclr-transition-speed) var(--rclr-easing);
    opacity: 1; border-top: 1px solid var(--rclr-border-color);
  }
  .rclr-panel-content-wrapper.is-hidden { grid-template-rows: 0fr; opacity: 0; border-top-color: transparent; }
  .rclr-content-inner { overflow: hidden; }
  
  .rclr-settings-form { padding: 18px 20px; display: flex; flex-direction: column; gap: 16px; }

  /* How-to box */
  .rclr-howto {
    background: rgba(99, 102, 241, 0.08); /* Indigo tinted */
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: 9px; padding: 12px 14px;
    font-size: 11px; color: var(--rclr-text-secondary); line-height: 1.6;
    margin-bottom: 4px;
  }
  .rclr-howto strong { color: var(--rclr-text-primary); font-weight: 600; }
  .rclr-highlight { color: #818cf8; font-weight: 600; }
  .rclr-howto ul { margin: 6px 0 0 0; padding-left: 16px; }
  .rclr-howto li { margin-bottom: 3px; }

  .rclr-form-group { display: flex; flex-direction: column; gap: 6px; }
  .rclr-form-row { display: flex; gap: 16px; }
  .rclr-form-row > .rclr-form-group { flex: 1; }

  .rclr-label {
    font-size: 10px; font-weight: 700; color: var(--rclr-text-secondary);
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .rclr-input {
    background: #0f111a; border: 1px solid var(--rclr-border-color);
    color: var(--rclr-text-primary); padding: 10px 14px;
    border-radius: var(--rclr-radius-md); font-size: 13px;
    transition: all 0.2s ease; outline: none; width: 100%; box-sizing: border-box;
    font-family: inherit;
  }
  .rclr-input:focus { border-color: var(--rclr-accent-color); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15); }

  .rclr-action-btn {
    background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3);
    color: #818cf8; padding: 10px; border-radius: var(--rclr-radius-md);
    font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;
    display: flex; justify-content: center; align-items: center; gap: 8px;
    margin-top: 4px; width: 100%;
  }
  .rclr-action-btn:hover { background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.5); color: #fff; }
  .rclr-action-btn:disabled { opacity: 0.5; pointer-events: none; }

  #rclr-status-bar {
      margin-top: 4px; padding: 8px 10px; border-radius: 8px; font-size: 11px; font-weight: 600;
      display: none; align-items: center; gap: 6px;
  }
  #rclr-status-bar.ok { display: flex; background: rgba(0,255,136,0.06); border: 1px solid rgba(0,255,136,0.2); color: #00e87a; }
  #rclr-status-bar.err { display: flex; background: rgba(255,80,80,0.06); border: 1px solid rgba(255,80,80,0.2); color: #ff6b6b; }
  #rclr-status-bar.info { display: flex; background: rgba(255,200,0,0.06); border: 1px solid rgba(255,200,0,0.2); color: #ffd700; }
  #rclr-status-url { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px; }

  #rclr-last-info { margin-top: 2px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 11px; color: rgba(255,255,255,0.4); }
</style>

<div class="rclr-panel-container" id="rclr-panel-container">
  <div class="rclr-panel-header" id="rclr-header-full">
    <div class="rclr-header-left">
      <div class="rclr-header-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
      </div>
      <h2 class="rclr-header-title">Remote Sheet Control</h2>
    </div>
    <div class="rclr-header-right">
      <button class="rclr-chevron-btn" id="rclr-collapse-btn" aria-label="Toggle Details">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <label class="rclr-toggle" id="rclr-toggle-wrap">
        <input type="checkbox" id="rclr-toggle-master" checked>
        <span class="rclr-toggle-slider"></span>
      </label>
    </div>
  </div>

  <div class="rclr-panel-content-wrapper" id="rclr-content-wrapper">
    <div class="rclr-content-inner">
      <div class="rclr-settings-form">
        
        <div class="rclr-howto">
          <div style="margin-bottom: 6px; color: #818cf8; font-weight: 700; display:flex; align-items:center; gap: 6px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Setup Guide
          </div>
          Create a sheet tab named <span class="rclr-highlight">"Remote"</span> in your Google Sheet.<br>
          <ul>
            <li><strong>Column A</strong> → Facebook post URLs</li>
            <li><strong>Column B</strong> → Type <span class="rclr-highlight">"active"</span> next to the link</li>
            <li>Update the sheet from anywhere — extension applies it live!</li>
          </ul>
        </div>

        <div class="rclr-form-group">
          <label class="rclr-label">Sheet Tab Name</label>
          <input type="text" id="rclr-tab-input" class="rclr-input" placeholder="e.g. Remote" value="Remote">
        </div>

        <div class="rclr-form-row">
          <div class="rclr-form-group">
            <label class="rclr-label">URL Column (A=1)</label>
            <input type="number" id="rclr-url-col" class="rclr-input" min="1" max="26" value="1">
          </div>
          <div class="rclr-form-group">
            <label class="rclr-label">Active Column (B=2)</label>
            <input type="number" id="rclr-marker-col" class="rclr-input" min="0" max="26" value="2" placeholder="0 = disable">
          </div>
        </div>

        <div class="rclr-form-group">
          <label class="rclr-label">Active Marker Word</label>
          <input type="text" id="rclr-marker-val" class="rclr-input" placeholder="e.g. active" value="active">
        </div>

        <button id="rclr-test-btn" class="rclr-action-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          Test — Fetch Active Link
        </button>

        <div id="rclr-status-bar">
          <span id="rclr-status-icon"></span>
          <span id="rclr-status-url"></span>
        </div>

        <div id="rclr-last-info"></div>

      </div>
    </div>
  </div>
</div>
        `;
    }

    // ── SYNC UI ───────────────────────────────────────────────────
    function _syncUI() {
        const container = document.getElementById('rclr-panel-container');
        const contentWrapper = document.getElementById('rclr-content-wrapper');
        const collapseBtn = document.getElementById('rclr-collapse-btn');
        const toggleMaster = document.getElementById('rclr-toggle-master');
        
        if (!container) return;

        // 1. Update Master Active Styles (Glow)
        if (_enabled) {
            container.classList.add('is-active');
            if (toggleMaster) toggleMaster.checked = true;
        } else {
            container.classList.remove('is-active');
            if (toggleMaster) toggleMaster.checked = false;
        }

        // 2. Visibility Logic
        const shouldHideContent = !_enabled || _isCollapsed;

        if (shouldHideContent) {
            contentWrapper?.classList.add('is-hidden');
            container.classList.add('is-collapsed');
        } else {
            contentWrapper?.classList.remove('is-hidden');
            container.classList.remove('is-collapsed');
        }

        // 3. Arrow state
        if (collapseBtn) {
            collapseBtn.style.opacity = _enabled ? '1' : '0.3';
            collapseBtn.style.pointerEvents = _enabled ? 'auto' : 'none';
        }

        // Fill inputs from config
        const tabInput    = document.getElementById('rclr-tab-input');
        const urlColInput = document.getElementById('rclr-url-col');
        const mColInput   = document.getElementById('rclr-marker-col');
        const mValInput   = document.getElementById('rclr-marker-val');

        if (tabInput)    tabInput.value    = _config.sheetTab;
        if (urlColInput) urlColInput.value = _config.urlColIdx + 1;   // 0-based → 1-based display
        if (mColInput)   mColInput.value   = _config.markerColIdx < 0 ? 0 : _config.markerColIdx + 1;
        if (mValInput)   mValInput.value   = _config.markerValue;

        _updateLastInfo();
        _syncMainLinkInput();
    }

    function _updateLastInfo() {
        const el = document.getElementById('rclr-last-info');
        if (!el) return;
        get(['remoteCtrlLastUrl', 'remoteCtrlLastTime'], res => {
            if (res.remoteCtrlLastUrl) {
                const short = res.remoteCtrlLastUrl.replace(/https?:\/\/(www\.)?facebook\.com\//, '').slice(0, 50);
                el.innerHTML = `▶ Last used: <span style="color:#a78bfa;">${short}</span>
                    <span style="color:rgba(255,255,255,0.2); margin-left:6px;">${res.remoteCtrlLastTime || ''}</span>`;
            } else {
                el.textContent = '';
            }
        });
    }

    function _syncMainLinkInput() {
        const mainInput    = document.getElementById('post-link-to-visit');
        const mainDropdown = document.getElementById('saved-links-dropdown');
        const saveBtn      = document.getElementById('save-current-link-btn');
        if (!mainInput) return;

        if (_enabled) {
            // Lock the manual input — Remote Control is in charge
            mainInput.style.opacity       = '0.3';
            mainInput.style.pointerEvents = 'none';
            mainInput.placeholder = '🌐 Remote Control active — link fetched from Google Sheet';
            if (mainDropdown) {
                mainDropdown.style.opacity       = '0.3';
                mainDropdown.style.pointerEvents = 'none';
            }
            if (saveBtn) { saveBtn.style.opacity = '0.3'; saveBtn.style.pointerEvents = 'none'; }
        } else {
            // Only restore if MLR is ALSO off
            const mlrOn = window.MultiLinkRotator && window.MultiLinkRotator.isEnabled();
            if (mlrOn) return; // MLR still has the lock — don't override

            mainInput.style.opacity       = '';
            mainInput.style.pointerEvents = '';
            mainInput.placeholder = 'https://www.facebook.com/groups/...';
            if (mainDropdown) {
                mainDropdown.style.opacity       = '';
                mainDropdown.style.pointerEvents = '';
            }
            if (saveBtn) { saveBtn.style.opacity = ''; saveBtn.style.pointerEvents = ''; }
        }
    }

    // ── SAVE CONFIG ───────────────────────────────────────────────
    function _saveConfig() {
        const tabInput    = document.getElementById('rclr-tab-input');
        const urlColInput = document.getElementById('rclr-url-col');
        const mColInput   = document.getElementById('rclr-marker-col');
        const mValInput   = document.getElementById('rclr-marker-val');

        const urlColDisp = parseInt(urlColInput?.value) || 1;
        const mColDisp   = parseInt(mColInput?.value)   || 0;

        _config = {
            sheetTab:     tabInput?.value.trim()  || DEFAULT_CONFIG.sheetTab,
            urlColIdx:    urlColDisp - 1,                      // 1-based display → 0-based
            markerColIdx: mColDisp <= 0 ? -1 : mColDisp - 1,  // 0 = disabled
            markerValue:  mValInput?.value.trim() || DEFAULT_CONFIG.markerValue,
            skipHeader:   true
        };

        set({ [SK_CONFIG]: _config });
        console.log('[RCLR] Config saved:', _config);
    }

    // ── EVENT BINDING ─────────────────────────────────────────────
    function _bindEvents() {
        const headerFull = document.getElementById('rclr-header-full');
        const collapseBtn = document.getElementById('rclr-collapse-btn');
        const toggleWrap = document.getElementById('rclr-toggle-wrap');
        const toggleMaster = document.getElementById('rclr-toggle-master');

        // Prevent toggle from bubbling up to header full
        if (toggleWrap) {
            toggleWrap.addEventListener('click', e => e.stopPropagation());
        }

        // Master toggle switch event
        if (toggleMaster) {
            toggleMaster.addEventListener('change', e => {
                _enabled = e.target.checked;
                if (_enabled) _isCollapsed = false;
                set({ [SK_ENABLED]: _enabled }, () => {
                    _syncUI();
                    _syncMainLinkInput();
                });
            });
        }

        // Chevron collapse event
        if (collapseBtn) {
            collapseBtn.addEventListener('click', e => {
                e.stopPropagation();
                if (!_enabled) return;
                _isCollapsed = !_isCollapsed;
                _syncUI();
            });
        }

        // Parent header click event
        if (headerFull) {
            headerFull.addEventListener('click', () => {
                if (!_enabled) {
                    _enabled = true;
                    _isCollapsed = false;
                    set({ [SK_ENABLED]: _enabled }, () => {
                        _syncUI();
                        _syncMainLinkInput();
                    });
                } else {
                    _isCollapsed = !_isCollapsed;
                    _syncUI();
                }
            });
        }

        // Auto-save config on input blur
        const inputs = document.querySelectorAll('.rclr-panel-content-wrapper .rclr-input');
        inputs.forEach(inp => inp.addEventListener('blur', _saveConfig));
        inputs.forEach(inp => inp.addEventListener('change', _saveConfig));

        // Test button
        const testBtn = document.getElementById('rclr-test-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                _saveConfig();
                testBtn.textContent = '🔄 Fetching...';
                testBtn.disabled = true;

                const statusBar = document.getElementById('rclr-status-bar');
                const statusIcon = document.getElementById('rclr-status-icon');
                const statusUrl  = document.getElementById('rclr-status-url');

                window.RemoteLinkController.testFetch(result => {
                    testBtn.textContent = '🔍 Test — Fetch Active Link Now';
                    testBtn.disabled = false;

                    if (!statusBar) return;

                    if (result.ok && result.urls && result.urls.length > 0) {
                        const count   = result.urls.length;
                        const nextUrl = result.nextUrl || result.urls[0];
                        const short   = nextUrl.replace(/https?:\/\/(www\.)?facebook\.com\//, '').slice(0, 50);
                        const idx     = (result.currentIdx || 0) + 1;
                        statusBar.className = 'ok';
                        statusIcon.textContent = '✅';
                        statusUrl.innerHTML = `${count} active link${count > 1 ? 's' : ''} found · Next run: <strong>#${idx}</strong> → ${short}`;
                        statusUrl.title = nextUrl;
                    } else if (result.error) {
                        statusBar.className = 'err';
                        statusIcon.textContent = '❌';
                        statusUrl.textContent  = result.error;
                    } else {
                        statusBar.className = 'info';
                        statusIcon.textContent = '⚠️';
                        statusUrl.textContent  = 'No "active" link found in the sheet.';
                    }
                    statusBar.style.display = 'flex';
                });
            });
        }

        // Listen for storage changes — ONLY react to Remote Control's own keys
        // (avoids panel re-opening on every automation storage write)
        const RCLR_WATCHED_KEYS = new Set([SK_ENABLED, SK_CONFIG, 'remoteCtrlLastUrl', 'remoteCtrlLastTime']);
        chrome.storage.onChanged.addListener(changes => {
            const hasRclrKey = Object.keys(changes).some(k => RCLR_WATCHED_KEYS.has(k));
            if (!hasRclrKey) return; // ignore unrelated storage writes
            _loadState(() => _syncUI());
        });
    }

    // ── AUTO-INIT ────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.RemoteLinkController.init());
    } else {
        window.RemoteLinkController.init();
    }

})();
