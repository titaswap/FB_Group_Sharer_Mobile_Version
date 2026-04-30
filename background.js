importScripts('./fb_link_resolver.js');

chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
        id: 1,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [
                { header: "User-Agent", operation: "set", value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
                { header: "Sec-Fetch-Site", operation: "remove" },
                { header: "Sec-Fetch-Mode", operation: "remove" },
                { header: "Sec-Fetch-Dest", operation: "remove" },
                { header: "Sec-Fetch-User", operation: "remove" }
            ]
        },
        condition: {
            initiatorDomains: [chrome.runtime.id],
            requestDomains: ["facebook.com"],
            resourceTypes: ["xmlhttprequest"]
        }
    }]
}).catch(e => console.error("DNR Error:", e));

let panelTabId = null;

/**
 * safeTabUpdate — Validates tab existence before calling chrome.tabs.update.
 * Silently swallows "No tab with id" errors instead of leaving them unchecked.
 * @param {number} tabId — Tab to update
 * @param {object} props — Update properties (url, active, etc.)
 * @param {function} [cb] — Optional callback(updatedTab | null)
 */
function safeTabUpdate(tabId, props, cb) {
    if (!tabId) { if (cb) cb(null); return; }
    chrome.tabs.get(tabId, (tab) => {
        // Consume lastError — tab may have been closed
        const err = chrome.runtime.lastError;
        if (err || !tab) {
            console.warn(`[BG] safeTabUpdate: Tab ${tabId} not found (${err?.message || 'unknown'}). Skipping.`);
            if (cb) cb(null);
            return;
        }
        chrome.tabs.update(tabId, props, (updated) => {
            if (chrome.runtime.lastError) {
                console.warn(`[BG] safeTabUpdate: update failed on tab ${tabId}:`, chrome.runtime.lastError.message);
                if (cb) cb(null);
            } else {
                if (cb) cb(updated);
            }
        });
    });
}

chrome.action.onClicked.addListener((currentTab) => {
  // Check if our panel tab is already open
  if (panelTabId !== null) {
    chrome.tabs.get(panelTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        // Tab was closed, open a new one
        openPanelTab(currentTab.id);
      } else {
        // Tab exists, bring it to front
        chrome.tabs.update(panelTabId, { active: true });
        // Optionally update the window focus as well (for desktop)
        if (tab.windowId) {
            chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
        }
      }
    });
  } else {
    openPanelTab(currentTab.id);
  }
});

function openPanelTab(targetTabId) {
  chrome.tabs.create({
    url: `panel.html?tabId=${targetTabId}`,
    active: true
  }, (tab) => {
    panelTabId = tab.id;
  });
}

// When a tab is closed, check if it was our panel tab
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === panelTabId) {
    console.log('🚨 Panel closed. Terminating all active automation and schedules...');
    panelTabId = null; // ✅ FIX: Reset panelTabId (was referencing undefined panelWindowId)
    
    // 1. Reset Storage to Idle
    chrome.storage.local.set({ 
        is_automation_running: false, 
        auto_trigger_share: false 
    });
    
    // 2. Remove all scheduled tasks/triggers
    chrome.alarms.clearAll();
    chrome.storage.local.remove(['scheduled_config', 'next_trigger_time']);
    
    // 3. Notify any running content script to stop immediately
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && tab.url.includes("facebook.com")) {
                chrome.tabs.sendMessage(tab.id, { type: 'stop_automation' }).catch(() => {});
            }
        });
    });
  }
});

