document.addEventListener('DOMContentLoaded', () => {

  // ============================================================
  // INITIALIZE EXTRACTED MODULES
  // Functions defined in js/panel/ files, called here to set up
  // event listeners. Execution order matches original panel.js.
  // ============================================================
  initializeTooltips();   // panel_utils.js
  initGroupsUI();         // panel_groups_ui.js

  // ============================================================
  // NEW TAB MODE TOGGLE — tab_automation_manager.js
  // ============================================================
  (() => {
    const toggle   = document.getElementById('tab-auto-mode-toggle');
    const slider   = document.getElementById('tab-auto-mode-slider');
    const knob     = document.getElementById('tab-auto-mode-knob');
    const statusTx = document.getElementById('tab-auto-mode-status');
    if (!toggle || !slider || !knob || !statusTx) return;

    const applyVisual = (on) => {
      if (on) {
        slider.style.background    = 'rgba(30,178,255,0.6)';
        slider.style.borderColor   = 'rgba(30,178,255,0.8)';
        knob.style.transform       = 'translateX(18px)';
        knob.style.background      = '#1eb2ff';
        statusTx.style.color       = '#1eb2ff';
        statusTx.textContent       = 'ON';
      } else {
        slider.style.background    = 'rgba(255,255,255,0.1)';
        slider.style.borderColor   = 'rgba(255,255,255,0.15)';
        knob.style.transform       = 'translateX(0)';
        knob.style.background      = '#9ca3af';
        statusTx.style.color       = 'rgba(255,255,255,0.4)';
        statusTx.textContent       = 'OFF';
      }
    };

    // storage থেকে saved state load করো
    if (typeof TabAutomationManager !== 'undefined') {
      TabAutomationManager.isEnabled((on) => {
        toggle.checked = on;
        applyVisual(on);
      });

      toggle.addEventListener('change', () => {
        const on = toggle.checked;
        TabAutomationManager.setEnabled(on);
        applyVisual(on);
        console.log(`🔄 [PANEL] New Tab Mode: ${on ? 'ON' : 'OFF'}`);
      });
    }
  })();

  // ============================================================
  // MAIN APPLICATION ELEMENTS
  // ============================================================
  const shareBtn = document.getElementById('share-button');
  const delayInput = document.getElementById('share-delay');
  const randomizeCheckbox = document.getElementById('randomize-delay');
  const postContentArea = document.getElementById('post-content');

  // Signature
  const signatureToggleBtn = document.getElementById('signature-toggle-btn');
  const signatureContainer = document.getElementById('signature-container');
  const signatureEnabledCheckbox = document.getElementById('signature-enabled');
  const signatureTextarea = document.getElementById('signature-text');
  const signatureSaveBtn = document.getElementById('signature-save-btn');

  // Save Post Preset button
  const savePostPresetBtn = document.getElementById('save-post-preset-btn');

  // Visit Link button
  const visitLinkBtn = document.getElementById('visit-link-btn');
  if (visitLinkBtn) visitLinkBtn.textContent = '🚀 Start Auto Share';
  const targetPostUrlInput = document.getElementById('post-link-to-visit');
  const batchSizeInput = document.getElementById('batch-size-input');

  if (batchSizeInput) {
    batchSizeInput.addEventListener('input', () => {
       if (parseInt(batchSizeInput.value) > 10) {
          batchSizeInput.value = 10;
       }
    });
  }

  // --- SCHEDULING UI LOGIC (n8n Style) ---
  const postNowBtn = document.getElementById('post-now-btn');
  const postLaterBtn = document.getElementById('post-later-btn');
  const scheduleContainer = document.getElementById('schedule-input-container');
  const intervalType = document.getElementById('schedule-interval-type');
  const intervalValue = document.getElementById('schedule-interval-value');
  const intervalLabel = document.getElementById('schedule-interval-label');
  const previewText = document.getElementById('schedule-preview-text');
  let currentScheduleMode = 'now';

  // Caption Logic
  document.getElementById('open-captions-btn')?.addEventListener('click', () => showView('captions'));
  document.getElementById('back-from-captions')?.addEventListener('click', () => showView('main'));

  if (typeof CaptionManager !== 'undefined') {
    CaptionManager.init();
  }

  if (intervalType && intervalValue) {
    intervalType.addEventListener('change', updateSchedulePreview);
    intervalValue.addEventListener('input', updateSchedulePreview);
  }
  
  const scheduleRandomize = document.getElementById('schedule-randomize');
  const scheduleIntervalMax = document.getElementById('schedule-interval-max-value');
  
  if (scheduleRandomize) {
      scheduleRandomize.addEventListener('change', updateSchedulePreview);
  }
  if (scheduleIntervalMax) {
      scheduleIntervalMax.addEventListener('input', updateSchedulePreview);
  }

  // --- TRIGGER PRESETS & WORKFLOW LOGIC ---
  const groupPresetsDropdown = document.getElementById('groupPresetsDropdown');
  const triggerPresetsDropdown = document.getElementById('trigger-presets-dropdown');
  const saveWorkflowBtn = document.getElementById('save-workflow-btn');
  const schedulePresetsIcon = document.getElementById('schedulePresetsIcon');
  const triggerPresetsModal = document.getElementById('trigger-presets-manager-modal');
  const closeTriggerPresetsBtn = document.getElementById('close-trigger-presets-manager');

  function renderTriggerPresetsManager() {
    const container = document.getElementById('trigger-presets-list-container');
    const emptyState = document.getElementById('empty-trigger-presets-state');
    if (!container) return;

    chrome.storage.local.get(['triggerPresets'], (result) => {
      const presets = result.triggerPresets || [];
      if (presets.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }
      if (emptyState) emptyState.classList.add('hidden');

      container.innerHTML = presets.map(p => `
        <div class="preset-card" style="background:rgba(30,178,255,0.03); border:1px solid rgba(0,212,255,0.1); border-radius:15px; padding:15px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; transition:all 0.2s;">
          <div>
             <div style="color:#fff; font-weight:800; font-size:14px; letter-spacing:0.3px;">${p.name}</div>
             <div style="color:rgba(255,255,255,0.4); font-weight:600; font-size:10px; margin-top:4px;">
                🔄 ${p.isRandom ? (p.val + ' to ' + p.maxVal) : p.val} ${p.type} • 📦 Batch: ${p.batchSize || '10'} • ⏳ Delay: ${p.delayMin || 0}m ${p.delaySec || 30}s
             </div>
          </div>
          <div style="display:flex; gap:10px;">
             <button class="apply-workflow-btn" data-preset='${JSON.stringify(p)}' style="background:#1eb2ff; border:none; color:#fff; padding:6px 14px; border-radius:10px; font-size:11px; font-weight:800; cursor:pointer; box-shadow:0 3px 10px rgba(30,178,255,0.3);">Apply</button>
             <button class="delete-workflow-btn" data-id="${p.id}" style="background:rgba(255,82,82,0.1); border:1px solid rgba(255,82,82,0.25); color:#ff5252; width:34px; height:34px; border-radius:10px; font-size:12px; cursor:pointer;">🗑️</button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.apply-workflow-btn').forEach(btn => {
         btn.onclick = () => {
            const p = JSON.parse(btn.dataset.preset);
            
            // AUTO-FILL EVERYTHING!
            if (intervalType) intervalType.value = p.type || 'minutes';
            if (intervalValue) intervalValue.value = p.val || 30;
            if (document.getElementById('schedule-randomize')) document.getElementById('schedule-randomize').checked = p.isRandom || false;
            if (document.getElementById('schedule-interval-max-value')) document.getElementById('schedule-interval-max-value').value = p.maxVal || p.val || 30;
            if (document.getElementById('batch-size-input')) document.getElementById('batch-size-input').value = p.batchSize || 10;
            if (document.getElementById('batch-delay-min')) document.getElementById('batch-delay-min').value = p.delayMin || 0;
            if (document.getElementById('batch-delay-sec')) document.getElementById('batch-delay-sec').value = p.delaySec || 30;
            if (document.getElementById('post-link-to-visit')) document.getElementById('post-link-to-visit').value = p.postUrl || "";
            
            // Apply Multi-Select Group Presets
            if (p.checkedPresetIds && Array.isArray(p.checkedPresetIds)) {
                document.querySelectorAll('.quick-preset-checkbox').forEach(cb => {
                    cb.checked = p.checkedPresetIds.includes(cb.dataset.id);
                });
                if (typeof updateQuickPresetSelection === 'function') updateQuickPresetSelection();
            }
            
            updateSchedulePreview();
            triggerPresetsModal?.classList.add('hidden');
            showCustomAlert("Workflow Loaded", `Complete state "${p.name}" restored!`, "🚀");
         };
      });

      container.querySelectorAll('.delete-workflow-btn').forEach(btn => {
         btn.onclick = () => {
            if (!confirm("Are you sure you want to delete this workflow preset?")) return;
            const updated = presets.filter(pr => pr.id.toString() !== btn.dataset.id.toString());
            chrome.storage.local.set({ triggerPresets: updated }, () => {
               renderTriggerPresetsManager();
            });
         };
      });
    });
  }

  if (saveWorkflowBtn) {
    saveWorkflowBtn.addEventListener('click', () => {
      const name = prompt("Enter a name for this entire workflow preset:", "");
      if (!name) return;

      const checkedIds = [];
      document.querySelectorAll('.quick-preset-checkbox:checked').forEach(cb => checkedIds.push(cb.dataset.id));

      const p = {
        id: Date.now(),
        name,
        type: intervalType?.value || 'minutes',
        val: intervalValue?.value || 30,
        isRandom: document.getElementById('schedule-randomize')?.checked || false,
        maxVal: document.getElementById('schedule-interval-max-value')?.value || intervalValue?.value || 30,
        batchSize: document.getElementById('batch-size-input')?.value || 10,
        delayMin: document.getElementById('batch-delay-min')?.value || 1,
        delaySec: document.getElementById('batch-delay-sec')?.value || 30,
        postUrl: document.getElementById('post-link-to-visit')?.value || "",
        checkedPresetIds: checkedIds
      };

      chrome.storage.local.get(['triggerPresets'], (result) => {
        const presets = result.triggerPresets || [];
        presets.push(p);
        chrome.storage.local.set({ triggerPresets: presets }, () => {
          showCustomAlert("Workflow Saved", `Complete setup "${name}" is now stored!`, "💾");
          renderTriggerPresetsManager();
        });
      });
    });
  }

  if (schedulePresetsIcon) {
    schedulePresetsIcon.onclick = () => {
       triggerPresetsModal?.classList.remove('hidden');
       renderTriggerPresetsManager();
    };
  }

  if (closeTriggerPresetsBtn) {
    closeTriggerPresetsBtn.onclick = () => triggerPresetsModal?.classList.add('hidden');
  }

  const resetAllBtn = document.getElementById('reset-all-dashboard-btn');
  if (resetAllBtn) {
    resetAllBtn.onclick = () => {
       if (!confirm("Are you sure you want to reset all fields and selections to default?")) return;

       // 1. Reset Inputs
       const postUrlInput = document.getElementById('post-link-to-visit');
       if (postUrlInput) postUrlInput.value = "";

       const batchSize = document.getElementById('batch-size-input');
       if (batchSize) batchSize.value = 10;

       const waitMin = document.getElementById('batch-delay-min');
       if (waitMin) waitMin.value = 1;

       const waitSec = document.getElementById('batch-delay-sec');
       if (waitSec) waitSec.value = 30;

       if (intervalValue) intervalValue.value = 30;
       if (intervalType) intervalType.value = 'minutes';
       const randomizeCb = document.getElementById('schedule-randomize');
       if (randomizeCb) randomizeCb.checked = true;

       // 2. Uncheck All Groups & Presets
       document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = false);
       document.querySelectorAll('.quick-preset-checkbox').forEach(cb => cb.checked = false);
       
       const selectAllCb = document.getElementById('select-all-groups');
       if (selectAllCb) selectAllCb.checked = false;

       // 3. Reset Schedule Mode
       if (postNowBtn) postNowBtn.click();

       // 4. Update UI
       if (typeof updateQuickPresetSelection === 'function') updateQuickPresetSelection();
       if (typeof updateGroupCount === 'function') updateGroupCount(0);
       updateSchedulePreview();
       
       showCustomAlert("Dashboard Reset", "All fields have been cleared to default state.", "🔄");
    };
  }

  if (postNowBtn && postLaterBtn && scheduleContainer) {
    postNowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentScheduleMode = 'now';
      postNowBtn.classList.add('active');
      postLaterBtn.classList.remove('active');
      scheduleContainer.classList.add('hidden');
      if (visitLinkBtn) visitLinkBtn.textContent = '🚀 Start Auto Share';
    });

    postLaterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentScheduleMode = 'later';
      postLaterBtn.classList.add('active');
      postNowBtn.classList.remove('active');
      scheduleContainer.classList.remove('hidden');
      if (visitLinkBtn) visitLinkBtn.textContent = '🔁 Activate Trigger';
      updateSchedulePreview();
    });
  }

  const cancelTriggerBtn = document.getElementById('cancel-trigger-btn');
  const topCancelTriggerBtn = document.getElementById('top-cancel-trigger-btn');
  const activeTriggerInfo = document.getElementById('active-trigger-info');
  const topActiveTriggerInfo = document.getElementById('top-active-trigger-info');

  // ✅ CPU FIX: Declare countdown references + cache BEFORE deactivateAction
  // so that deactivateAction's closure can safely reference them.
  const countdownNode = document.getElementById('next-trigger-countdown');
  const topCountdownNode = document.getElementById('top-next-trigger-countdown');
  let _triggerActive = false;
  let _nextTriggerTime = null;

  const deactivateAction = () => {
    chrome.runtime.sendMessage({ type: 'clear_schedule_alarm' });
    addActivityLog(`Schedule trigger deactivated.`, 'deactivate', '🗑️');
    chrome.storage.local.remove(['scheduled_config', 'next_trigger_time'], () => {
         // ✅ CPU FIX: immediately clear local cache so countdown stops without waiting for 10s sync
         _triggerActive = false;
         _nextTriggerTime = null;
         showCustomAlert("Deactivated", "Your recurring trigger has been stopped.", "🛑");
         if (activeTriggerInfo) activeTriggerInfo.style.display = 'none';
         if (topActiveTriggerInfo) topActiveTriggerInfo.classList.add('hidden');
         if (countdownNode) countdownNode.textContent = "";
         if (document.getElementById('top-next-trigger-countdown')) document.getElementById('top-next-trigger-countdown').textContent = "";
         if (visitLinkBtn) visitLinkBtn.textContent = '🔁 Activate Trigger';
         if (previewText) updateSchedulePreview();
         
         updateSignalStatus(false);
    });
  };

  const checkActiveTrigger = () => {
    chrome.storage.local.get(['scheduled_config'], (res) => {
        if (activeTriggerInfo && res.scheduled_config && res.scheduled_config.isRecurring) {
            activeTriggerInfo.style.display = 'block';
            if (topActiveTriggerInfo) topActiveTriggerInfo.classList.remove('hidden');
            if (previewText) previewText.textContent = `🔄 Currently repeating every ${res.scheduled_config.intervalValue} ${res.scheduled_config.intervalType}.`;
            if (visitLinkBtn) visitLinkBtn.textContent = '🔁 Update Trigger';
            
            const conf = res.scheduled_config;
            updateUIProgress(0, conf.totalGroups, 1, conf.batches.length, `Trigger active: Every ${conf.intervalValue} ${conf.intervalType}`);
            
            updateSignalStatus(false);
        } else {
            if (activeTriggerInfo) activeTriggerInfo.style.display = 'none';
            if (topActiveTriggerInfo) topActiveTriggerInfo.classList.add('hidden');
        }
    });
  };

  if (cancelTriggerBtn) cancelTriggerBtn.addEventListener('click', (e) => { e.stopPropagation(); deactivateAction(); });
  if (topCancelTriggerBtn) topCancelTriggerBtn.addEventListener('click', (e) => { e.stopPropagation(); deactivateAction(); });

  // --- TRIGGER COUNTDOWN LOOP ---
  // ✅ CPU FIX: Only poll storage every 2s (was 1s), and skip DOM update entirely
  // when no trigger is scheduled. This halves the storage read rate and avoids
  // unnecessary work when the panel is idle.
  // (countdownNode, topCountdownNode, _triggerActive, _nextTriggerTime declared above)

  // Lightweight storage sync — runs every 10s to refresh the cache
  const _syncTriggerCache = () => {
    if (document.hidden) return; // ✅ CPU FIX: skip entirely if panel is backgrounded
    chrome.storage.local.get(['next_trigger_time', 'scheduled_config'], (res) => {
      _triggerActive = !!(res.next_trigger_time && res.scheduled_config);
      _nextTriggerTime = res.next_trigger_time || null;
      if (!_triggerActive) {
        if (countdownNode) countdownNode.textContent = '';
        if (topCountdownNode) topCountdownNode.textContent = '';
      }
    });
  };
  _syncTriggerCache();
  setInterval(_syncTriggerCache, 10000); // re-sync every 10s

  const _fastTick = () => {
    // ✅ CPU FIX: idle or hidden — skip entirely
    if (!_triggerActive || !_nextTriggerTime || document.hidden) return; 
    const now = Date.now();
    const diff = _nextTriggerTime - now;
    if (diff > 0) {
      const totalSec = Math.floor(diff / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      let timeStr = '';
      if (h > 0) timeStr += `${h}h `;
      if (m > 0 || h > 0) timeStr += `${m}m `;
      timeStr += `${s}s`;
      if (countdownNode) countdownNode.textContent = `Next trigger in: ${timeStr}`;
      if (topCountdownNode) topCountdownNode.textContent = `Next: ${timeStr}`;
    } else {
      if (countdownNode) countdownNode.textContent = 'Launching now...';
      if (topCountdownNode) topCountdownNode.textContent = 'Launching...';
    }
  };
  
  // Fast tick (2s) — only does math, no storage I/O, when trigger is active
  setInterval(_fastTick, 2000);

  // Resume updating immediately when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      _syncTriggerCache();
      _fastTick();
    }
  });

  checkActiveTrigger();

  if (visitLinkBtn) {
    visitLinkBtn.addEventListener('click', () => {
      // ── ROTATOR-AWARE / REMOTE-CONTROL-AWARE URL RESOLUTION ─────
      const rotatorActive    = window.MultiLinkRotator      && window.MultiLinkRotator.isEnabled();
      const remoteCtrlActive = window.RemoteLinkController  && window.RemoteLinkController.isEnabled();

      if (!rotatorActive && !remoteCtrlActive) {
        if (!targetPostUrlInput || !targetPostUrlInput.value.trim()) {
          showCustomAlert("Link Missing", "Please paste a Facebook post link first!", "🔗");
          return;
        }
        const _urlCheck = targetPostUrlInput.value.trim();
        if (!_urlCheck.includes('facebook.com')) {
          showCustomAlert("Invalid Link", "Please enter a valid Facebook link.", "⚠️");
          return;
        }
      }

      // INSTANT UI FEEDBACK: Show "Running" as soon as clicked
      updateSignalStatus(true);
      visitLinkBtn.textContent = '⏳ Initializing...';
      visitLinkBtn.disabled = true;

      const hintTxt = document.getElementById('detailed-status-hint');
      if (hintTxt) hintTxt.textContent = "Ready to start...";

      const targetTabId = getTargetTabId();
      if (!targetTabId) {
        showCustomAlert('Error', 'Could not find target Facebook tab. Try reopening the panel.', '❌');
        visitLinkBtn.disabled = false;
        visitLinkBtn.textContent = '🚀 Start Auto Share';
        updateSignalStatus(false); // Reset signal status on error
        return;
      }

      // ── CORE AUTOMATION (extracted so rotator can inject the URL) ─────────
      function _runWithUrl(rawUrl) {
        chrome.runtime.sendMessage({ type: 'RESOLVE_FB_LINK', url: rawUrl }, (res) => {
            const url = (res && res.url) ? res.url : rawUrl;
            if (targetPostUrlInput && targetPostUrlInput.value.trim() === rawUrl) {
                targetPostUrlInput.value = url;
            }
            
        // 1. Get ALL groups to select (Step 2 UI + Selected Presets)
        chrome.storage.local.get(['groupPresets'], (result) => {
          const presets = result.groupPresets || [];
          // Use an array to preserve order and duplicates
          const finalGroupsToSelect = [];

          // 1a. Grab from Step 2 Checkboxes
          document.querySelectorAll('.group-checkbox:checked').forEach(cb => {
              try {
                  const groupObj = JSON.parse(cb.dataset.groupObj);
                  finalGroupsToSelect.push(groupObj);
              } catch (e) {
                  const label = cb.nextElementSibling;
                  if (label) finalGroupsToSelect.push(normalizeGroupEntry(label.textContent.trim()));
              }
          });

          // 1b. Grab from Checked Presets in Dropdown
          const checkedPresetCbs = document.querySelectorAll('.quick-preset-checkbox:checked');
          checkedPresetCbs.forEach(cb => {
              const preset = presets.find(p => p.id === cb.dataset.id);
              if (preset && preset.groups) {
                  preset.groups.forEach(g => finalGroupsToSelect.push(normalizeGroupEntry(g)));
              }
          });

          if (finalGroupsToSelect.length === 0) {
              showCustomAlert("No Groups Selected", "Please select a preset or an individual group to share to.", "⚠️");
              visitLinkBtn.disabled = false;
              visitLinkBtn.textContent = '🚀 Start Auto Share';
              return;
          }

          // --- BATCH LOGIC ---
          const batchSizeInput = document.getElementById('batch-size-input');
          const batchSize = parseInt(batchSizeInput ? batchSizeInput.value : 10) || 10;
          
          const bDelayMin = document.getElementById('batch-delay-min');
          const bDelaySec = document.getElementById('batch-delay-sec');
          const userBatchDelay = (parseInt(bDelayMin ? bDelayMin.value : 1) * 60) + (parseInt(bDelaySec ? bDelaySec.value : 30) || 0);

          // Split finalGroupsToSelect into chunks
          const batches = [];
          for (let i = 0; i < finalGroupsToSelect.length; i += batchSize) {
            batches.push(finalGroupsToSelect.slice(i, i + batchSize));
          }

          console.log(`📦 Initializing Batching: ${batches.length} batches. Delay: ${userBatchDelay}s`);
          
          const totalGroups = finalGroupsToSelect.length;

          if (currentScheduleMode === 'later') {
            const type = intervalType ? intervalType.value : 'minutes';
            const val = parseInt(intervalValue ? intervalValue.value : 30) || 10;
            const isRandom = document.getElementById('schedule-randomize')?.checked || false;
            const maxVal = parseInt(document.getElementById('schedule-interval-max-value')?.value) || val;
            
            let periodMins = val;
            let maxPeriodMins = maxVal;
            if (type === 'seconds') { periodMins = val / 60; maxPeriodMins = maxVal / 60; }
            if (type === 'hours') { periodMins = val * 60; maxPeriodMins = maxVal * 60; }
            if (type === 'days') { periodMins = val * 1440; maxPeriodMins = maxVal * 1440; }

            // Store for persistence. useRotator=true tells background.js to call
            // getNextLink() storage logic on each alarm fire so it auto-cycles.
            chrome.storage.local.set({
                'scheduled_config': {
                     url: url,
                     batches: batches,
                     totalGroups: totalGroups,
                     batchDelay: userBatchDelay,
                     isRecurring: true,
                     intervalValue: val,
                     intervalMax: maxVal,
                     isRandom: isRandom,
                     intervalType: type,
                     periodMins: periodMins,
                     maxPeriodMins: maxPeriodMins,
                     useRotator: rotatorActive  // ← rotator flag for background.js
                }
            }, () => {
                chrome.runtime.sendMessage({ 
                    type: 'set_schedule_alarm', 
                    recurring: true,
                    period: periodMins,
                    maxPeriod: maxPeriodMins,
                    isRandom: isRandom,
                    url: url
                });
                
                const rotatorNote = rotatorActive ? ' 🔁 Rotator: ON' : '';
                const alertTxt = isRandom ? `Every ${val} to ${maxVal} ${type}` : `Every ${val} ${type}`;
                showCustomAlert("Trigger Activated", `Automation will run: ${alertTxt}.${rotatorNote}`, "🔄");
                updateUIProgress(0, totalGroups, 1, batches.length, `Trigger active: ${alertTxt}`);
                visitLinkBtn.disabled = false;
                visitLinkBtn.textContent = '🔁 Update Trigger';
                
                // IMMEDIATELY SHOW THE DEACTIVATE BUTTON
                checkActiveTrigger();
                updateSignalStatus(false);
            });
            return;
          }

          // 2. Standard "Now" Flow
          
          // ✅ INSTANT FOCUS: Release panel focus lock *before* flipping to the FB tab
          if (typeof window._wfm_onBatchRunning === 'function') {
              window._wfm_onBatchRunning();
          }

          // Bring FB tab to front immediately
          chrome.tabs.update(targetTabId, { active: true }, () => {});
          chrome.tabs.get(targetTabId, tab => {
              if (tab && tab.windowId) {
                  chrome.windows.update(tab.windowId, { focused: true, drawAttention: true }, () => {});
              }
          });

          chrome.storage.local.set({ 
              'auto_trigger_share': true,
              'all_batches': batches,
              'total_groups_count': totalGroups,
              'groups_processed_so_far': 0,
              'current_batch_index': 0,
              'current_batch_delay': userBatchDelay,
              'current_post_url': url,
              'auto_select_groups': batches[0] // Load first batch immediately
            }, () => {

              // ── NEW TAB MODE CHECK ─────────────────────────────────
              const _doNavigate = (tabId) => {
                 currentBatchRetries = 0;
                 chrome.tabs.update(tabId, { url: url }, (updatedTab) => {
                    if (chrome.runtime.lastError) {
                       console.error("Tab update error:", chrome.runtime.lastError.message);
                       return;
                    }
                    console.log("🚀 Automation Started in Tab: " + tabId);
                    updateUIProgress(0, totalGroups, 1, batches.length, "Navigating to URL...");
                    setTimeout(() => {
                       if (visitLinkBtn) {
                         visitLinkBtn.textContent = '🚀 Start Auto Share';
                         visitLinkBtn.disabled = false;
                       }
                    }, 2000);
                 });
              };

              const _launchInNewTab = () => {
                 currentBatchRetries = 0;
                 TabAutomationManager.openTab(url, (newTabId) => {
                    console.log("🆕 [PANEL] New Tab Mode: automation tab opened: " + newTabId);
                    updateUIProgress(0, totalGroups, 1, batches.length, "Navigating to URL...");
                    setTimeout(() => {
                       if (visitLinkBtn) {
                         visitLinkBtn.textContent = '🚀 Start Auto Share';
                         visitLinkBtn.disabled = false;
                       }
                    }, 2000);
                 });
              };

              if (typeof TabAutomationManager !== 'undefined') {
                TabAutomationManager.isEnabled((tabModeOn) => {
                  if (tabModeOn) {
                    // New Tab Mode ON → নতুন ট্যাব ওপেন করো
                    _launchInNewTab();
                  } else {
                    // Normal Mode → আগের মতো existing tab-এ নেভিগেট করো
                    provideActiveTab((verifiedTabId) => {
                        chrome.tabs.get(verifiedTabId, (currentTab) => {
                           if (chrome.runtime.lastError || !currentTab || !currentTab.windowId) {
                               chrome.tabs.create({ url: url }, (newTab) => {
                                  console.log("Created new tab as last resort.");
                               });
                               return;
                           }
                           _doNavigate(verifiedTabId);
                        });
                    });
                  }
                });
              } else {
                // TabAutomationManager না থাকলে fallback
                provideActiveTab((verifiedTabId) => {
                    chrome.tabs.get(verifiedTabId, (currentTab) => {
                       if (chrome.runtime.lastError || !currentTab || !currentTab.windowId) {
                           chrome.tabs.create({ url: url }, (newTab) => {
                              console.log("Created new tab as last resort.");
                           });
                           return;
                       }
                       _doNavigate(verifiedTabId);
                    });
                });
              }

            });
        });
        });
      } // end _runWithUrl

      // ── DECIDE URL SOURCE ──────────────────────────────────────────
      // Priority: Remote Sheet Control > Rotator > Manual URL
      if (remoteCtrlActive) {
        // Fetch active URL(s) from Google Sheet using rotation index
        window.RemoteLinkController.testFetch(result => {
          if (!result.ok || !result.nextUrl) {
            showCustomAlert("Remote Control", result.error || "No active link found in sheet.", "🌐");
            visitLinkBtn.disabled = false;
            visitLinkBtn.textContent = '🚀 Start Auto Share';
            updateSignalStatus(false);
            return;
          }
          const remoteUrl = result.nextUrl;
          const shortLinksPool = result.shortLinksPool || [];
          // Advance the index for next run
          const nextIdx = (result.currentIdx + 1) % result.urls.length;
          chrome.storage.local.set({ 
            remoteCtrlIndex: nextIdx,
            current_short_links_pool: shortLinksPool
          }, () => {
            console.log(`🌐 [Remote] Using link #${result.currentIdx + 1}: ${remoteUrl} | Short links fetched: ${shortLinksPool.length}`);
            if (targetPostUrlInput) targetPostUrlInput.value = remoteUrl;
            _runWithUrl(remoteUrl);
          });
        });
      } else if (rotatorActive) {
        // Get next link from rotator (advances rotation index in storage)
        window.MultiLinkRotator.getNextLink((rotatorUrl) => {
          if (!rotatorUrl) {
            showCustomAlert("Rotator Error", "No links in rotator list. Please add links or disable rotation.", "🔁");
            visitLinkBtn.disabled = false;
            visitLinkBtn.textContent = '🚀 Start Auto Share';
            updateSignalStatus(false);
            return;
          }
          console.log(`🔁 [Rotator] Using link: ${rotatorUrl}`);
          if (targetPostUrlInput) targetPostUrlInput.value = rotatorUrl;
          _runWithUrl(rotatorUrl);
        });
      } else {
        _runWithUrl(targetPostUrlInput.value.trim());
      }

    });
  }


  // CENTRAL LOGGING HELPER
  function addActivityLog(dataOrMsg) {
    chrome.storage.local.get(['activityLogs', 'currentRunNumber'], (res) => {
      const logs = res.activityLogs || [];
      const runNum = res.currentRunNumber || 1;
      
      let finalData = {};
      if (typeof dataOrMsg === 'string') {
          finalData = { msg: dataOrMsg, status: 'info', icon: '📝' };
      } else {
          finalData = dataOrMsg;
      }

      const newLog = {
        id: Date.now(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        runNumber: finalData.runNumber || runNum,
        msg: finalData.msg || '',
        status: finalData.status || 'info', // success, failed, info
        groupName: finalData.groupName || '',
        postContent: finalData.postContent || '',
        icon: finalData.icon || (finalData.status === 'success' ? '✅' : '🔄')
      };
      
      logs.unshift(newLog);
      const trimmed = logs.slice(0, 1000); // Keep last 1000
      chrome.storage.local.set({ activityLogs: trimmed }, () => {
        if (document.getElementById('activity-log-modal')?.classList.contains('show')) {
           renderActivityLogs();
        }
      });
    });
  }

  // ── BATCH version: single atomic storage write for multiple log entries ────
  function addActivityLogBatch(entries) {
    chrome.storage.local.get(['activityLogs', 'currentRunNumber'], (res) => {
      const logs = res.activityLogs || [];
      const runNum = res.currentRunNumber || 1;
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

      const newLogs = entries.map((entry, i) => ({
        id: Date.now() + i,
        time: timeStr,
        timestamp: timeStr,
        runNumber: runNum,
        msg: entry.msg || '',
        status: entry.status || 'success',
        groupName: entry.groupName || '',
        postContent: entry.postContent || '',
        icon: entry.icon || '✅'
      }));

      // Prepend all at once — ONE write, no race condition
      const updatedLogs = [...newLogs, ...logs].slice(0, 1000);
      chrome.storage.local.set({ activityLogs: updatedLogs }, () => {
        if (document.getElementById('activity-log-modal')?.classList.contains('show')) {
          renderActivityLogs();
        }
      });
    });
  }

  // ── ACTIVITY STATS UI ─────────────────────────────────────
  const stats = { success: 0, failed: 0, total: 0 };
  function updateActivityStatsUI() {
    const el = document.getElementById('activity-stats');
    if (el) el.textContent = `✅ ${stats.success} | ❌ ${stats.failed}`;
  }

  // ============================================================
  // INITIALIZE AUTOMATION LISTENERS (panel_automation.js)
  // Must be called after addActivityLog/addActivityLogBatch/
  // updateUIProgress/renderActivityLogs/updateSignalStatus are
  // defined above (even though those are closures here — the
  // global versions in panel_automation.js reference their own
  // implementations; the core panel.js ones are the authoritative
  // versions, panel_automation.js functions are used only for
  // the message listener and button wiring).
  // ============================================================
  initAutomationListeners();  // panel_automation.js

  // ============================================================
  // LISTENER for Live Progress Updates from Content Scripts
  // (Supplemental — the primary listener is in panel_automation.js
  //  via initAutomationListeners())
  // ============================================================

  // ============================================================
  // SIGNATURE FUNCTIONALITY
  // ============================================================
  // Load saved signature
  chrome.storage.local.get(['signature_text', 'signature_enabled'], (result) => {
    if (signatureTextarea && result.signature_text) {
      signatureTextarea.value = result.signature_text;
    }
    if (signatureEnabledCheckbox && result.signature_enabled) {
      signatureEnabledCheckbox.checked = result.signature_enabled;
    }
  });

  if (signatureToggleBtn) {
    signatureToggleBtn.addEventListener('click', () => {
      if (signatureContainer) {
        signatureContainer.classList.toggle('hidden');
        signatureToggleBtn.textContent = signatureContainer.classList.contains('hidden')
          ? '✍️ Add Signature'
          : '✍️ Hide Signature';
      }
    });
  }

  if (signatureSaveBtn) {
    signatureSaveBtn.addEventListener('click', () => {
      const text = signatureTextarea ? signatureTextarea.value : '';
      const enabled = signatureEnabledCheckbox ? signatureEnabledCheckbox.checked : false;
      chrome.storage.local.set({ signature_text: text, signature_enabled: enabled }, () => {
        signatureSaveBtn.textContent = '✅ Saved!';
        setTimeout(() => { signatureSaveBtn.textContent = '💾 Save'; }, 2000);
      });
    });
  }

  // ============================================================
  // SAVE AS POST PRESET (Save post text as template)
  // ============================================================
  if (savePostPresetBtn) {
    savePostPresetBtn.addEventListener('click', () => {
      const postText = postContentArea ? postContentArea.value.trim() : '';
      if (!postText) {
        showCustomAlert('No Content', 'Please enter some post content first before saving as a template!', '📝');
        return;
      }
      const name = prompt('Enter a name for this post template:', '');
      if (!name || !name.trim()) return;

      chrome.storage.local.get(['postTemplates'], (result) => {
        const postTemplates = result.postTemplates || {};
        if (postTemplates[name.trim()]) {
          if (!confirm(`A template named "${name.trim()}" already exists. Replace it?`)) return;
        }
        postTemplates[name.trim()] = postText;
        chrome.storage.local.set({ postTemplates }, () => {
          savePostPresetBtn.textContent = '✅ Saved!';
          setTimeout(() => { savePostPresetBtn.textContent = '💾 Save as Preset'; }, 2000);
        });
      });
    });
  }

  // ============================================================
  // BUTTON: Share to Groups
  // ============================================================
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const selectedGroups = [];
      document.querySelectorAll('.group-checkbox:checked').forEach(cb => {
        const label = cb.nextElementSibling;
        if (label) selectedGroups.push(label.textContent.trim());
      });

      if (selectedGroups.length === 0) {
        const targetTabId = getTargetTabId();
        if (targetTabId) {
          chrome.tabs.sendMessage(targetTabId, { type: 'trigger_page_share' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              showCustomAlert('No Groups Selected', 'Please select at least one group (either in this popup or on the page).', '👥');
            }
          });
        }
        return;
      }

      // 1. INCREMENT RUN NUMBER & LOG START
      chrome.storage.local.get(['currentRunNumber', 'post-content'], (res) => {
          const nextRun = (res.currentRunNumber || 0) + 1;
          const msgBody = postContentArea ? postContentArea.value : '';
          chrome.storage.local.set({ 
              currentRunNumber: nextRun,
              post_content: msgBody // For Log Display
          }, () => {
              addActivityLog({ msg: `Campaign Run #${nextRun} started with ${selectedGroups.length} groups.`, icon: '🚀', status: 'info' });
          });
      });

      // Get signature
      let postSignature = null;
      if (signatureEnabledCheckbox && signatureEnabledCheckbox.checked && signatureTextarea) {
        postSignature = signatureTextarea.value.trim() || null;
      }

      const message = postContentArea ? postContentArea.value : '';
      const delay = delayInput ? parseInt(delayInput.value) : 30;
      const randomize = randomizeCheckbox ? randomizeCheckbox.checked : false;

      // Repeat controls
      const repeatCountInput = document.getElementById('repeat-count');
      const repeatDelayMinInput = document.getElementById('repeat-delay-min');
      const repeatDelaySecInput = document.getElementById('repeat-delay-sec');
      
      const repeatCount = repeatCountInput ? parseInt(repeatCountInput.value) || 1 : 1;
      const repeatDelayMin = repeatDelayMinInput ? parseInt(repeatDelayMinInput.value) || 0 : 0;
      const repeatDelaySec = repeatDelaySecInput ? parseInt(repeatDelaySecInput.value) || 0 : 0;
      const repeatDelayTotalMs = ((repeatDelayMin * 60) + repeatDelaySec) * 1000;

      const targetTabId = getTargetTabId();
      
      // Read caption group dropdown directly here (fix scope issue)
      const captionGroupEl = document.getElementById('active-caption-group');
      const captionGroupValue = captionGroupEl ? captionGroupEl.value : null;
      
      console.log('🎬 [PANEL] Share button clicked!');
      console.log('📁 [PANEL] Caption group selected:', captionGroupValue || '(none)');
      console.log('👥 [PANEL] Groups to share:', selectedGroups);

      if (targetTabId) {
        const msgPayload = {
          type: "share_to_groups",
          groups: selectedGroups,
          postContent: message,
          postSignature: postSignature,
          activeCaptionGroup: captionGroupValue || null,
          delay: delay,
          randomizeDelay: randomize,
          repeatCount: repeatCount,
          repeatDelayMs: repeatDelayTotalMs
        };
        console.log('📤 [PANEL] Sending message to tab:', msgPayload);
        chrome.tabs.sendMessage(targetTabId, msgPayload, (response) => {
          if (chrome.runtime.lastError) {
             console.warn("Share failed: Connection lost.", chrome.runtime.lastError);
             showCustomAlert("Connection Lost", "Error: Connection lost to Facebook tab. Please refresh the page.", "❌");
          } else {
             console.log('✅ [PANEL] Message delivered to tab. Response:', response);
          }
        });
      }
    });
  }


  // ============================================================
  // HEADER ICON: 📝 Saved Post Templates (Address Book)
  // ============================================================
  const addressBookIcon = document.getElementById('addressBookIcon');
  if (addressBookIcon) {
    addressBookIcon.addEventListener('click', () => {
      showView('templates');  // Show view first so DOM elements are visible
      // Small delay to ensure DOM is rendered before init tries to find elements
      setTimeout(() => {
        if (typeof initializeAddressBook === 'function') {
          initializeAddressBook(showView);
        }
      }, 20);
    });
  }

  // ============================================================
  // HEADER ICON: 📋 Caption Manager
  // ============================================================
  const captionManagerIcon = document.getElementById('captionManagerIcon');
  if (captionManagerIcon) {
    captionManagerIcon.addEventListener('click', () => {
      showView('captions');
      if (typeof CaptionManager !== 'undefined') {
        CaptionManager.init();
      }
    });
  }

  // ============================================================
  // HEADER ICON: ⚡ 1 Click Share Templates
  // ============================================================
  const oneClickTemplatesIcon = document.getElementById('oneClickTemplatesIcon');
  if (oneClickTemplatesIcon) {
    oneClickTemplatesIcon.addEventListener('click', () => {
      // Initialize one-click templates and open manager
      if (typeof initializeOneClickTemplates === 'function') {
        initializeOneClickTemplates(showView);
      }
      // Open the manager modal directly
      const managerModal = document.getElementById('one-click-manager-modal');
      if (managerModal) {
        managerModal.classList.remove('hidden');
        // Populate templates list
        if (window.oneClickTemplates && window.oneClickTemplates.showManagerModal) {
          window.oneClickTemplates.showManagerModal();
        }
      }
    });
  }

  // ============================================================
  // INITIALIZE PRESETS UI (panel_presets.js)
  // ============================================================
  initPresetsUI();

  // ============================================================
  // HEADER ICON: ⚙️ Settings
  // ============================================================
  const settingsIcon = document.getElementById('settingsIcon');
  const settingsPanel = createSettingsPanel();
  document.querySelector('.wrapper').appendChild(settingsPanel);
  initSettingsUI(settingsPanel, settingsIcon, delayInput, randomizeCheckbox);

  // ============================================================
  // INITIALIZE MODULES
  // ============================================================
  // Initialize 1 Click Templates module
  if (typeof initializeOneClickTemplates === 'function') {
    initializeOneClickTemplates(showView);
  }

  // Close one-click modals
  const closeCreateOneClick = document.getElementById('close-create-one-click');
  if (closeCreateOneClick) {
    closeCreateOneClick.addEventListener('click', () => {
      document.getElementById('create-one-click-modal')?.classList.add('hidden');
    });
  }

  const closeOneClickManager = document.getElementById('close-one-click-manager');
  if (closeOneClickManager) {
    closeOneClickManager.addEventListener('click', () => {
      document.getElementById('one-click-manager-modal')?.classList.add('hidden');
    });
  }

  // ============================================================
  // LINK MANAGER FUNCTIONALITY
  // ============================================================
  const linkManagerIcon = document.getElementById('linkManagerIcon');
  if (linkManagerIcon) {
    linkManagerIcon.addEventListener('click', () => {
      showView('links');
      if (typeof initializeLinksManager === 'function') {
        initializeLinksManager(showView);
      }
    });
  }

  // ============================================================
  // QUICK LINK SELECT DROPDOWN
  // ============================================================
  const savedLinksDropdown = document.getElementById('saved-links-dropdown');

  function updateLinkDropdown() {
    if (!savedLinksDropdown) return;
    chrome.storage.local.get(['savedLinks'], (result) => {
      const links = result.savedLinks || [];
      // Keep first two options
      savedLinksDropdown.innerHTML = `
        <option value="">-- Quick Select Saved Link --</option>
        <option value="manual">➕ Manual Link Input</option>
      `;
      links.forEach(link => {
        const opt = document.createElement('option');
        opt.value = link.url;
        opt.textContent = `🔗 ${link.name}`;
        savedLinksDropdown.appendChild(opt);
      });
    });
  }

  if (savedLinksDropdown) {
    savedLinksDropdown.addEventListener('change', () => {
      const val = savedLinksDropdown.value;
      if (val === 'manual' || val === '') {
        if (targetPostUrlInput) targetPostUrlInput.value = '';
      } else {
        if (targetPostUrlInput) targetPostUrlInput.value = val;
      }
    });
  }

  // Initial populate
  updateLinkDropdown();

  // Listen for storage changes to keep dropdown in sync
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.savedLinks) {
      updateLinkDropdown();
    }
  });

  const saveCurrentLinkBtn = document.getElementById('save-current-link-btn');
  if (saveCurrentLinkBtn) {
    saveCurrentLinkBtn.addEventListener('click', () => {
      const url = targetPostUrlInput ? targetPostUrlInput.value.trim() : '';
      if (!url) {
        showCustomAlert('No Link', 'Please enter a link first before saving!', '🔗');
        return;
      }
      const name = prompt('Enter a name for this link:', '');
      if (!name || !name.trim()) return;

      chrome.storage.local.get(['savedLinks'], (result) => {
        const links = result.savedLinks || [];
        const newLink = {
          id: Date.now().toString(),
          name: name.trim(),
          url: url,
          createdAt: new Date().toLocaleDateString()
        };
        links.push(newLink);
        chrome.storage.local.set({ savedLinks: links }, () => {
          showCustomAlert('Success', 'Link saved successfully!', '✅');
          // No need to call renderLinksList here as the view is separate
        });
      });
    });
  }

  // Initial check
  chrome.storage.local.get(['is_automation_running'], (result) => {
    updateSignalStatus(result.is_automation_running);
  });

  // ============================================================
  // CAPTION DROPDOWN POPULATION
  // ============================================================
  const activeCaptionDropdown = document.getElementById('active-caption-group');
  
  async function updateCaptionDropdown() {
    if (!activeCaptionDropdown || typeof CaptionManager === 'undefined') return;
    const groups = await CaptionManager.getGroups();
    
    // Save current selection
    const currentVal = activeCaptionDropdown.value;
    
    activeCaptionDropdown.innerHTML = `<option value="">-- No Auto Caption --</option>`;
    groups.forEach(group => {
      const opt = document.createElement('option');
      opt.value = group;
      opt.textContent = `📁 ${group}`;
      activeCaptionDropdown.appendChild(opt);
    });
    
    // Restore selection if possible
    if (groups.includes(currentVal)) {
      activeCaptionDropdown.value = currentVal;
    }

    // Save selection to storage IMMEDIATELY when changed
    activeCaptionDropdown.onchange = () => {
       console.log('💾 [PANEL] Group changed:', activeCaptionDropdown.value);
       chrome.storage.local.set({ active_caption_group: activeCaptionDropdown.value });
    };

  }

  // Initial populate
  updateCaptionDropdown();

  // Listen for storage changes to keep dropdown in sync
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.managedCaptions) {
      updateCaptionDropdown();
    }
  });

  // ============================================================
  // SHOW UI
  // ============================================================
  document.body.classList.remove('hidden');
});
