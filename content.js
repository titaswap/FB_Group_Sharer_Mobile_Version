console.log('✅ [CT-INIT] content.js loaded!');

// GLOBAL STOP FLAG - shared across all async functions
let ct_automation_cancelled = false;

// ─── PAGE RENDER HEALTH CHECK ────────────────────────────────────────────────
// Internet slow হলে বা Facebook নিজে render না করলে এই function সেটা detect করে
function isPageProperlyRendered() {
    // 1. Facebook-এর core DOM elements আছে কিনা
    const hasFBContent = !!(  
        document.querySelector('#screen-root') ||
        document.querySelector('[data-pagelet]') ||
        document.querySelector('[data-mcomponent]') ||
        document.querySelector('[role="main"]') ||
        document.querySelector('[role="feed"]') ||
        document.querySelector('[role="article"]') ||
        (document.querySelector('#root') && document.querySelector('#root').children.length > 0)
    );

    // 2. Error page কিনা check করো ("Something went wrong", "Not Found" ইত্যাদি)
    const bodyText = (document.body?.innerText || '').toLowerCase();
    const isErrorPage =
        bodyText.includes('something went wrong') ||
        bodyText.includes('কিছু একটা সমস্যা') ||
        bodyText.includes("this page isn't available") ||
        bodyText.includes('page not found') ||
        bodyText.includes('ত্রুটি') ||
        (document.title && (
            document.title.toLowerCase().includes('error') ||
            document.title.toLowerCase().includes('not found') ||
            document.title === ''
        ));

    // 3. Page একদম blank কিনা (body-তে 3-এর কম children = render হয়নি)
    const isBlank = !document.body || document.body.children.length < 3;

    // 4. Known error element আছে কিনা
    const hasErrorEl = !!document.querySelector(
        '[data-testid="error_page"], [class*="error-page"]'
    );

    const result = hasFBContent && !isErrorPage && !isBlank && !hasErrorEl;
    if (!result) {
        console.warn(`[CT-RENDER-CHECK] hasFBContent:${hasFBContent}, isErrorPage:${isErrorPage}, isBlank:${isBlank}, hasErrorEl:${hasErrorEl}`);
    }
    return result;
}

