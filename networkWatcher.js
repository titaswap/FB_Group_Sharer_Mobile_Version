/**
 * NETWORK & SLEEP WATCHDOG
 * Runs in background while automation is active.
 * Detects slow network / loading spinners and immediately
 * focuses the Facebook browser window via FOCUS_FB_WINDOW.
 */

console.log('📡 [NW] networkWatcher.js loaded.');

// ─── Context detection ────────────────────────────────────────────────────────
// chrome-extension:// URL = panel/extension page context
// http(s):// URL = content script running on Facebook
const IS_PANEL_CONTEXT = window.location?.protocol === 'chrome-extension:';
if (IS_PANEL_CONTEXT) {
    console.log('📡 [NW] Running in PANEL context — panel focus mode active.');
}

let _nwInterval = null;
let _lastNwFocusTime = 0;
let _automationRunning = false; // ✅ local sync state — no async storage needed
const NW_FOCUS_COOLDOWN = 15000;
const NW_CHECK_INTERVAL = 3000;


// ─── Detect slow/bad network conditions ──────────────────────────────────────
function isNetworkSlow() {
    // 1. Completely offline
    if (!navigator.onLine) return { slow: true, reason: 'network_offline' };

    // 2. Connection API (Chrome supports this)
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
        const type = conn.effectiveType; // '4g', '3g', '2g', 'slow-2g'
        if (type === 'slow-2g' || type === '2g') {
            return { slow: true, reason: 'network_slow_2g' };
        }
    }

    return { slow: false };
}

// ─── Detect visible loading spinners on the page ──────────────────────────────
function isPageLoading() {
    const spinnerSelectors = [
        '.spinner',
        '[data-testid="loading_indicator"]',
        '[class*="loading"]',
        '[class*="spinner"]',
        '[aria-label*="loading" i]',
        '[aria-label*="Loading" i]',
    ];
    for (const sel of spinnerSelectors) {
        const el = document.querySelector(sel);
        if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return true;
        }
    }
    return false;
}

// ─── Detect if Facebook page actually rendered content ────────────────────────
// Catches: blank screen, React hydration fail, Facebook error pages
function isPageBlankOrBroken() {
    // Only relevant in FB tab context (not panel)
    if (IS_PANEL_CONTEXT) return false;

    // 1. Facebook core elements — if none exist, page didn't render
    const hasFBContent = !!(
        document.querySelector('#screen-root') ||
        document.querySelector('[data-pagelet]') ||
        document.querySelector('[data-mcomponent]') ||
        document.querySelector('[role="main"]') ||
        document.querySelector('[role="feed"]') ||
        document.querySelector('[role="article"]')
    );

    // 2. Is it an error / "Something went wrong" page?
    const bodyText = (document.body?.innerText || '').toLowerCase();
    const isErrorPage =
        bodyText.includes('something went wrong') ||
        bodyText.includes('কিছু একটা সমস্যা') ||
        bodyText.includes("this page isn't available") ||
        bodyText.includes('page not found');

    // 3. Body completely empty (< 3 children = nothing rendered yet)
    const isBlank = !document.body || document.body.children.length < 3;

    return !hasFBContent || isErrorPage || isBlank;
}