// Central Messaging Relay
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'stop_automation') {
        console.log('🛑 [BG-RELAY] Global stop_automation received. Broadcasting to all Facebook tabs...');
        // 1. Reset Storage to Idle
        chrome.storage.local.set({ 
            is_automation_running: false, 
            auto_trigger_share: false 
        });
        
        // ⚠️ DELIBERATELY COMPROMISED: We NO LONGER clear `scheduled_config` or alarms here!
        // Pressing "STOP" only halts the *current* execution.
        // The recurring schedule stays alive and will trigger again normally later.
        // (Full deactivation happens via the UI's DEACTIVATE button sending `clear_schedule_alarm`)
        
        // 2. Broadcast to all Facebook tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url && tab.url.includes("facebook.com")) {
                    chrome.tabs.sendMessage(tab.id, { type: 'stop_automation' }).catch(() => {});
                }
            });
        });
    }

    // Scheduling Alarm Logic
    if (msg.type === 'set_schedule_alarm') {
        if (msg.recurring) {
            let nextDelay = msg.period;
            if (msg.isRandom && msg.maxPeriod) {
                nextDelay = Math.random() * (msg.maxPeriod - msg.period) + msg.period;
            }
            const nextTime = Date.now() + (nextDelay * 60000);
            chrome.alarms.create('batch_schedule_alarm', { 
                delayInMinutes: nextDelay 
            });
            chrome.storage.local.set({ 'next_trigger_time': nextTime });
            console.log(`🔁 Recurring Trigger set: Next in ${nextDelay.toFixed(2)} mins. Next: ${new Date(nextTime).toLocaleTimeString()}`);
        } else {
            const targetTime = msg.time;
            chrome.alarms.create('batch_schedule_alarm', { when: targetTime });
            chrome.storage.local.set({ 'next_trigger_time': targetTime });
            console.log('📅 One-time Alarm set for:', new Date(targetTime).toLocaleString());
        }
    }
    
    if (msg.type === 'clear_schedule_alarm') {
        chrome.alarms.clear('batch_schedule_alarm');
        chrome.storage.local.remove(['next_trigger_time']);
        console.log('🗑️ Schedule Alarm Cleared.');
    }

    if (msg.type === 'RESOLVE_FB_LINK') {
        resolveFbShareLink(msg.url).then(resolvedUrl => {
            sendResponse({ url: resolvedUrl });
        }).catch(err => {
            sendResponse({ url: msg.url });
        });
        return true; 
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'batch_schedule_alarm') {
        console.log('⏰ Trigger Alarm Fired!');
        
        // ✅ INSTANT FOCUS: Drop the panel lock and focus FB tab immediately
        chrome.runtime.sendMessage({ type: 'status_update', running: true }); 
        
        chrome.storage.local.get(['scheduled_config', 'trigger_logs'], (res) => {
            const config = res.scheduled_config;
            if (!config) return;

            // Log the trigger
            const currentLogs = res.trigger_logs || [];
            const nextRunNum = currentLogs.length + 1;
            const newLog = {
                run: nextRunNum,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
                status: 'STARTED'
            };
            currentLogs.unshift(newLog);
            const trimmedLogs = currentLogs.slice(0, 30); // Keep last 30
            chrome.storage.local.set({ trigger_logs: trimmedLogs });

            // Instantly focus an existing Facebook tab if possible before processing storage
            chrome.tabs.query({ url: "*://*.facebook.com/*" }, (tabs) => {
                const bestTab = tabs.length > 0 ? tabs[0] : null;
                if (bestTab) {
                    chrome.tabs.update(bestTab.id, { active: true }, () => {
                        if (chrome.runtime.lastError) {}
                    });
                    if (bestTab.windowId) {
                        chrome.windows.update(bestTab.windowId, { focused: true, drawAttention: true }, () => {
                            if (chrome.runtime.lastError) {}
                        });
                    }
                }

                // Update NEXT trigger time for repeating tasks
                if (config.isRecurring) {
                    let nextDelay = config.periodMins;
                    if (config.isRandom && config.maxPeriodMins) {
                        nextDelay = Math.random() * (config.maxPeriodMins - config.periodMins) + config.periodMins;
                    }
                    const nextTime = Date.now() + (nextDelay * 60000);
                    chrome.storage.local.set({ 'next_trigger_time': nextTime }, () => {
                        chrome.alarms.create('batch_schedule_alarm', { delayInMinutes: nextDelay });
                        console.log(`🔁 Re-queued next random trigger: Next in ${nextDelay.toFixed(2)} mins.`);
                    });
                }

                // ── MULTI-LINK ROTATOR: pick next URL if enabled ──────────────
                // If useRotator is set on the config, read the next link from
                // rotatorLinks[rotatorIndex], advance the index, and use that URL.
                async function _launchWithUrl(rawUrl) {
                    const finalUrl = await resolveFbShareLink(rawUrl);
                    console.log(`🔗 [ALARM] Resolved URL: ${rawUrl} -> ${finalUrl}`);

                    // 1. Prepare storage for Automation Flow
                    chrome.storage.local.set({
                        'auto_trigger_share': true,
                        'all_batches': config.batches,
                        'total_groups_count': config.totalGroups,
                        'groups_processed_so_far': 0,
                        'current_batch_index': 0,
                        'current_batch_delay': config.batchDelay,
                        'current_post_url': finalUrl,
                        'auto_select_groups': config.batches[0] // Load first batch
                    }, () => {
                    // 2. Locate Best Tab — respects New Tab Mode flag
                    const executeInTab = (tabId) => {
                        safeTabUpdate(tabId, { url: finalUrl }, (updatedTab) => {
                            if (!updatedTab) {
                                // Fallback if tab was closed between check and update
                                chrome.tabs.create({ url: finalUrl }, (newTab) => {
                                    chrome.storage.local.set({ lastAutomationTabId: newTab.id });
                                    chrome.windows.update(newTab.windowId, { focused: true, drawAttention: true });
                                });
                            } else {
                                chrome.storage.local.set({ lastAutomationTabId: tabId });
                                // ✅ Focus the Facebook browser window
                                if (updatedTab.windowId) {
                                    chrome.windows.update(updatedTab.windowId, { focused: true, drawAttention: true }, () => {
                                        if (chrome.runtime.lastError) {}
                                    });
                                    console.log('🪟 [ALARM] Facebook window focused.');
                                }
                            }
                        });
                        console.log('🚀 Automation Triggered Successfully in Facebook Tab!');
                        // Notify extension panel (runtime.sendMessage → extension pages only)
                        chrome.runtime.sendMessage({ type: 'status_update', running: true });
                        // Notify content scripts (networkWatcher.js) — must use tabs.sendMessage
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tabId, { type: 'status_update', running: true }, () => {
                                if (chrome.runtime.lastError) {} // tab may not be ready yet, storage fallback handles it
                            });
                        }, 3000); // wait 3s for page/content scripts to load after URL change

                        if (!config.isRecurring) {
                            chrome.storage.local.remove(['scheduled_config', 'next_trigger_time']);
                        }
                    };

                    // -- NEW TAB MODE: check tabAutoMode for scheduled triggers --
                    chrome.storage.local.get(['tabAutoMode'], (tabModeRes) => {
                        const tabModeOn = tabModeRes.tabAutoMode === true;

                        if (tabModeOn) {
                            // New Tab Mode ON -> open a brand new tab
                            console.log('[ALARM] New Tab Mode ON - creating new tab...');
                            chrome.tabs.create({ url: finalUrl, active: true }, (newTab) => {
                                chrome.storage.local.set({ lastAutomationTabId: newTab.id });
                                if (newTab.windowId) {
                                    chrome.windows.update(newTab.windowId, { focused: true, drawAttention: true }, () => {
                                        if (chrome.runtime.lastError) {}
                                    });
                                }
                                console.log('[ALARM] New Tab Mode: new tab opened:', newTab.id);
                                chrome.runtime.sendMessage({ type: 'status_update', running: true });
                                setTimeout(() => {
                                    chrome.tabs.sendMessage(newTab.id, { type: 'status_update', running: true }, () => {
                                        if (chrome.runtime.lastError) {}
                                    });
                                }, 3000);
                                if (!config.isRecurring) {
                                    chrome.storage.local.remove(['scheduled_config', 'next_trigger_time']);
                                }
                            });
                        } else {
                            // Normal Mode -> reuse existing FB tab
                            if (bestTab) {
                                executeInTab(bestTab.id);
                            } else {
                                // No FB tab found, create a new one
                                chrome.tabs.create({ url: finalUrl }, (newTab) => {
                                    executeInTab(newTab.id);
                                });
                            }
                        }
                    });
                    // -----------------------------------------------------------

                    }); // end chrome.storage.local.set callback

                } // end _launchWithUrl

                // ─── URL SELECTION PRIORITY ──────────────────────────────
                // Priority 1: Remote Sheet Control (fetches Google Sheet live)
                // Priority 2: Multi-Link Rotator (cycles through saved links)
                // Priority 3: Manual URL from config

                chrome.storage.local.get(['remoteCtrlEnabled', 'remoteCtrlConfig', 'settings_sheet_url'], (rRes) => {
                    const remoteEnabled = rRes.remoteCtrlEnabled || false;
                    const remoteCfg = {
                        sheetTab:     'Remote',
                        urlColIdx:    0,
                        markerColIdx: 1,
                        markerValue:  'active',
                        skipHeader:   true,
                        ...(rRes.remoteCtrlConfig || {})
                    };

                    if (remoteEnabled && rRes.settings_sheet_url) {
                        // ── Priority 1: Remote Sheet Control ──────────────────
                        console.log('🌐 [ALARM] Remote Control: fetching from sheet tab:', remoteCfg.sheetTab);
                        _fetchRemoteUrl(rRes.settings_sheet_url, remoteCfg, (remoteUrl, err, shortLinksPool) => {
                            if (remoteUrl) {
                                console.log('🌐 [ALARM] Remote Control: using URL →', remoteUrl);
                                // Save last-used URL for panel display
                                const now = new Date();
                                chrome.storage.local.set({
                                    remoteCtrlLastUrl:  remoteUrl,
                                    remoteCtrlLastTime: now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true }),
                                    current_short_links_pool: shortLinksPool || [] // SAVE SHORT LINKS POOL
                                }, () => {
                                    _launchWithUrl(remoteUrl);
                                });
                            } else {
                                if (err) console.warn('🌐 [ALARM] Remote fetch error:', err, '— falling back');
                                else     console.warn('🌐 [ALARM] No active link in sheet — falling back to rotator/manual');
                                _useRotatorOrManual();
                            }
                        });
                    } else {
                        _useRotatorOrManual();
                    }

                    // ── Priority 2 + 3 helper ────────────────────────────────
                    function _useRotatorOrManual() {
                        if (config.useRotator) {
                            chrome.storage.local.get(['rotatorLinks', 'rotatorIndex'], (rotRes) => {
                                const rLinks = rotRes.rotatorLinks || [];
                                const rIndex = rotRes.rotatorIndex || 0;
                                if (rLinks.length === 0) {
                                    console.warn('⚠️ [ALARM] Rotator enabled but no links found, using config.url');
                                    _launchWithUrl(config.url);
                                    return;
                                }
                                const safeIndex  = rIndex % rLinks.length;
                                const chosenLink = rLinks[safeIndex];
                                const nextIndex  = (safeIndex + 1) % rLinks.length;
                                console.log(`🔁 [ALARM] Rotator: using link #${safeIndex + 1} "${chosenLink.name}" → ${chosenLink.url}`);
                                chrome.storage.local.set({ rotatorIndex: nextIndex }, () => {
                                    _launchWithUrl(chosenLink.url);
                                });
                            });
                        } else {
                            _launchWithUrl(config.url);
                        }
                    }
                }); // end remoteCtrl storage get

            }); // end chrome.tabs.query
        }); // end chrome.storage.local.get
    } // end alarm check
}); // end chrome.alarms.onAlarm