// ─── FLOATING STOP BUTTON ────────────────────────────────────────────────────
// Injected into the FB page so user can stop automation without going to panel.
function buildFloatingStopBtn() {
    if (document.getElementById('ct-floating-stop-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'ct-floating-stop-btn';
    btn.innerHTML = `
        <div id="ct-stop-inner">
            <svg id="ct-stop-svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
            </svg>
            <span id="ct-stop-label">STOP AUTOMATION</span>
        </div>
        <style>
            #ct-floating-stop-btn {
                position: fixed;
                top: 75px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2147483647;
                cursor: pointer;
                user-select: none;
                display: none;
                animation: ct-drop-in 0.25s cubic-bezier(0.34,1.56,0.64,1) both;
            }
            @keyframes ct-drop-in {
                from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
                to   { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            #ct-stop-inner {
                display: flex;
                align-items: center;
                gap: 7px;
                background: rgba(0, 0, 0, 0.88);
                color: #ff4d4d;
                padding: 9px 18px;
                border-radius: 10px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 12px;
                font-weight: 800;
                letter-spacing: 0.6px;
                box-shadow:
                    0 4px 16px rgba(0,0,0,0.45),
                    0 0 0 1px rgba(255,255,255,0.08);
                border: 1px solid rgba(255,77,77,0.4);
                transition: transform 0.14s ease, background 0.14s ease;
                white-space: nowrap;
            }
            #ct-floating-stop-btn:hover #ct-stop-inner {
                background: rgba(220, 30, 30, 0.95);
                color: #fff;
                transform: scale(1.04);
            }
            #ct-floating-stop-btn:active #ct-stop-inner {
                transform: scale(0.96);
            }
            #ct-stop-svg {
                flex-shrink: 0;
                animation: ct-icon-pulse 1.5s ease-in-out infinite;
            }
            @keyframes ct-icon-pulse {
                0%, 100% { opacity: 1; }
                50%       { opacity: 0.45; }
            }
            #ct-stop-label {
                font-size: 11px;
                font-weight: 900;
                letter-spacing: 0.8px;
                text-transform: uppercase;
            }
        </style>
    `;


    // Click → stop automation
    btn.addEventListener('click', () => {
        // Visual feedback
        const inner = btn.querySelector('#ct-stop-inner');
        const label = btn.querySelector('#ct-stop-label');
        const icon  = btn.querySelector('#ct-stop-icon');
        if (inner) inner.style.background = 'linear-gradient(135deg,#27ae60,#2ecc71)';
        if (label) label.textContent = 'STOPPED!';
        if (icon)  icon.textContent  = '✅';

        // Stop local automation
        ct_automation_cancelled = true;

        // Tell panel + all content scripts
        chrome.runtime.sendMessage({ type: 'stop_automation' }).catch(() => {});
        chrome.storage.local.set({
            is_automation_running: false,
            auto_trigger_share: false,
            inter_batch_wait: false,
            auto_select_groups: []
        });
        chrome.runtime.sendMessage({ type: 'status_update', running: false }).catch(() => {});

        // Hide after 1.5s
        setTimeout(() => { btn.style.display = 'none'; }, 1500);
    });

    document.body.appendChild(btn);
    console.log('🛑 [CT-BTN] Floating stop button injected.');
}

function showFloatingStopBtn() {
    let btn = document.getElementById('ct-floating-stop-btn');
    if (!btn) { 
        buildFloatingStopBtn(); 
        btn = document.getElementById('ct-floating-stop-btn'); 
    }
    if (btn) {
        btn.style.setProperty('display', 'block', 'important');
        btn.style.setProperty('z-index', '2147483647', 'important');
        
        // Ensure it's the very last child so it overlays Facebook React Portals
        if (btn.parentElement === document.body && document.body.lastElementChild !== btn) {
            document.body.appendChild(btn);
        }
    }
}

function hideFloatingStopBtn() {
    const btn = document.getElementById('ct-floating-stop-btn');
    if (btn) btn.style.setProperty('display', 'none', 'important');
}

// Watchdog: ensures button stays alive and visible during automation
const stopBtnWatchdog = setInterval(() => {
    // If extension reloaded while tab is open, context dies. Stop the interval to prevent throwing errors.
    if (!chrome.runtime?.id) {
        clearInterval(stopBtnWatchdog);
        return;
    }
    try {
        chrome.storage.local.get(['is_automation_running', 'inter_batch_wait'], (res) => {
            if (chrome.runtime.lastError) return;
            const isRunning = res.is_automation_running === true || res.inter_batch_wait === true;
            if (isRunning && !ct_automation_cancelled) {
                showFloatingStopBtn();
            } else {
                hideFloatingStopBtn();
            }
        });
    } catch (e) {
        clearInterval(stopBtnWatchdog);
    }
}, 1500);

// Listen for automation state changes
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'status_update') {
        if (msg.running === true) showFloatingStopBtn();
        else hideFloatingStopBtn();
    }
    if (msg.type === 'stop_automation' || msg.type === 'all_batches_complete') {
        hideFloatingStopBtn();
    }
    if (msg.type === 'pause_for_batch_wait') {
        showFloatingStopBtn();
    }
});

// Initial load check
chrome.storage.local.get(['is_automation_running'], (res) => {
    if (res.is_automation_running === true) showFloatingStopBtn();
});


