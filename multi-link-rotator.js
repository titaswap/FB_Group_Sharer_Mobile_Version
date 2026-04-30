/**
 * ============================================================
 * MULTI-LINK ROTATOR MODULE
 * ============================================================
 * Feature: Add multiple Facebook post links. Each schedule run
 * (or manual trigger) picks the NEXT link in the list (round-robin).
 *
 * Storage keys used:
 *   - rotatorLinks     : Array of { id, name, url, createdAt }
 *   - rotatorIndex     : Number — the index of the NEXT link to use
 *   - rotatorEnabled   : Boolean — whether rotation mode is ON
 *
 * Public API (window.MultiLinkRotator):
 *   .init()              — call once on DOMContentLoaded
 *   .isEnabled()         — returns true if rotator mode is active
 *   .getNextLink(cb)     — advances index, calls cb(url) with next link
 *   .peekCurrentLink(cb) — calls cb(url) without advancing index
 */

(function () {
    'use strict';

    // ── STORAGE HELPERS ──────────────────────────────────────────
    function getStorage(keys, cb) {
        chrome.storage.local.get(keys, cb);
    }

    function setStorage(obj, cb) {
        chrome.storage.local.set(obj, cb || (() => {}));
    }

    // ── STATE ────────────────────────────────────────────────────
    let _links = [];
    let _index = 0;
    let _enabled = false;

    // ── DOM REFERENCES (set in init) ─────────────────────────────
    let _container = null;       // #mlr-container (toggle pill section)
    let _toggleBtn = null;       // #mlr-toggle-btn
    let _listEl = null;          // #mlr-links-list
    let _addBtn = null;          // #mlr-add-btn
    let _emptyState = null;      // #mlr-empty-state
    let _statusBadge = null;     // #mlr-status-badge
    let _addModal = null;        // #mlr-add-modal
    let _modalNameInput = null;  // #mlr-modal-name
    let _modalUrlInput = null;   // #mlr-modal-url
    let _modalSaveBtn = null;    // #mlr-modal-save
    let _modalCancelBtn = null;  // #mlr-modal-cancel
    let _editingId = null;       // track edit mode

    // ── PUBLIC API ───────────────────────────────────────────────
    window.MultiLinkRotator = {

        /**
         * Check if rotation mode is currently enabled.
         * @returns {boolean}
         */
        isEnabled() {
            return _enabled && _links.length > 0;
        },

        /**
         * Get the next link URL (advances rotation index).
         * @param {function(string|null)} cb — called with the URL or null
         */
        getNextLink(cb) {
            if (!_enabled || _links.length === 0) { cb(null); return; }

            const safeIndex = _index % _links.length;
            const link = _links[safeIndex];
            const nextIndex = (safeIndex + 1) % _links.length;

            setStorage({ rotatorIndex: nextIndex }, () => {
                _index = nextIndex;
                cb(link ? link.url : null);
            });
        },

        /**
         * Peek at current (upcoming) link without advancing.
         * @param {function(string|null)} cb
         */
        peekCurrentLink(cb) {
            if (!_enabled || _links.length === 0) { cb(null); return; }
            const safeIndex = _index % _links.length;
            const link = _links[safeIndex];
            cb(link ? link.url : null);
        },

        /**
         * Initialize the UI. Call once after DOMContentLoaded.
         */
        init() {
            console.log('[MLR] init() called');
            _injectUI();
            _loadState(() => {
                console.log('[MLR] State loaded — enabled:', _enabled, '| links:', _links.length, '| index:', _index);
                _renderList();
                _syncToggleUI();
            });
            _bindEvents();
        }
    };

    // ── UI INJECTION ─────────────────────────────────────────────
    function _injectUI() {
        console.log('[MLR] _injectUI() called');
        const targetEl = document.getElementById('post-link-to-visit');
        if (!targetEl) {
            console.warn('[MLR] post-link-to-visit not found — aborting inject');
            return;
        }

        const fieldHeader = document.querySelector('.field-header[data-mlr-anchor]') ||
                            _findFieldHeaderForLinkSection();
        if (!fieldHeader) {
            console.warn('[MLR] Could not find "Post Link to Share" field-header — aborting inject');
            return;
        }
        console.log('[MLR] Found anchor field-header, injecting UI...');

        const section = document.createElement('div');
        section.id = 'mlr-section';
        section.innerHTML = _buildSectionHTML();

        fieldHeader.parentNode.insertBefore(section, fieldHeader);
        console.log('[MLR] UI injected into DOM');

        _container    = document.getElementById('mlr-section');
        _toggleBtn    = document.getElementById('mlr-toggle-btn');   // may be null — that's OK
        _listEl       = document.getElementById('mlr-links-list');
        _addBtn       = document.getElementById('mlr-add-btn');
        _emptyState   = document.getElementById('mlr-empty-state');
        _statusBadge  = document.getElementById('mlr-status-badge');
        _addModal     = document.getElementById('mlr-add-modal');
        _modalNameInput = document.getElementById('mlr-modal-name');
        _modalUrlInput  = document.getElementById('mlr-modal-url');
        _modalSaveBtn   = document.getElementById('mlr-modal-save');
        _modalCancelBtn = document.getElementById('mlr-modal-cancel');
        console.log('[MLR] DOM refs cached — toggleRow:', !!document.getElementById('mlr-toggle-row'), '| addBtn:', !!_addBtn);
    }

    function _findFieldHeaderForLinkSection() {
        // The "Post Link to Share" label sits in a .field-header div.
        // We walk all .field-header divs and find the one with the matching label.
        const headers = document.querySelectorAll('.field-header');
        for (const h of headers) {
            if (h.textContent.includes('Post Link to Share')) return h;
        }
        // Fallback: find by label text
        const labels = document.querySelectorAll('.field-label');
        for (const l of labels) {
            if (l.textContent.includes('Post Link to Share')) return l.closest('.field-header');
        }
        return null;
    }

    function _buildSectionHTML() {
        return `
        <style>
            #mlr-section {
                margin-bottom: 14px;
                border-radius: 14px;
                overflow: visible;
            }

            /* ─── Toggle pill ─── */
            #mlr-toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 14px;
                background: rgba(30,178,255,0.06);
                border: 1px solid rgba(30,178,255,0.2);
                border-radius: 14px;
                cursor: pointer;
                transition: all 0.2s;
                user-select: none;
            }
            #mlr-toggle-row:hover {
                background: rgba(30,178,255,0.1);
                border-color: rgba(30,178,255,0.4);
            }
            #mlr-toggle-row.active {
                background: rgba(30,178,255,0.12);
                border-color: rgba(30,178,255,0.5);
                box-shadow: 0 0 18px rgba(30,178,255,0.12);
            }
            #mlr-toggle-label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                font-weight: 800;
                color: #fff;
                letter-spacing: 0.2px;
            }
            #mlr-status-badge {
                font-size: 10px;
                font-weight: 700;
                padding: 3px 10px;
                border-radius: 20px;
                background: rgba(255,255,255,0.06);
                color: rgba(255,255,255,0.4);
                border: 1px solid rgba(255,255,255,0.1);
                transition: all 0.3s;
            }
            #mlr-status-badge.on {
                background: rgba(0,255,136,0.12);
                color: #00ff88;
                border-color: rgba(0,255,136,0.3);
                box-shadow: 0 0 10px rgba(0,255,136,0.1);
            }

            /* Switch */
            #mlr-switch {
                width: 36px;
                height: 20px;
                border-radius: 12px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.15);
                position: relative;
                transition: all 0.3s;
                flex-shrink: 0;
            }
            #mlr-switch::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: rgba(255,255,255,0.4);
                transition: all 0.3s;
            }
            #mlr-switch.on {
                background: rgba(30,178,255,0.6);
                border-color: rgba(30,178,255,0.8);
            }
            #mlr-switch.on::after {
                left: 18px;
                background: #fff;
            }

            /* ─── Expanded panel ─── */
            #mlr-panel {
                display: none;
                margin-top: 10px;
                background: rgba(10,20,40,0.8);
                border: 1px solid rgba(30,178,255,0.2);
                border-radius: 12px;
                padding: 12px;
                animation: mlrFadeIn 0.25s ease;
            }
            #mlr-panel.open { display: block; }

            @keyframes mlrFadeIn {
                from { opacity: 0; transform: translateY(-6px); }
                to   { opacity: 1; transform: translateY(0); }
            }

            /* ─── Links list ─── */
            #mlr-links-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-height: 220px;
                overflow-y: auto;
                scrollbar-width: thin;
                scrollbar-color: rgba(30,178,255,0.3) transparent;
                margin-bottom: 10px;
            }

            .mlr-link-card {
                background: rgba(30,178,255,0.05);
                border: 1px solid rgba(30,178,255,0.15);
                border-radius: 10px;
                padding: 8px 10px;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s;
                position: relative;
            }
            .mlr-link-card:hover {
                border-color: rgba(30,178,255,0.35);
                background: rgba(30,178,255,0.08);
            }
            .mlr-link-card.is-current {
                border-color: rgba(0,255,136,0.4);
                background: rgba(0,255,136,0.05);
                box-shadow: 0 0 12px rgba(0,255,136,0.08);
            }
            .mlr-link-order {
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: rgba(30,178,255,0.15);
                border: 1px solid rgba(30,178,255,0.3);
                color: #1eb2ff;
                font-size: 10px;
                font-weight: 800;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .mlr-link-card.is-current .mlr-link-order {
                background: rgba(0,255,136,0.2);
                border-color: rgba(0,255,136,0.5);
                color: #00ff88;
            }
            .mlr-link-info {
                flex: 1;
                min-width: 0;
            }
            .mlr-link-name {
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mlr-link-url {
                color: rgba(255,255,255,0.35);
                font-size: 9px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mlr-current-tag {
                font-size: 9px;
                font-weight: 700;
                color: #00ff88;
                background: rgba(0,255,136,0.1);
                border: 1px solid rgba(0,255,136,0.25);
                padding: 1px 6px;
                border-radius: 8px;
                flex-shrink: 0;
            }
            .mlr-actions {
                display: flex;
                gap: 4px;
                flex-shrink: 0;
            }
            .mlr-btn-icon {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 13px;
                opacity: 0.6;
                padding: 2px 4px;
                border-radius: 6px;
                transition: all 0.15s;
            }
            .mlr-btn-icon:hover { opacity: 1; background: rgba(255,255,255,0.08); }

            /* ─── Empty state ─── */
            #mlr-empty-state {
                text-align: center;
                padding: 16px 8px;
                color: rgba(255,255,255,0.3);
                font-size: 11px;
                font-style: italic;
            }

            /* ─── Add button ─── */
            #mlr-add-btn {
                flex: 1;
                background: rgba(30,178,255,0.08);
                border: 1px dashed rgba(30,178,255,0.3);
                color: #1eb2ff;
                padding: 8px;
                border-radius: 10px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                margin-bottom: 10px;
            }
            #mlr-add-btn:hover {
                background: rgba(30,178,255,0.14);
                border-color: rgba(30,178,255,0.5);
            }
            #mlr-sheet-btn {
                background: rgba(16,185,129,0.08);
                border: 1px dashed rgba(16,185,129,0.35);
                color: #10b981;
                padding: 8px 12px;
                border-radius: 10px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s;
                margin-bottom: 10px;
                white-space: nowrap;
            }
            #mlr-sheet-btn:hover {
                background: rgba(16,185,129,0.15);
                border-color: rgba(16,185,129,0.6);
            }
            #mlr-sheet-btn:disabled {
                opacity: 0.5;
                pointer-events: none;
            }

            /* ─── Info row ─── */
            #mlr-info-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid rgba(255,255,255,0.05);
            }
            #mlr-next-info {
                color: rgba(255,255,255,0.4);
                font-size: 10px;
                font-weight: 600;
            }
            #mlr-reset-btn {
                background: none;
                border: none;
                color: rgba(255,100,100,0.6);
                font-size: 10px;
                font-weight: 700;
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 6px;
                transition: all 0.2s;
            }
            #mlr-reset-btn:hover { color: #ff5252; background: rgba(255,82,82,0.08); }

            /* ─── Add/Edit Modal ─── */
            #mlr-add-modal {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 99999;
                background: rgba(0,0,0,0.7);
                backdrop-filter: blur(8px);
                align-items: center;
                justify-content: center;
                animation: mlrFadeIn 0.2s ease;
            }
            #mlr-add-modal.open { display: flex; }
            #mlr-modal-box {
                background: linear-gradient(135deg, #0d1a2e 0%, #0a1525 100%);
                border: 1px solid rgba(30,178,255,0.35);
                border-radius: 18px;
                padding: 22px;
                width: 88%;
                max-width: 360px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(30,178,255,0.08);
            }
            #mlr-modal-title {
                color: #1eb2ff;
                font-size: 14px;
                font-weight: 800;
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .mlr-modal-label {
                color: rgba(255,255,255,0.55);
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 5px;
                display: block;
            }
            .mlr-modal-input {
                width: 100%;
                background: rgba(0,12,35,0.8);
                border: 1px solid rgba(30,178,255,0.3);
                color: #fff;
                padding: 9px 11px;
                border-radius: 9px;
                font-size: 13px;
                box-sizing: border-box;
                outline: none;
                font-family: inherit;
                transition: border-color 0.2s;
                margin-bottom: 12px;
            }
            .mlr-modal-input:focus { border-color: rgba(30,178,255,0.7); }
            #mlr-modal-actions {
                display: flex;
                gap: 8px;
                margin-top: 4px;
            }
            #mlr-modal-save {
                flex: 2;
                background: linear-gradient(135deg, #1eb2ff 0%, #00d4ff 100%);
                border: none;
                color: #fff;
                padding: 10px;
                border-radius: 10px;
                font-weight: 800;
                font-size: 13px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(30,178,255,0.3);
                transition: all 0.2s;
            }
            #mlr-modal-save:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(30,178,255,0.4); }
            #mlr-modal-cancel {
                flex: 1;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.12);
                color: rgba(255,255,255,0.6);
                padding: 10px;
                border-radius: 10px;
                font-weight: 700;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
            }
            #mlr-modal-cancel:hover { background: rgba(255,255,255,0.1); }
        </style>

        <!-- ── Toggle pill ── -->
        <div id="mlr-toggle-row">
            <div id="mlr-toggle-label">
                <span style="font-size:15px;">🔁</span>
                <span>Multi-Link Rotation</span>
                <span id="mlr-status-badge">OFF</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span id="mlr-link-count" style="font-size:10px; color:rgba(255,255,255,0.3); font-weight:600;"></span>
                <div id="mlr-switch"></div>
            </div>
        </div>

        <!-- ── Expanded panel ── -->
        <div id="mlr-panel">
            <div style="font-size:10px; color:rgba(255,255,255,0.35); margin-bottom:10px; line-height:1.5;">
                📌 Each schedule run picks the <strong style="color:#1eb2ff;">next link</strong> in order. After the last, it loops back to the first.
            </div>
            <div id="mlr-links-list"></div>
            <div id="mlr-empty-state">No links added yet. Click below to add your first link.</div>
            <div style="display:flex; gap:6px; margin-bottom:0;">
                <button id="mlr-add-btn" style="flex:1;">➕ Add Link</button>
                <button id="mlr-sheet-btn" title="Import links from Google Sheet">📊 Sheet</button>
            </div>
            <div id="mlr-info-row">
                <span id="mlr-next-info">—</span>
                <button id="mlr-reset-btn">↺ Reset to #1</button>
            </div>
        </div>

        <!-- ── Add/Edit Modal ── -->
        <div id="mlr-add-modal">
            <div id="mlr-modal-box">
                <div id="mlr-modal-title">🔗 Add New Link</div>
                <label class="mlr-modal-label">Link Name</label>
                <input type="text" id="mlr-modal-name" class="mlr-modal-input" placeholder="e.g. Product Launch Post">
                <label class="mlr-modal-label">Facebook Post URL</label>
                <input type="url" id="mlr-modal-url" class="mlr-modal-input" placeholder="https://www.facebook.com/...">
                <div id="mlr-modal-actions">
                    <button id="mlr-modal-save">💾 Save</button>
                    <button id="mlr-modal-cancel">Cancel</button>
                </div>
            </div>
        </div>
        `;
    }

    // ── STATE LOADING ─────────────────────────────────────────────
    function _loadState(cb) {
        getStorage(['rotatorLinks', 'rotatorIndex', 'rotatorEnabled'], (res) => {
            _links   = res.rotatorLinks  || [];
            _index   = res.rotatorIndex  || 0;
            _enabled = res.rotatorEnabled || false;
            if (cb) cb();
        });
    }

    // ── EVENT BINDING ─────────────────────────────────────────────
    function _bindEvents() {
        // Listen for storage updates (e.g., from background on schedule fire)
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.rotatorLinks || changes.rotatorIndex || changes.rotatorEnabled) {
                _loadState(() => {
                    _renderList();
                    _syncToggleUI();
                });
            }
        });
    }

    function _bindDOMEvents() {
        console.log('[MLR] _bindDOMEvents() called');

        // ── Toggle pill click ──
        // NOTE: we use #mlr-toggle-row (the whole pill), not #mlr-toggle-btn
        const toggleRow = document.getElementById('mlr-toggle-row');
        const panel = document.getElementById('mlr-panel');
        console.log('[MLR] toggleRow found:', !!toggleRow, '| panel found:', !!panel);

        if (toggleRow) {
            toggleRow.addEventListener('click', () => {
                _enabled = !_enabled;
                console.log('[MLR] Toggle clicked! _enabled is now:', _enabled);
                if (_enabled) {
                    if (panel) panel.classList.add('open');
                } else {
                    if (panel) panel.classList.remove('open');
                }
                setStorage({ rotatorEnabled: _enabled }, () => {
                    console.log('[MLR] Storage updated. Calling _syncToggleUI...');
                    _syncToggleUI();
                    _syncMainLinkInput();
                });
            });
            console.log('[MLR] Click event bound to toggleRow ✅');
        } else {
            console.error('[MLR] ❌ toggleRow (#mlr-toggle-row) NOT FOUND — click won\'t work!');
        }

        // ── Add button ──
        if (_addBtn) {
            _addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                _openModal();
            });
        }

        // ── Sheet import button ──
        const sheetBtn = document.getElementById('mlr-sheet-btn');
        if (sheetBtn) {
            sheetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                _fetchFromSheet();
            });
        }

        // ── Modal save ──
        if (_modalSaveBtn) {
            _modalSaveBtn.addEventListener('click', () => {
                const name = _modalNameInput.value.trim();
                const url  = _modalUrlInput.value.trim();
                if (!name) { _modalNameInput.focus(); return; }
                if (!url || !url.includes('facebook.com')) {
                    alert('Please enter a valid Facebook URL.');
                    _modalUrlInput.focus();
                    return;
                }

                if (_editingId) {
                    // Update
                    _links = _links.map(l => l.id === _editingId ? { ...l, name, url } : l);
                } else {
                    // Add new
                    const now = new Date();
                    _links.push({
                        id: Date.now().toString(),
                        name,
                        url,
                        createdAt: now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                    });
                }

                setStorage({ rotatorLinks: _links }, () => {
                    _closeModal();
                    _renderList();
                    _updateLinkCount();
                    _updateNextInfo();
                });
            });
        }

        // ── Modal cancel ──
        if (_modalCancelBtn) {
            _modalCancelBtn.addEventListener('click', _closeModal);
        }

        // ── Click outside modal to close ──
        if (_addModal) {
            _addModal.addEventListener('click', (e) => {
                if (e.target === _addModal) _closeModal();
            });
        }

        // ── Reset index button ──
        const resetBtn = document.getElementById('mlr-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                _index = 0;
                setStorage({ rotatorIndex: 0 }, () => {
                    _renderList();
                    _updateNextInfo();
                });
            });
        }
    }

    // ── MODAL ──────────────────────────────────────────────────────
    function _openModal(link = null) {
        if (!_addModal) return;
        _editingId = link ? link.id : null;
        const titleEl = document.getElementById('mlr-modal-title');
        if (titleEl) titleEl.textContent = link ? '✏️ Edit Link' : '🔗 Add New Link';
        if (_modalNameInput) _modalNameInput.value = link ? link.name : '';
        if (_modalUrlInput)  _modalUrlInput.value  = link ? link.url  : '';
        _addModal.classList.add('open');
        setTimeout(() => { if (_modalNameInput) _modalNameInput.focus(); }, 100);
    }

    function _closeModal() {
        if (!_addModal) return;
        _addModal.classList.remove('open');
        _editingId = null;
    }

    // ── RENDERING ──────────────────────────────────────────────────
    function _renderList() {
        if (!_listEl) return;
        const safeIndex = _links.length > 0 ? _index % _links.length : 0;

        if (_links.length === 0) {
            _listEl.innerHTML = '';
            if (_emptyState) _emptyState.style.display = 'block';
        } else {
            if (_emptyState) _emptyState.style.display = 'none';
            _listEl.innerHTML = '';
            _links.forEach((link, i) => {
                const isCurrent = (i === safeIndex);
                const card = document.createElement('div');
                card.className = 'mlr-link-card' + (isCurrent ? ' is-current' : '');
                card.innerHTML = `
                    <div class="mlr-link-order">${i + 1}</div>
                    <div class="mlr-link-info">
                        <div class="mlr-link-name">${_esc(link.name)}</div>
                        <div class="mlr-link-url">${_esc(link.url)}</div>
                    </div>
                    ${isCurrent ? '<span class="mlr-current-tag">▶ NEXT</span>' : ''}
                    <div class="mlr-actions">
                        <button class="mlr-btn-icon mlr-edit" data-id="${link.id}" title="Edit">✏️</button>
                        <button class="mlr-btn-icon mlr-del"  data-id="${link.id}" title="Delete">🗑️</button>
                    </div>
                `;
                _listEl.appendChild(card);
            });

            // Edit buttons
            _listEl.querySelectorAll('.mlr-edit').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const link = _links.find(l => l.id === btn.dataset.id);
                    if (link) _openModal(link);
                });
            });

            // Delete buttons
            _listEl.querySelectorAll('.mlr-del').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const link = _links.find(l => l.id === btn.dataset.id);
                    if (!link) return;
                    if (!confirm(`Delete link "${link.name}"?`)) return;
                    _links = _links.filter(l => l.id !== btn.dataset.id);
                    // Adjust index if needed
                    if (_index >= _links.length && _links.length > 0) {
                        _index = 0;
                    }
                    setStorage({ rotatorLinks: _links, rotatorIndex: _index }, () => {
                        _renderList();
                        _updateLinkCount();
                        _updateNextInfo();
                    });
                });
            });
        }

        _updateLinkCount();
        _updateNextInfo();
    }

    function _syncToggleUI() {
        const toggleRow = document.getElementById('mlr-toggle-row');
        const panel = document.getElementById('mlr-panel');
        const sw = document.getElementById('mlr-switch');
        console.log('[MLR] _syncToggleUI() — _enabled:', _enabled, '| toggleRow:', !!toggleRow, '| sw:', !!sw);

        if (!toggleRow) return;

        if (_enabled) {
            toggleRow.classList.add('active');
            if (sw) sw.classList.add('on');
            if (_statusBadge) {
                _statusBadge.textContent = _links.length === 0 ? 'ON (add links)' : 'ON';
                _statusBadge.classList.add('on');
            }
            if (panel) panel.classList.add('open');
            console.log('[MLR] Switch visually ON ✅');
        } else {
            toggleRow.classList.remove('active');
            if (sw) sw.classList.remove('on');
            if (_statusBadge) {
                _statusBadge.textContent = 'OFF';
                _statusBadge.classList.remove('on');
            }
            if (panel) panel.classList.remove('open');
            console.log('[MLR] Switch visually OFF');
        }

        _syncMainLinkInput();
    }

    function _syncMainLinkInput() {
        const mainInput    = document.getElementById('post-link-to-visit');
        const mainDropdown = document.getElementById('saved-links-dropdown');
        if (!mainInput) return;

        if (_enabled) {
            // Dim manual input — rotator is in control
            mainInput.style.opacity       = '0.35';
            mainInput.style.pointerEvents = 'none';
            mainInput.placeholder = _links.length > 0
                ? '🔁 Rotator active — link auto-selected each run'
                : '🔁 Rotator ON — add links above first';
            if (mainDropdown) {
                mainDropdown.style.opacity       = '0.35';
                mainDropdown.style.pointerEvents = 'none';
            }
        } else {
            // Only restore if Remote Control is ALSO off
            const remoteOn = window.RemoteLinkController && window.RemoteLinkController.isEnabled();
            if (remoteOn) return; // Remote still has the lock — don't override

            mainInput.style.opacity       = '';
            mainInput.style.pointerEvents = '';
            mainInput.placeholder = 'https://www.facebook.com/groups/...';
            if (mainDropdown) {
                mainDropdown.style.opacity       = '';
                mainDropdown.style.pointerEvents = '';
            }
        }
    }

    function _updateLinkCount() {
        const countEl = document.getElementById('mlr-link-count');
        if (!countEl) return;
        countEl.textContent = _links.length > 0 ? `${_links.length} link${_links.length > 1 ? 's' : ''}` : '';
    }

    function _updateNextInfo() {
        const el = document.getElementById('mlr-next-info');
        if (!el) return;
        if (_links.length === 0) {
            el.textContent = '—';
            return;
        }
        const safeIndex = _index % _links.length;
        const link = _links[safeIndex];
        // Show a short URL preview (strip https://www.facebook.com/)
        const shortUrl = link.url.replace(/^https?:\/\/(www\.)?facebook\.com\//, '').slice(0, 40);
        el.innerHTML = `▶ Next run: <strong style="color:#1eb2ff;">Link #${safeIndex + 1}</strong> <span style="color:rgba(255,255,255,0.35);">· ${_esc(shortUrl)}</span>`;
    }

    function _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── GOOGLE SHEET IMPORT ───────────────────────────────────────
    function _fetchFromSheet() {
        // Step 1: show config modal → user sets sheet tab + column filter
        _showSheetConfigModal((cfg) => _doSheetFetch(cfg));
    }

    // ─── Config Modal (Sheet Tab + Column Filter) ─────────────────
    function _showSheetConfigModal(onConfirm) {
        const existing = document.getElementById('mlr-sheet-cfg-overlay');
        if (existing) existing.remove();

        // Load last saved settings
        chrome.storage.local.get(['mlrSheetImportConfig'], res => {
            const saved    = res.mlrSheetImportConfig || {};
            const lastTab  = saved.sheetTab  || 'Share Link';
            const lastCol  = saved.colFilter || '';

            const overlay = document.createElement('div');
            overlay.id = 'mlr-sheet-cfg-overlay';
            overlay.style.cssText = `
                position:fixed;inset:0;z-index:999999;
                background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);
                display:flex;align-items:center;justify-content:center;
            `;
            overlay.innerHTML = `
                <div style="
                    background:linear-gradient(135deg,#0d2137 0%,#0a1628 100%);
                    border:1px solid rgba(30,178,255,0.4);
                    border-radius:16px;width:92%;max-width:390px;padding:20px;
                    box-shadow:0 15px 40px rgba(0,0,0,0.6);
                    position:relative;font-family:inherit;
                ">
                    <button id="mlr-cfg-close" style="
                        position:absolute;top:14px;right:14px;
                        background:none;border:none;color:rgba(255,255,255,0.45);
                        font-size:18px;cursor:pointer;line-height:1;padding:0;
                    ">✕</button>

                    <h3 style="margin:0 0 6px;color:#1eb2ff;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px;">
                        <span style="font-size:18px;">📊</span> Import from Google Sheet
                    </h3>

                    <div style="
                        background:rgba(30,178,255,0.05);
                        border:1px solid rgba(30,178,255,0.15);
                        border-radius:9px;padding:10px 12px;margin-bottom:14px;
                        font-size:10px;color:rgba(255,255,255,0.5);line-height:1.8;
                    ">
                        📋 <strong style="color:#1eb2ff;">Sheet Setup Guide:</strong><br>
                        1. Open your Google Sheet → must be <strong style="color:#fff;">Public (Anyone with link)</strong><br>
                        2. Create a tab — e.g. <strong style="color:#fff;">"Share Link"</strong><br>
                        3. <strong style="color:#fff;">Row 1</strong> = column headers (e.g. <em>Titas.airdrop</em>, <em>Abba</em>)<br>
                        4. <strong style="color:#fff;">Row 2+</strong> = Facebook post URLs (one per row)<br>
                        5. Enter the tab name below and click <strong style="color:#fff;">Fetch</strong>
                    </div>

                    <label style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:5px;">
                        Sheet Tab Name
                    </label>
                    <input id="mlr-cfg-tab" type="text" value="${_esc(lastTab)}"
                        placeholder="e.g. Share Link"
                        style="
                            width:100%;padding:9px 11px;box-sizing:border-box;
                            border:1px solid rgba(30,178,255,0.3);border-radius:8px;
                            background:rgba(0,12,35,0.8);color:#fff;font-size:12px;
                            outline:none;font-family:inherit;margin-bottom:12px;
                            transition:border-color 0.2s;
                        ">

                    <label style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:5px;">
                        Column Name Filter
                        <span style="color:rgba(255,255,255,0.25);font-weight:400;text-transform:none;"> (optional — blank = show all columns)</span>
                    </label>
                    <input id="mlr-cfg-col" type="text" value="${_esc(lastCol)}"
                        placeholder="e.g. Titas.airdrop  (blank = all)"
                        style="
                            width:100%;padding:9px 11px;box-sizing:border-box;
                            border:1px solid rgba(30,178,255,0.3);border-radius:8px;
                            background:rgba(0,12,35,0.8);color:#fff;font-size:12px;
                            outline:none;font-family:inherit;margin-bottom:14px;
                            transition:border-color 0.2s;
                        ">

                    <button id="mlr-cfg-fetch" style="
                        width:100%;
                        background:linear-gradient(135deg,#1eb2ff 0%,#0080cc 100%);
                        color:#fff;border:none;padding:11px;
                        border-radius:10px;font-weight:800;font-size:13px;
                        cursor:pointer;box-shadow:0 4px 14px rgba(30,178,255,0.3);
                        transition:all 0.2s;
                    ">🔍 Fetch Columns</button>
                </div>
            `;

            document.body.appendChild(overlay);
            setTimeout(() => document.getElementById('mlr-cfg-tab')?.focus(), 50);

            document.getElementById('mlr-cfg-close').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

            ['mlr-cfg-tab', 'mlr-cfg-col'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('focus', () => el.style.borderColor = 'rgba(30,178,255,0.7)');
                el.addEventListener('blur',  () => el.style.borderColor = 'rgba(30,178,255,0.3)');
            });

            document.getElementById('mlr-cfg-fetch').addEventListener('click', () => {
                const sheetTab  = (document.getElementById('mlr-cfg-tab')?.value  || '').trim() || 'Share Link';
                const colFilter = (document.getElementById('mlr-cfg-col')?.value  || '').trim();
                chrome.storage.local.set({ mlrSheetImportConfig: { sheetTab, colFilter } });
                overlay.remove();
                onConfirm({ sheetTab, colFilter });
            });
        });
    }

    // ─── Actual Sheet Data Fetch ─────────────────────────────────
    async function _doSheetFetch({ sheetTab, colFilter }) {
        const sheetBtn = document.getElementById('mlr-sheet-btn');

        const { settings_sheet_url } = await new Promise(r =>
            chrome.storage.local.get(['settings_sheet_url'], r)
        );
        if (!settings_sheet_url) {
            alert('❌ Google Sheet URL not set!\n\nPlease add it in Settings first.');
            return;
        }

        let sheetId = '';
        try {
            const urlObj = new URL(settings_sheet_url);
            const parts = urlObj.pathname.split('/');
            const dIdx = parts.indexOf('d');
            if (dIdx !== -1 && parts.length > dIdx + 1) sheetId = parts[dIdx + 1];
            else throw new Error('bad url');
        } catch {
            alert('❌ Invalid Google Sheet URL format in Settings.');
            return;
        }

        if (sheetBtn) { sheetBtn._orig = sheetBtn.innerHTML; sheetBtn.innerHTML = '🔄'; sheetBtn.disabled = true; }

        try {
            const apiUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetTab)}`;
            const resp = await fetch(apiUrl);
            let text = await resp.text();

            const prefix = 'google.visualization.Query.setResponse(';
            const pIdx = text.indexOf(prefix);
            if (pIdx === -1) throw new Error('Could not parse sheet. Is it Public?');
            text = text.substring(pIdx + prefix.length, text.lastIndexOf(')'));

            const json = JSON.parse(text);
            if (json.status === 'error') throw new Error(json.errors[0].message);

            const table = json.table;
            const allRows = table.rows || [];

            // Robust header detection
            const colLabels = table.cols.map((col, i) => {
                if (col.label && col.label.trim()) return col.label.trim();
                if (allRows.length > 0 && allRows[0].c?.[i]?.v) return String(allRows[0].c[i].v).trim();
                return String.fromCharCode(65 + i);
            });

            const firstRowIsHeader = table.cols.every(col => !col.label || !col.label.trim());
            const dataRows = firstRowIsHeader ? allRows.slice(1) : allRows;

            // Build columns with links
            let columns = colLabels.map((label, colIdx) => {
                const links = [];
                dataRows.forEach(row => {
                    const cell = row.c?.[colIdx];
                    if (cell?.v !== null && cell?.v !== undefined) {
                        const val = String(cell.v).trim();
                        if (val.startsWith('http')) links.push(val);
                    }
                });
                return { label, links };
            }).filter(c => c.links.length > 0);

            // Apply column name filter (partial match, case-insensitive)
            if (colFilter) {
                const fl = colFilter.toLowerCase();
                const filtered = columns.filter(c => c.label.toLowerCase().includes(fl));
                if (filtered.length > 0) columns = filtered;
            }

            if (columns.length === 0) {
                alert(`⚠️ No Facebook links found in the '${sheetTab}' sheet.\n\nMake sure cells contain full URLs starting with http.`);
                return;
            }

            _showSheetColumnPicker(columns);

        } catch (err) {
            console.error('[MLR Sheet] Error:', err);
            alert(`❌ Error: ${err.message}\n\nMake sure:\n• Sheet is public ("Anyone with link")\n• Tab name is exactly "${sheetTab}"`);
        } finally {
            if (sheetBtn) { sheetBtn.innerHTML = sheetBtn._orig || '📊 Sheet'; sheetBtn.disabled = false; }
        }
    }

    function _showSheetColumnPicker(columns) {

        const old = document.getElementById('mlr-sheet-picker');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'mlr-sheet-picker';
        overlay.style.cssText = `
            position:fixed; inset:0; z-index:999999;
            background:rgba(0,0,0,0.75); backdrop-filter:blur(8px);
            display:flex; align-items:center; justify-content:center;
        `;

        // Build column rows (same style as GoogleSheetFetcher)
        const colRowsHtml = columns.map((col, i) => `
            <div style="
                background:rgba(255,255,255,0.03);
                border:1px solid rgba(255,255,255,0.1);
                border-radius:10px; padding:10px;
                display:flex; align-items:flex-start; gap:10px;
            ">
                <input type="checkbox" class="mlr-import-cb" data-idx="${i}"
                    style="width:16px;height:16px;accent-color:#1eb2ff;flex-shrink:0;cursor:pointer;margin-top:3px;">
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;">
                    <span style="color:#fff;font-size:11px;font-weight:700;">
                        Original: <span style="color:rgba(255,255,255,0.6);">${_esc(col.label)}</span>
                        (${col.links.length} item${col.links.length > 1 ? 's' : ''})
                    </span>
                    <input type="text" class="mlr-import-name" data-idx="${i}"
                        value="${_esc(col.label)}"
                        placeholder="Column name"
                        style="
                            width:100%; padding:7px 10px; box-sizing:border-box;
                            border:1px solid rgba(30,178,255,0.3);
                            border-radius:7px;
                            background:rgba(0,12,35,0.8);
                            color:#1eb2ff; font-size:12px; font-weight:700;
                            outline:none; font-family:inherit;
                        ">
                </div>
            </div>
        `).join('');

        overlay.innerHTML = `
            <div style="
                background:linear-gradient(135deg,#0d2137 0%,#0a1628 100%);
                border:1px solid rgba(30,178,255,0.4);
                border-radius:16px; width:90%; max-width:400px; padding:20px;
                box-shadow:0 15px 40px rgba(0,0,0,0.6);
                position:relative;
            ">
                <button id="mlr-picker-close" style="
                    position:absolute; top:15px; right:15px;
                    background:none; border:none; color:rgba(255,255,255,0.5);
                    font-size:18px; cursor:pointer; line-height:1; padding:0;
                ">✕</button>

                <h3 style="
                    margin:0 0 5px 0; color:#1eb2ff;
                    font-size:16px; font-weight:800;
                    display:flex; align-items:center; gap:8px;
                ">
                    <span style="font-size:20px;">📊</span> Select Columns
                </h3>
                <p style="
                    margin:0 0 12px 0;
                    color:rgba(255,255,255,0.5);
                    font-size:11px; font-style:italic; line-height:1.5;
                ">Choose the columns you want to import. You can rename the target column manually below.</p>

                <!-- Select All row -->
                <div style="
                    display:flex; align-items:center; gap:8px;
                    padding:8px 4px; margin-bottom:8px;
                    border-bottom:1px solid rgba(255,255,255,0.08);
                ">
                    <input type="checkbox" id="mlr-select-all-cb"
                        style="width:16px;height:16px;accent-color:#1eb2ff;cursor:pointer;">
                    <label for="mlr-select-all-cb" style="
                        color:rgba(255,255,255,0.6); font-size:11px;
                        font-weight:700; cursor:pointer; user-select:none;
                    ">Select All</label>
                </div>

                <div style="
                    max-height:260px; overflow-y:auto; overflow-x:hidden;
                    padding-right:5px;
                    scrollbar-width:thin; scrollbar-color:rgba(30,178,255,0.3) transparent;
                    display:flex; flex-direction:column; gap:8px;
                    margin-bottom:15px;
                ">
                    ${colRowsHtml}
                </div>

                <button id="mlr-picker-save" style="
                    width:100%;
                    background:linear-gradient(135deg,#10b981 0%,#059669 100%);
                    color:#fff; border:none; padding:12px;
                    border-radius:10px; font-weight:800; font-size:13px;
                    cursor:pointer;
                    box-shadow:0 4px 15px rgba(16,185,129,0.3);
                    transition:all 0.2s;
                ">✅ Save Selected &amp; Import</button>
            </div>
        `;

        document.body.appendChild(overlay);

        // Select All logic
        const selectAllCb = document.getElementById('mlr-select-all-cb');
        const allCbs = () => overlay.querySelectorAll('.mlr-import-cb');

        selectAllCb.addEventListener('change', () => {
            allCbs().forEach(cb => cb.checked = selectAllCb.checked);
        });
        // Sync "Select All" when individual checkboxes change
        overlay.addEventListener('change', e => {
            if (e.target.classList.contains('mlr-import-cb')) {
                const cbs = allCbs();
                selectAllCb.checked = [...cbs].every(cb => cb.checked);
                selectAllCb.indeterminate = !selectAllCb.checked && [...cbs].some(cb => cb.checked);
            }
        });

        // Close button
        document.getElementById('mlr-picker-close').onclick = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });


        // Save button
        document.getElementById('mlr-picker-save').onclick = () => {
            const checkboxes = overlay.querySelectorAll('.mlr-import-cb');
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' });
            const existingUrls = new Set(_links.map(l => l.url));

            let totalAdded = 0;
            let colsImported = 0;

            checkboxes.forEach(cb => {
                if (!cb.checked) return;
                const idx = parseInt(cb.dataset.idx);
                const col = columns[idx];
                const nameInput = overlay.querySelector(`.mlr-import-name[data-idx="${idx}"]`);
                const displayName = nameInput ? nameInput.value.trim() || col.label : col.label;

                col.links.forEach(url => {
                    if (!existingUrls.has(url)) {
                        _links.push({
                            id: Date.now().toString() + Math.random().toString(36).slice(2,6),
                            name: displayName,
                            url,
                            createdAt: dateStr
                        });
                        existingUrls.add(url);
                        totalAdded++;
                    }
                });
                colsImported++;
            });

            if (colsImported === 0) {
                alert('Please select at least one column.');
                return;
            }

            setStorage({ rotatorLinks: _links }, () => {
                overlay.remove();
                _renderList();
                _updateLinkCount();
                _updateNextInfo();
                if (totalAdded > 0) {
                    alert(`✅ Successfully imported ${totalAdded} link${totalAdded > 1 ? 's' : ''} across ${colsImported} column${colsImported > 1 ? 's' : ''}.`);
                } else {
                    alert(`ℹ️ All links already exist in the rotator.`);
                }
            });
        };
    }



    // ── AUTO-INIT on DOMContentLoaded ────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.MultiLinkRotator.init();
            _bindDOMEvents();
        });
    } else {
        // DOM already ready
        window.MultiLinkRotator.init();
        _bindDOMEvents();
    }

})();