// ─── REMOTE SHEET FETCH (background service worker) ───────────────────────────
// Collects ALL "active" URLs from the sheet, then uses remoteCtrlIndex to
// pick which one to use this run. Advances index by 1 each alarm fire.
// This allows round-robin rotation across all "active" rows.
async function _fetchRemoteUrl(sheetUrl, cfg, cb) {
    try {
        // Extract sheet ID
        const urlObj = new URL(sheetUrl);
        const parts  = urlObj.pathname.split('/');
        const di     = parts.indexOf('d');
        if (di === -1 || di + 1 >= parts.length) throw new Error('Invalid sheet URL');
        const sheetId = parts[di + 1];

        const apiUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(cfg.sheetTab)}`;
        const resp = await fetch(apiUrl);
        let text = await resp.text();

        const prefix = 'google.visualization.Query.setResponse(';
        const pi = text.indexOf(prefix);
        if (pi === -1) throw new Error('Could not parse sheet response. Is it Public?');
        text = text.substring(pi + prefix.length, text.lastIndexOf(')'));

        const json = JSON.parse(text);
        if (json.status === 'error') throw new Error(json.errors[0].message);

        let rows = json.table.rows || [];
        if (cfg.skipHeader && rows.length > 0) rows = rows.slice(1);

        // ── Collect ALL active URLs & Short Links ──────────────────
        const activeUrls = [];
        const shortLinksPool = [];
        const shortLinkColIdx = 2; // Column C

        for (const row of rows) {
            if (!row.c) continue;
            const urlCell    = row.c[cfg.urlColIdx];
            const markerCell = cfg.markerColIdx >= 0 ? row.c[cfg.markerColIdx] : null;
            const shortLinkCell = row.c[shortLinkColIdx];

            // Collect Short Link from Column C
            if (shortLinkCell && shortLinkCell.v) {
                const slUrl = String(shortLinkCell.v).trim();
                if (slUrl.startsWith('http')) {
                    shortLinksPool.push(slUrl);
                }
            }

            // Collect Active URL
            if (!urlCell || !urlCell.v) continue;
            const url = String(urlCell.v).trim();
            if (!url.startsWith('http')) continue;

            if (cfg.markerColIdx < 0) {
                // No marker column → collect all URLs
                activeUrls.push(url);
            } else if (markerCell && markerCell.v) {
                const marker   = String(markerCell.v).trim().toLowerCase();
                const expected = cfg.markerValue.trim().toLowerCase();
                if (marker === expected) activeUrls.push(url);
            }
        }

        console.log(`🌐 [REMOTE] Found ${activeUrls.length} active link(s) and ${shortLinksPool.length} short links in "${cfg.sheetTab}"`);

        if (activeUrls.length === 0) {
            cb(null, null, shortLinksPool); // no active links found
            return;
        }

        if (activeUrls.length === 1) {
            // Only one active → use it directly (no index rotation needed)
            cb(activeUrls[0], null, shortLinksPool);
            return;
        }

        // ── Multiple active links → rotate using remoteCtrlIndex ──
        const indexRes = await new Promise(r =>
            chrome.storage.local.get(['remoteCtrlIndex'], r)
        );
        const currentIndex = (indexRes.remoteCtrlIndex || 0) % activeUrls.length;
        const nextIndex    = (currentIndex + 1) % activeUrls.length;
        const chosenUrl    = activeUrls[currentIndex];

        console.log(`🌐 [REMOTE] Rotating: using link #${currentIndex + 1}/${activeUrls.length} → ${chosenUrl}`);

        // Save next index
        await new Promise(r => chrome.storage.local.set({ remoteCtrlIndex: nextIndex }, r));

        cb(chosenUrl, null, shortLinksPool);

    } catch (err) {
        cb(null, err.message, []);
    }
}