// ─── Start watchdog ───────────────────────────────────────────────────────────
function startNetworkWatchdog() {
    if (_nwInterval) return;
    _automationRunning = true;
    console.log(`📡 [NW] Watchdog started (${IS_PANEL_CONTEXT ? 'PANEL' : 'FB-TAB'} context).`);

    // Panel context: no spinner/network polling needed (FB page not here)
    if (IS_PANEL_CONTEXT) return;

    _nwInterval = setInterval(() => {
        if (!isExtensionValid()) {
            console.warn('⚠️ [NW] Extension context gone. Auto-stopping watchdog.');
            stopNetworkWatchdog();
            return;
        }

        const now = Date.now();
        if (now - _lastNwFocusTime < NW_FOCUS_COOLDOWN) return;

        const netStatus = isNetworkSlow();
        const pageLoading = isPageLoading();
        const pageBlank = isPageBlankOrBroken();

        try {
            if (netStatus.slow) {
                _lastNwFocusTime = now;
                console.log(`🌐 [NW] Slow/offline network! (${netStatus.reason}) Focusing FB...`);
                chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: netStatus.reason }).catch(() => {});
            } else if (pageBlank) {
                _lastNwFocusTime = now;
                console.warn('🕳️ [NW] Page appears blank or broken! Focusing FB to trigger render...');
                chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'page_not_rendered' }).catch(() => {});
            } else if (pageLoading) {
                _lastNwFocusTime = now;
                console.log('⏳ [NW] Page loading spinner detected. Focusing FB...');
                chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'page_loading_spinner' }).catch(() => {});
            }
        } catch (e) {
            console.warn('⚠️ [NW] Extension context lost in watchdog interval. Stopping.', e.message);
            stopNetworkWatchdog();
        }

    }, NW_CHECK_INTERVAL);
}

// ─── Stop watchdog ────────────────────────────────────────────────────────────
function stopNetworkWatchdog() {
    _automationRunning = false; // ✅ sync state cleared
    if (_nwInterval) {
        clearInterval(_nwInterval);
        _nwInterval = null;
        console.log('📡 [NW] Watchdog stopped.');
    }
}

// ─── Listen for automation state changes ──────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'status_update') {
        if (msg.running === true) {
            _automationRunning = true; // ✅ instant sync
            startNetworkWatchdog();
        } else {
            _automationRunning = false;
            stopNetworkWatchdog();
        }
    }
    // pause_for_batch_wait: inter-batch countdown — stop watchdog & release focus
    // lock so visibilitychange no longer fires FOCUS_FB_WINDOW.
    if (msg.type === 'pause_for_batch_wait') {
        console.log('⏸️ [NW] pause_for_batch_wait — stopping watchdog & releasing focus lock.');
        _automationRunning = false;
        stopNetworkWatchdog();
    }
    if (msg.type === 'stop_automation') {
        _automationRunning = false;
        stopNetworkWatchdog();
    }
});

// ─── Auto-detect automation state on load ─────────────────────────────────────
// Manual flow:   is_automation_running = true (set by content.js)
// Schedule flow: auto_trigger_share = true (set by background.js alarm)
// Check BOTH to ensure watchdog starts in either case.
chrome.storage.local.get(['is_automation_running', 'auto_trigger_share', 'inter_batch_wait'], (res) => {
    // Only start watchdog if batch is ACTIVELY running on FB (not during inter-batch countdown)
    const batchActiveOnFB = (res.is_automation_running === true || res.auto_trigger_share === true)
                            && res.inter_batch_wait !== true;
    if (batchActiveOnFB) {
        console.log(`📡 [NW] Automation detected on load (running:${res.is_automation_running}, trigger:${res.auto_trigger_share}) — starting watchdog.`);
        startNetworkWatchdog();
    }
});

// ─── Guard: check if extension context is still valid ────────────────────────
// When the extension is reloaded/updated, old content scripts lose their context.
// Any chrome API call after that throws "Extension context invalidated".
function isExtensionValid() {
    try {
        return !!chrome.runtime?.id;
    } catch (e) {
        return false;
    }
}

// ─── Helper: instant focus ────────────────────────────────────────────────────
function requestFocusNow(reason) {
    if (!isExtensionValid()) { stopNetworkWatchdog(); return; }
    try {
        _lastNwFocusTime = Date.now();
        console.log(`🔴 [NW] ${reason} — requesting instant focus!`);

        if (IS_PANEL_CONTEXT) {
            // Panel context: call windowFocusManager's focusPanelNow directly
            if (typeof window._wfm_focusPanelNow === 'function') {
                window._wfm_focusPanelNow(reason);
            }
        } else {
            // Content script: tell background to focus Facebook tab
            // .catch(()=>{}) prevents Unhandled Promise Rejection when SW is sleeping
            chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason }).catch(() => {});
        }
    } catch (e) {
        console.warn('⚠️ [NW] Extension context lost during requestFocusNow:', e.message);
        stopNetworkWatchdog();
    }
}