// ─── OVERLAY UI ──────────────────────────────────────────────────────────────
const buildCountdownUI = () => {
    let el = document.getElementById('automation-countdown-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'automation-countdown-overlay';
        el.style.cssText = `
            position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
            z-index: 999999; background: rgba(0,0,0,0.9); color: #1eb2ff;
            padding: 12px 20px; border-radius: 12px; font-family: sans-serif;
            font-size: 14px; font-weight: bold; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            border: 1px solid rgba(30,178,255,0.3); display: flex; align-items: center; gap: 10px;
            pointer-events: none; transition: opacity 0.3s;
        `;
        document.body.appendChild(el);
        console.log('🖥️ [CT-UI] Countdown overlay created.');
    }
    return el;
};

// ─── SLEEP WITH COUNTDOWN ────────────────────────────────────────────────────
const sleep = (minSeconds, maxSeconds, msg = "Waiting") => {
    return new Promise((resolve, reject) => {
        const ms = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
        console.log(`⏳ [CT-SLEEP] "${msg}" for ${Math.round(ms/1000)}s`);
        const overlay = buildCountdownUI();
        if (overlay) overlay.style.opacity = '1';

        let rem = Math.round(ms / 1000);
        const updateUI = () => {
            if (overlay) {
                overlay.innerHTML = `
                    <div style="width:20px;height:20px;border:2px solid #1eb2ff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
                    <div style="display:flex;flex-direction:column;gap:2px;">
                        <span style="color:#1eb2ff;font-size:11px;font-weight:700;">${msg}...</span>
                        <span style="color:#fff;font-size:14px;font-weight:800;">${rem}s</span>
                    </div>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                `;
                chrome.runtime.sendMessage({ type: 'task_countdown', name: msg, rem, active: true }).catch(() => {});
            }
        };
        updateUI();
        const inv = setInterval(() => {
            // CHECK STOP FLAG
            if (ct_automation_cancelled) {
                clearInterval(inv);
                if (overlay) { overlay.style.opacity = '0'; overlay.style.display = 'none'; }
                console.log(`⛔ [CT-SLEEP-ABORT] "${msg}" interrupted by stop.`);
                return reject('cancelled');
            }
            rem--;
            if (rem <= 0) {
                clearInterval(inv);
                if (overlay) overlay.style.opacity = '0';
                chrome.runtime.sendMessage({ type: 'task_countdown', active: false }).catch(() => {});
                setTimeout(resolve, 200);
            } else updateUI();
        }, 1000);
    });
};

// ─── SAFE CLICK ──────────────────────────────────────────────────────────────
function safeClick(el) {
    if (!el) return;
    try {
        console.log("⚡ [CT-CLICK] Executing SafeClick on:", el.tagName, el.className?.slice(0, 40));
        const originalTransition = el.style.transition;
        el.style.transition = 'all 0.2s';
        el.style.boxShadow = '0 0 35px #ff0000';
        el.style.outline = '5px solid #ff0000';
        el.style.zIndex = '99999';
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        
        const rect = el.getBoundingClientRect();
        
        // Strategy 1: Exact Center
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Strategy 2: Bottom Center
        // FB mobile buttons are slightly padded; 80% is safer than 85% to avoid jumping off the element
        const bottomX = rect.left + rect.width / 2;
        const bottomY = rect.top + rect.height * 0.80; 
        
        let targetX = bottomX;
        let targetY = bottomY;
        let pointTarget = document.elementFromPoint(targetX, targetY);
        
        const isSeeMore = (target) => {
            if (!target || !target.innerText) return false;
            const txt = target.innerText.toLowerCase();
            return txt.includes('see more') || txt.includes('আরও');
        };

        // SAFEGUARD: If bottom hit "See more", missed completely, or missed the button container
        if (!pointTarget || !el.contains(pointTarget) || isSeeMore(pointTarget)) {
             console.log("⚠️ [CT-CLICK] Bottom hit 'See more' or missed! Shifting click strategy.");
             targetX = centerX;
             targetY = centerY;
             pointTarget = document.elementFromPoint(targetX, targetY) || el;
             
             // If center ALSO hits 'See more', force the click directly onto the SVG/icon or the button container itself
             if (isSeeMore(pointTarget)) {
                 console.log("⚠️ [CT-CLICK] Center ALSO hit 'See more'! Forcing click directly onto Share element node.");
                 pointTarget = el.querySelector('svg, i, img') || el;
                 const svgRect = pointTarget.getBoundingClientRect();
                 targetX = svgRect.left + svgRect.width / 2;
                 targetY = svgRect.top + svgRect.height / 2;
             }
        }

        const eventsToFire = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        
        // Fire simulated events exactly at the validated targetX/targetY
        eventsToFire.forEach(type => {
            pointTarget.dispatchEvent(new MouseEvent(type, { 
                bubbles: true, 
                cancelable: true, 
                view: window,
                clientX: targetX,
                clientY: targetY
            }));
        });
        
        pointTarget.dispatchEvent(new Event('touchstart', { bubbles: true }));
        pointTarget.dispatchEvent(new Event('touchend', { bubbles: true }));

        // Native click on the Original Element just to be 100% sure!
        if (pointTarget !== el && typeof el.click === 'function') {
            el.click();
        }

        console.log("✅ [CT-CLICK] Events dispatched successfully.");
        
        setTimeout(() => {
            el.style.boxShadow = '';
            el.style.outline = '';
            el.style.transition = originalTransition;
        }, 1500);
    } catch (e) { console.error("❌ [CT-CLICK-ERR] SafeClick failed:", e); }
}