// ─── UNIVERSAL WINDOW FOCUS + TOAST NOTIFICATION HANDLER ─────────────────────
// Content scripts send { action: 'FOCUS_FB_WINDOW', reason: '...' } to:
//   1. Focus the Facebook browser window (focused + drawAttention)
//   2. Show an OS-level toast notification (visible even in full-screen)

let _lastNotifyTime = 0; // debounce: max 1 notification per 20s
let _focusedTabId = null;

// Human-readable messages for each retry reason
const _notifyMessages = {
    share_menu_scan_retry:   'Share menu is slow to load. Retrying...',
    share_menu_not_found:    '❌ Share menu not found! Reloading batch...',
    dialog_slow:             'Group dialog is taking too long. Still waiting...',
    spinner_slow:            'Network slow — spinner still visible. Waiting...',
    dialog_timeout:          '⚠️ Group dialog timed out! Retrying batch...',
    checkbox_not_found:      'Group checkboxes not found. Retrying...',
    save_button_not_found:   'Save/Done button not found. Retrying...',
    post_button_not_found:   'POST button not found. Retrying...',
    // ── Page render failures (slow internet / Facebook blank page) ────────────
    page_not_rendered:       '⏳ Facebook page not loaded yet. Waiting for render...',
    page_render_failed:      '🔄 Facebook failed to render! Reloading and retrying...',
    network_offline:         '📵 No internet connection! Waiting to reconnect...',
    network_slow_2g:         '🐢 Very slow internet (2G). Facebook may not load properly.',
    network_back_online:     '✅ Internet restored! Resuming automation...',
    page_loading_spinner:    '⏳ Facebook page is loading. Please wait...',
    tab_discarded_recovery:  '🔄 Tab was suspended! Recovering automation...',
};

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.action === 'FOCUS_FB_WINDOW') {
        const tabId = sender.tab?.id;
        if (!tabId) return;

        // Force FB tab back to front — chained (not parallel) to avoid race condition
        const forceFocusFBTab = (attempt = 1) => {
            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError || !tab?.windowId) return;

                // Step 1: Make FB tab the active tab within its window
                chrome.tabs.update(tabId, { active: true }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn(`⚠️ [BG-FOCUS] tabs.update failed (attempt ${attempt}):`, chrome.runtime.lastError.message);
                        return;
                    }
                    // Step 2: AFTER tab is active, focus the window
                    chrome.windows.update(tab.windowId, { focused: true, drawAttention: true }, () => {
                        if (chrome.runtime.lastError) return;
                        console.log(`🪟 [BG-FOCUS] ✅ FB tab active + window focused (reason: ${msg.reason}, attempt: ${attempt})`);
                    });
                });
            });
        };

        // Attempt 1: immediately
        forceFocusFBTab(1);
        // Attempt 2: retry after 200ms (Chrome may block first attempt if user is mid-action)
        setTimeout(() => forceFocusFBTab(2), 200);

        // 2. Toast notification — debounced (max 1 per 20s to avoid spam)
        const now = Date.now();
        if (now - _lastNotifyTime < 20000) return;
        _lastNotifyTime = now;
        _focusedTabId = tabId;

        const reason = msg.reason || 'step retry';
        const notifyMsg = _notifyMessages[reason] || `Step retry: ${reason}`;

        chrome.notifications.create('fb_automation_alert', {
            type:     'basic',
            iconUrl:  'icon.png',
            title:    '🤖 FB Automation — Attention Needed',
            message:  notifyMsg,
            priority: 2,
            requireInteraction: false  // auto-dismiss after ~5s
        }, (notifId) => {
            if (chrome.runtime.lastError) {
                console.warn('⚠️ Notification failed:', chrome.runtime.lastError.message);
            } else {
                console.log(`🔔 [BG-NOTIFY] Toast shown: "${notifyMsg}"`);
            }
        });
    }
});