// ─── Helper: focus only if state allows ───────────────────────────────────────
function focusIfAutomationRunning(reason) {
    if (!isExtensionValid()) { stopNetworkWatchdog(); return; }
    if (IS_PANEL_CONTEXT) {
        // Panel context: respect _panelShouldStayFocused from windowFocusManager
        if (typeof window._wfm_focusPanelIfShouldFocus === 'function') {
            window._wfm_focusPanelIfShouldFocus(reason);
        }
    } else {
        // Content script: focus FB tab if automation is running
        if (_automationRunning) requestFocusNow(reason);
    }
}

// ─── 1. Tab hidden (user switches away / minimizes browser) ──────────────────
// ONLY fire on hidden — NOT on visible (that would cause a focus loop!)
// When we call chrome.tabs.update({active:true}), tab_visible_again fires automatically.
// Calling FOCUS_FB_WINDOW again on visible would create: hidden→focus→visible→focus→hidden→...
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        focusIfAutomationRunning('tab_hidden');
    }
    // ⚠️ DO NOT call focusIfAutomationRunning on visible — causes infinite loop!
});

// ─── 2. Page FREEZE (Chrome is about to suspend/sleep this tab) ───────────────
// This fires just BEFORE the tab goes to sleep — last chance to act!
document.addEventListener('freeze', () => {
    console.log('❄️ [NW] TAB FREEZE detected — automation tab going to sleep!');
    // No cooldown — critical, fire immediately
    if (IS_PANEL_CONTEXT) {
        if (typeof window._wfm_focusPanelNow === 'function') window._wfm_focusPanelNow('tab_freeze_sleep_mode');
    } else {
        chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'tab_freeze_sleep_mode' }).catch(() => {});
    }
}, { capture: true });


// ─── 3. Page RESUME (tab woken up from sleep) ─────────────────────────────────
document.addEventListener('resume', () => {
    console.log('☀️ [NW] TAB RESUME — tab woke up from sleep! Refocusing...');
    focusIfAutomationRunning('tab_resume_from_sleep');
}, { capture: true });

// ─── 4. Page HIDE (tab or window is being hidden) ─────────────────────────────
window.addEventListener('pagehide', (e) => {
    if (e.persisted) {
        // Page going into bfcache (back-forward cache) — treat as sleep
        focusIfAutomationRunning('tab_pagehide_bfcache');
    }
});

// ─── 5. Page SHOW (tab restored from bfcache) ─────────────────────────────────
window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
        // Page came back from bfcache
        focusIfAutomationRunning('tab_pageshow_restored');
    }
});

// ─── 6. Tab was DISCARDED and reloaded (Chrome Memory Saver) ─────────────────
// document.wasDiscarded = true means tab was killed and reloaded
if (document.wasDiscarded) {
    console.log('🗑️ [NW] Tab was DISCARDED (Memory Saver). Checking automation state...');
    chrome.storage.local.get(['is_automation_running'], (res) => {
        if (res.is_automation_running === true) {
            console.log('🔴 [NW] Automation was running when tab was discarded! Attempting recovery focus...');
            requestFocusNow('tab_discarded_recovery');
        }
    });
}

// ─── 7. Online/Offline events ─────────────────────────────────────────────────
window.addEventListener('offline', () => {
    focusIfAutomationRunning('network_went_offline');
});

window.addEventListener('online', () => {
    // Back online — refocus to resume automation
    focusIfAutomationRunning('network_back_online');
});