// ─── SHARE BUTTON FINDER ─────────────────────────────────────────────────────
function findPrimaryShareButton() {
    console.log('🔍 [CT-FIND] Searching for primary Share button...');

    // Strategy 1: aria-label (expanded — includes English + Bangla + case variations)
    const selectors = [
        'div[aria-label*="share" i]',
        'div[aria-label*="শেয়ার"]',
        'a[aria-label*="share" i]',
        'a[aria-label*="শেয়ার"]',
        '[role="button"][aria-label*="share" i]',
        '[role="button"][aria-label*="শেয়ার"]',
    ];
    for (let sel of selectors) {
        try {
            const found = document.querySelector(sel);
            if (found) {
                const r = found.getBoundingClientRect();
                if (r.width > 2 && r.height > 2) {
                    console.log(`✅ [CT-FIND-S1] Found via aria-label selector: "${sel}"`);
                    return found;
                }
            }
        } catch(e) { /* :has() or unsupported selector — skip */ }
    }

    // Strategy 2: fixed-bottom row — try all positions 0..4
    const ssrBtns = document.querySelectorAll('#screen-root div.m.fixed-container.bottom [role="button"]');
    if (ssrBtns.length >= 3) {
        // Position 2 (3rd button) is usually Share on mobile FB photo page
        console.log('✅ [CT-FIND-S2] Found via fixed-bottom 3rd button.');
        return ssrBtns[2];
    }
    if (ssrBtns.length > 0) {
        // Fallback: scan all bottom buttons for share-related content
        for (const btn of ssrBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            const txt   = (btn.innerText || '').toLowerCase();
            if (label.includes('share') || label.includes('শেয়ার') ||
                txt.includes('share')   || txt.includes('শেয়ার')) {
                console.log('✅ [CT-FIND-S2b] Found bottom button with share text:', label || txt);
                return btn;
            }
        }
    }

    // Strategy 3: data-action-id="10" (mobile FB share action)
    const actionIdTen = document.querySelector('div[data-action-id="10"]');
    if (actionIdTen) {
        console.log('✅ [CT-FIND-S3] Found via data-action-id="10".');
        return actionIdTen;
    }

    // Strategy 3b: any button with data-action-id 8–12 (share/reaction row)
    for (let aid = 8; aid <= 12; aid++) {
        const el = document.querySelector(`[data-action-id="${aid}"]`);
        if (el) {
            const label = (el.getAttribute('aria-label') || '').toLowerCase();
            const txt   = (el.innerText || '').toLowerCase();
            if (label.includes('share') || label.includes('শেয়ার') ||
                txt.includes('share')   || txt.includes('শেয়ার')) {
                console.log(`✅ [CT-FIND-S3b] Found via data-action-id="${aid}" with share text.`);
                return el;
            }
        }
    }

    // Strategy 4: Text-based scan — find any visible button/div with "Share" text
    const allBtns = document.querySelectorAll('[role="button"]');
    for (const btn of allBtns) {
        const rect = btn.getBoundingClientRect();
        if (rect.width < 5 || rect.height < 5) continue; // hidden
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const txt   = (btn.innerText || '').toLowerCase().trim();
        if (label.includes('share') || label.includes('শেয়ার') ||
            txt === 'share'         || txt === 'শেয়ার') {
            console.log('✅ [CT-FIND-S4] Found via text/aria scan:', label || txt);
            return btn;
        }
    }

    // Strategy 5: container scan (original S4) — 3+ buttons group, 3rd is share
    const containers = document.querySelectorAll('div');
    for (const g of containers) {
        const btns = Array.from(g.children).filter(c =>
            c.getAttribute('role') === 'button' || c.getAttribute('data-action-id') ||
            c.getAttribute('data-mcomponent') === 'ServerTextArea'
        );
        if (btns.length >= 3) {
            const target = btns[2];
            const rect = target.getBoundingClientRect();
            if (rect.width > 5 && rect.height > 5 &&
                (target.innerText.match(/\d+/) || target.innerHTML.includes('svg') || target.innerHTML.includes('path'))) {
                console.log('✅ [CT-FIND-S5] Found via container scan.');
                return target;
            }
        }
    }

    console.error('❌ [CT-FIND-FAIL] Primary Share button not found via any strategy.');
    return null;
}