// Clicking the notification → bring Facebook tab to front
chrome.notifications.onClicked.addListener((notifId) => {
    if (notifId === 'fb_automation_alert' && _focusedTabId) {
        chrome.tabs.update(_focusedTabId, { active: true });
        chrome.tabs.get(_focusedTabId, (tab) => {
            if (tab?.windowId) chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });

        });
        chrome.notifications.clear('fb_automation_alert');
    }
});

// ─── DEBUGGER TYPING ENGINE ───────────────────────────────────────────────────
// Uses chrome.debugger (DevTools protocol) to simulate REAL trusted keystrokes.
// Required for Facebook's React editor which rejects all DOM-based text input.

let debuggerBusy = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'DEBUGGER_TYPE') {
        const tabId = sender.tab?.id;
        if (!tabId) {
            console.error('❌ [DEBUGGER] No tabId in sender.');
            sendResponse({ success: false, error: 'No tabId' });
            return true;
        }
        handleDebuggerTyping(tabId, msg.text)
            .then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e?.message }));
        return true; // Keep channel open for async response
    }
});

async function handleDebuggerTyping(tabId, text) {
    // Prevent concurrent attach conflicts
    let waited = 0;
    while (debuggerBusy && waited < 5000) {
        await new Promise(r => setTimeout(r, 100));
        waited += 100;
    }
    debuggerBusy = true;
    console.log(`🖊️ [DEBUGGER] Typing ${text.length} chars in tab ${tabId}...`);

    try {
        await chrome.debugger.attach({ tabId }, '1.3');
        await new Promise(r => setTimeout(r, 300)); // settle after attach

        for (const char of text) {
            const base = {
                text: char,
                unmodifiedText: char,
                key: char,
                windowsVirtualKeyCode: char.charCodeAt(0),
                nativeVirtualKeyCode: char.charCodeAt(0),
            };
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { ...base, type: 'keyDown' });
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
            await new Promise(r => setTimeout(r, 40)); // human-like delay
        }

        console.log('✅ [DEBUGGER] Typing complete.');
        await chrome.debugger.detach({ tabId });

    } catch (e) {
        console.error('❌ [DEBUGGER] Error:', e);
        try { await chrome.debugger.detach({ tabId }); } catch {}
        throw e;
    } finally {
        debuggerBusy = false;
    }
}