let groupsCheckInterval = null;
let dialogCheckInterval = null;

// ─── STOP / PAUSE LISTENERS ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // ── pause_for_batch_wait ──────────────────────────────────────────────────
    // Sent by panel between batches. Stops local loops & overlays ONLY.
    // MUST NOT write is_automation_running or auto_trigger_share to storage —
    // the panel's countdown zombie-check reads is_automation_running every
    // second; if we set it false here the countdown kills itself and the
    // next batch never starts.
    if (request.type === 'pause_for_batch_wait') {
        console.log('⏸️ [CT-PAUSE] pause_for_batch_wait received. Releasing FB focus lock.');
        ct_automation_cancelled = true;
        if (groupsCheckInterval) { clearInterval(groupsCheckInterval); groupsCheckInterval = null; }
        if (dialogCheckInterval) { clearInterval(dialogCheckInterval); dialogCheckInterval = null; }
        const overlay = document.getElementById('automation-countdown-overlay');
        if (overlay) { overlay.style.opacity = '0'; overlay.style.display = 'none'; }
        // Tell networkWatcher (same tab) to stop enforcing FB focus.
        // Use status_update running:false — NW listens for this and calls stopNetworkWatchdog().
        // We do NOT write to storage so panel countdown keeps running.
        chrome.runtime.sendMessage({ type: 'status_update', running: false }).catch(() => {});
        if (sendResponse) sendResponse({ ok: true });
    }

    if (request.type === 'stop_automation' || request.type === 'all_batches_complete') {
        console.log(`🛑 [CT-STOP] "${request.type}" received. Setting cancel flag & clearing ALL intervals.`);
        
        // SET GLOBAL STOP FLAG IMMEDIATELY
        ct_automation_cancelled = true;
        
        if (groupsCheckInterval) { clearInterval(groupsCheckInterval); groupsCheckInterval = null; }
        if (dialogCheckInterval) { clearInterval(dialogCheckInterval); dialogCheckInterval = null; }
        const overlay = document.getElementById('automation-countdown-overlay');
        if (overlay) { overlay.style.opacity = '0'; overlay.style.display = 'none'; }
        chrome.storage.local.set({ 
            auto_trigger_share: false, 
            is_automation_running: false, 
            auto_select_groups: [] 
            // NOTE: inter_batch_wait is managed by panel only — do NOT set here
        });
        if (request.type === 'all_batches_complete') {
            console.log('🎉 [CT-DONE] All batches completed! Script fully stopped.');
        }
        chrome.runtime.sendMessage({ type: 'status_update', running: false });
        sendResponse && sendResponse({ ok: true });
    }
});

// ─── IS RUNNING CHECK ────────────────────────────────────────────────────────
async function isAppRunning() {
    try {
        if (!chrome?.storage?.local) return false;
        const res = await new Promise(r => {
            chrome.storage.local.get(['is_automation_running'], result => {
                if (chrome.runtime.lastError) r({});
                else r(result || {});
            });
        });
        return res.is_automation_running === true;
    } catch (e) { return false; }
}

// ─── MAIN ENTRY POINT ────────────────────────────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['auto_trigger_share', 'auto_select_groups'], async (result) => {
        if (chrome.runtime.lastError) return;
        if (!result.auto_trigger_share) {
            console.log('ℹ️ [CT-ENTRY] auto_trigger_share not set. Standing by.');
            return;
        }

        console.log('🚀 [CT-ENTRY] auto_trigger_share=true. Initiating automation...');
        ct_automation_cancelled = false;
        chrome.storage.local.set({ is_automation_running: true });
        chrome.runtime.sendMessage({ type: 'status_update', running: true });

        try {
            await sleep(3, 5, "Stabilizing page");
        } catch(e) {
            console.log('⛔ [CT-ENTRY] Cancelled during stabilization. Exit.');
            return;
        }

        // ── PAGE RENDER VERIFICATION ──────────────────────────────────────────
        // Internet slow বা Facebook render না করলে এখানে detect হবে।
        // প্রতি 5s অপেক্ষা করে, 4 বার চেষ্টার পরও fail হলে batch reload করে।
        {
            let renderOk = false;
            const MAX_RENDER_ATTEMPTS = 4;

            for (let renderAttempt = 1; renderAttempt <= MAX_RENDER_ATTEMPTS; renderAttempt++) {
                if (ct_automation_cancelled) return;

                renderOk = isPageProperlyRendered();
                if (renderOk) {
                    console.log(`✅ [CT-RENDER] Page rendered OK (attempt ${renderAttempt}).`);
                    break;
                }

                console.warn(`⚠️ [CT-RENDER] Page not rendered yet (attempt ${renderAttempt}/${MAX_RENDER_ATTEMPTS}). Waiting 5s...`);
                chrome.runtime.sendMessage({
                    type: 'progress_log',
                    hint: `Waiting for page to load... (${renderAttempt}/${MAX_RENDER_ATTEMPTS})`
                });
                // Browser window focus করো — Facebook tab foreground-এ থাকলে render দ্রুত হয়
                chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'page_not_rendered' });

                try {
                    await sleep(5, 5, `Page Loading (${renderAttempt}/${MAX_RENDER_ATTEMPTS})`);
                } catch(e) {
                    console.log('⛔ [CT-RENDER] Cancelled during render wait. Exit.');
                    return;
                }
            }

            if (!renderOk) {
                console.error(`❌ [CT-RENDER] Page failed to render after ${MAX_RENDER_ATTEMPTS} attempts.`);
                console.error('❌ [CT-RENDER] Possible causes: slow internet, Facebook error page, blank screen.');

                // Panel-কে জানাও → panel পুরো batch reload করবে (batch_retry_requested)
                chrome.runtime.sendMessage({
                    type: 'batch_retry_requested',
                    reason: 'page_render_failed'
                });
                chrome.storage.local.set({
                    is_automation_running: false,
                    auto_trigger_share: false
                });
                chrome.runtime.sendMessage({ type: 'status_update', running: false });
                return; // Exit — panel handles the retry
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        let attemptsToFindDialog = 0;

        const mainLoop = async () => {
            if (ct_automation_cancelled || !await isAppRunning()) {
                console.log('🛑 [CT-LOOP] App stopped. Exiting mainLoop.');
                return;
            }

            console.log(`🔁 [CT-LOOP] mainLoop iteration. Dialog attempts so far: ${attemptsToFindDialog}`);

            // ── RETRY: Find Share Button (Two-Layer: per-attempt + outer retry) ──
            let shareBtn = null;
            const MAX_SHARE_OUTER = 3;
            for (let outer = 1; outer <= MAX_SHARE_OUTER; outer++) {
                for (let retry = 1; retry <= 3; retry++) {
                    console.log(`🔄 [CT-SHARE-RETRY] Outer ${outer}/${MAX_SHARE_OUTER} | Inner ${retry}/3`);
                    shareBtn = findPrimaryShareButton();
                    if (shareBtn) break;
                    // Layer 1: per-attempt → focus browser instantly
                    console.warn(`⚠️ [CT-SHARE-MISS] Not found. Focusing browser & waiting 3s...`);
                    chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'share_button_not_found' });
                    try { await sleep(3, 3, "Finding Share Button"); }
                    catch(e) { return; }
                }
                if (shareBtn) break;
                // Layer 2: outer retry → full re-focus + re-scan after inner exhausted
                if (outer < MAX_SHARE_OUTER) {
                    console.warn(`🔁 [CT-SHARE-OUTER] Inner exhausted. Re-focusing browser (outer ${outer}/${MAX_SHARE_OUTER})...`);
                    chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'share_button_not_found' });
                    try { await sleep(3, 3, "Re-focusing for Share"); }
                    catch(e) { return; }
                }
            }

            if (!shareBtn) {
                console.error('❌ [CT-SHARE-FAIL] Share button missing after 3 retries. Aborting.');
                chrome.runtime.sendMessage({ type: 'post_result', status: 'failed', groupName: 'System', msg: 'Share button not found after retries.' });
                chrome.storage.local.set({ is_automation_running: false, auto_trigger_share: false });
                chrome.runtime.sendMessage({ type: 'status_update', running: false });
                return;
            }

            chrome.runtime.sendMessage({ type: 'progress_log', hint: "Clicking Share..." });
            safeClick(shareBtn);
            console.log('✅ [CT-SHARE] Share button clicked. Waiting 5s for menu...');

            // ── Mandatory 5s delay ───────────────────────────────────────────
            try {
                await sleep(5, 5, "Loading Menu Options");
            } catch(e) {
                console.log('⛔ [CT-MENU-WAIT] Cancelled during menu wait. Exit.');
                return;
            }

            if (ct_automation_cancelled) return;

            if (typeof openShareToGroupMenu === 'function') {
                console.log('📞 [CT-CALL] Calling openShareToGroupMenu()...');
                openShareToGroupMenu();
            } else {
                console.warn('⚠️ [CT-CALL] openShareToGroupMenu not defined. Is autoClickGroup.js loaded?');
            }

            // ── Dialog Detection ─────────────────────────────────────────────
            let dialogWaitSec = 0;
            if (dialogCheckInterval) clearInterval(dialogCheckInterval);

            dialogCheckInterval = setInterval(async () => {
                if (!await isAppRunning()) {
                    clearInterval(dialogCheckInterval);
                    return;
                }
                dialogWaitSec++;

                const checkboxes = document.querySelectorAll('input[type="checkbox"], [role="checkbox"], [aria-checked]');
                const hasSearchInput = document.querySelector('input[placeholder*="Search"], input[placeholder*="খুঁজু"]');
                const hasSelectHeader = document.body.innerText.includes("Select Group") ||
                    document.body.innerText.includes("গ্রুপ সিলেক্ট") ||
                    document.body.innerText.includes("Share to a Group");
                const hasSpinner = document.querySelector('.spinner, [data-testid="loading_indicator"]');
                const isDialogPresent = checkboxes.length >= 2 || hasSearchInput || hasSelectHeader;

                if (dialogWaitSec % 5 === 0) {
                    console.log(`🕐 [CT-DIALOG-WAIT] ${dialogWaitSec}s | checkboxes:${checkboxes.length} | header:${hasSelectHeader} | spinner:${!!hasSpinner}`);
                }

                if (isDialogPresent) {
                    clearInterval(dialogCheckInterval);
                    console.log(`✅ [CT-DIALOG] Group selection dialog detected at ${dialogWaitSec}s!`);
                    chrome.runtime.sendMessage({ type: 'progress_log', hint: "Dialog Ready!" });
                    
                    try {
                        // ✅ CRITICAL FIX: Clear inter_batch_wait BEFORE selectGroupsInDOM
                        await new Promise(r => chrome.storage.local.set({ 
                            inter_batch_wait: false,
                            is_automation_running: true
                        }, r));
                        console.log('🔓 [CT-UNLOCK] inter_batch_wait forcefully cleared before group selection.');
                        
                        await sleep(3, 6, "Loading Groups");
                        
                        if (ct_automation_cancelled) {
                            console.log('⛔ [CT-DIALOG] Cancelled before selectGroupsInDOM.');
                            return;
                        }

                        const groups = result.auto_select_groups || [];
                        console.log(`📋 [CT-DIALOG] Passing ${groups.length} groups to selectGroupsInDOM.`);
                        if (typeof selectGroupsInDOM === 'function') await selectGroupsInDOM(groups);
                        else console.error('❌ [CT-DIALOG] selectGroupsInDOM not found!');
                    } catch(e) {
                        if (e === 'cancelled') {
                            console.log('⛔ [CT-DIALOG] Stopped during dialog phase. Clean exit.');
                        } else {
                            console.error('❌ [CT-DIALOG-ERR]', e);
                        }
                    }

                } else if (hasSpinner) {
                    if (dialogWaitSec % 10 === 0) {
                        console.log(`⏳ [CT-SPINNER] Slow network, spinner still visible. (${dialogWaitSec}s)`);
                        // ✅ Focus browser instantly when spinner is slow
                        chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'spinner_slow' });
                    }

                } else if (dialogWaitSec > 40) {
                    clearInterval(dialogCheckInterval);
                    attemptsToFindDialog++;
                    console.warn(`⚠️ [CT-TIMEOUT] Dialog timeout at 40s. Retry attempt ${attemptsToFindDialog}/3.`);
                    if (attemptsToFindDialog < 3) {
                        console.log('🔁 [CT-RETRY] Retrying mainLoop...');
                        chrome.runtime.sendMessage({ type: 'batch_retry_requested', reason: 'dialog_timeout' });
                    } else {
                        console.error('❌ [CT-ABORT] 3 mainLoop retries exhausted. Stopping.');
                        chrome.runtime.sendMessage({ type: 'post_result', status: 'failed', groupName: 'System', msg: 'Share menu failed to open after 3 retries.' });
                        chrome.storage.local.set({ is_automation_running: false, auto_trigger_share: false });
                        chrome.runtime.sendMessage({ type: 'status_update', running: false });
                    }
                } else if (dialogWaitSec > 0 && dialogWaitSec % 10 === 0) {
                    // ✅ Dialog taking long (no spinner) → focus browser, keep waiting same step
                    console.warn(`🪟 [FOCUS-RETRY] Dialog slow at ${dialogWaitSec}s. Focusing browser...`);
                    chrome.runtime.sendMessage({ action: 'FOCUS_FB_WINDOW', reason: 'dialog_slow' });
                }

            }, 1000);
        };

        mainLoop();
    });
}
