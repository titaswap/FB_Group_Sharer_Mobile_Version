// ============================================================
// panel_presets.js
// Extracted from panel.js — Group Presets Manager (render,
// apply, delete, multi-select), Quick Preset Dropdown,
// Save Preset Modal, Link-to-Preset functionality,
// Trigger Presets (workflow) rendering.
// ZERO logic changes. pendingPresetGroups hoisted to global.
// ============================================================

// ============================================================
// SHARED STATE
// ============================================================
var pendingPresetGroups = [];

// ============================================================
// GROUP PRESETS MANAGER
// ============================================================
function openGroupPresetsManager() {
  const modal = document.getElementById('presets-manager-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderPresetsManager();
}

function applyGroupsToMainList(groups) {
  const normalizedGroups = groups.map(normalizeGroupEntry);

  const checkGroupsInDOM = () => {
    const groupItems = document.querySelectorAll('.group-item');
    if (groupItems.length === 0) return false;

    // Uncheck all first
    document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = false);

    const matchedIndexes = new Set();
    const domNameOccurrences = {};

    document.querySelectorAll('.group-checkbox').forEach(cb => {
      let cbGroup = {};
      try { cbGroup = JSON.parse(cb.dataset.groupObj); } catch(e) {}
      const nameContent = cbGroup.name || cb.nextElementSibling?.textContent.trim() || '';

      domNameOccurrences[nameContent] = (domNameOccurrences[nameContent] || 0) + 1;

      let matchedSavedIndex = -1;
      for (let j = 0; j < normalizedGroups.length; j++) {
          if (matchedIndexes.has(j)) continue;
          const saved = normalizedGroups[j];

          if (saved.id && cbGroup.id && !String(saved.id).startsWith('group_occurrence_') && !String(cbGroup.id).startsWith('group_occurrence_') && saved.id === cbGroup.id) { matchedSavedIndex = j; break; }
          if (saved.url && cbGroup.url && saved.url === cbGroup.url) { matchedSavedIndex = j; break; }

          if (saved.name === nameContent && (saved.occurrenceIndex === undefined || saved.occurrenceIndex === cbGroup.occurrenceIndex)) {
              matchedSavedIndex = j; break;
          }
      }

      if (matchedSavedIndex !== -1) {
          matchedIndexes.add(matchedSavedIndex);
          cb.checked = true;
      }
    });

    updateGroupCount(groupItems.length);
    updateToggleChosenBtn();
    return true;
  };

  // 1. If groups are already in the DOM, select them immediately
  if (checkGroupsInDOM()) {
    console.log("✅ Selected groups from DOM immediately.");
  }

  // 2. Try to sync/fetch from tab anyway (to ensure we have absolute current state)
  const targetTabId = getTargetTabId();
  if (!targetTabId) return;

  chrome.tabs.sendMessage(targetTabId, { type: 'get_groups' }, (response) => {
    if (chrome.runtime.lastError) {
      // Only alert if we couldn't even find them in the current UI
      if (document.querySelectorAll('.group-item').length === 0) {
        showCustomAlert("Connection Lost", "Please refresh the Facebook page to load groups first so you can apply presets.", "⚠️");
      }
      return;
    }

    const managerModal = document.getElementById('presets-manager-modal');
    if (managerModal) managerModal.classList.add('hidden');

    if (response && response.groups) {
      allGroups = response.groups;
      renderGroups(response.groups);

      setTimeout(() => {
        checkGroupsInDOM();
      }, 150);
    }
  });
}

// ── Quick Preset Dropdown ─────────────────────────────────
function renderQuickPresetDropdown() {
  const listContainer = document.getElementById('quick-preset-items-list');
  if (!listContainer) return;

  chrome.storage.local.get(['groupPresets'], (result) => {
    const presets = result.groupPresets || [];
    if (presets.length === 0) {
      listContainer.innerHTML = '<div style="color:#666; font-size:12px; padding:15px; text-align:center;">No presets saved yet</div>';
      return;
    }

    listContainer.innerHTML = '';
    presets.forEach(preset => {
      const item = document.createElement('div');
      item.style.cssText = 'padding: 10px 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-radius: 8px; margin: 2px 5px; transition: all 0.2s; color: #fff;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'quick-preset-checkbox';
      cb.dataset.id = preset.id;
      cb.style.cssText = 'width: 16px; height: 16px; cursor: pointer; accent-color: #1eb2ff;';

      const lbl = document.createElement('span');
      lbl.textContent = `${preset.name} (${preset.groups.length} groups)`;
      lbl.style.fontSize = '12px';
      lbl.style.fontWeight = '500';
      lbl.style.flex = '1';

      item.appendChild(cb);
      item.appendChild(lbl);

      item.onmouseenter = () => { item.style.background = 'rgba(30,178,255,0.1)'; };
      item.onmouseleave = () => { if(!cb.checked) item.style.background = 'transparent'; };

      item.onclick = (e) => {
         if (e.target !== cb) cb.checked = !cb.checked;
         item.style.background = cb.checked ? 'rgba(30,178,255,0.15)' : 'transparent';
         updateQuickPresetSelection();
      };

      listContainer.appendChild(item);
    });
  });
}

function updateQuickPresetSelection() {
  chrome.storage.local.get(['groupPresets'], (result) => {
    const presets = result.groupPresets || [];
    const checkedCbs = document.querySelectorAll('.quick-preset-checkbox:checked');
    const triggerText = document.getElementById('preset-trigger-text');

    let allSelectedGroups = [];
    let selectedPresetCount = checkedCbs.length;

    checkedCbs.forEach(cb => {
       const preset = presets.find(p => p.id === cb.dataset.id);
       if (preset) {
         preset.groups.forEach(g => allSelectedGroups.push(normalizeGroupEntry(g)));
       }
    });

    if (selectedPresetCount > 0) {
       triggerText.textContent = `${selectedPresetCount} Presets Active`;
       triggerText.style.color = '#1eb2ff';
       triggerText.style.fontWeight = '700';
    } else {
       triggerText.textContent = '-- Choose Multiple Presets --';
       triggerText.style.color = '#9ca3af';
       triggerText.style.fontWeight = '400';
    }

    // Automatically check/uncheck groups in main Step 2 UI
    const groupItemsInDom = document.querySelectorAll('.group-item');
    if (groupItemsInDom.length > 0) {
        document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = false);

        const matchedIndexes = new Set();
        document.querySelectorAll('.group-checkbox').forEach(cb => {
            let cbGroup = {};
            try { cbGroup = JSON.parse(cb.dataset.groupObj); } catch(e) {}
            const nameContent = cbGroup.name || cb.nextElementSibling?.textContent.trim() || '';

            let matchedSavedIndex = -1;
            for (let j = 0; j < allSelectedGroups.length; j++) {
                if (matchedIndexes.has(j)) continue;
                const saved = allSelectedGroups[j];

                if (saved.id && cbGroup.id && !String(saved.id).startsWith('group_occurrence_') && !String(cbGroup.id).startsWith('group_occurrence_') && saved.id === cbGroup.id) { matchedSavedIndex = j; break; }
                if (saved.url && cbGroup.url && saved.url === cbGroup.url) { matchedSavedIndex = j; break; }

                if (saved.name === nameContent && (saved.occurrenceIndex === undefined || saved.occurrenceIndex === cbGroup.occurrenceIndex)) {
                    matchedSavedIndex = j; break;
                }
            }

            if (matchedSavedIndex !== -1) {
                matchedIndexes.add(matchedSavedIndex);
                cb.checked = true;
            }
        });
        updateGroupCount(matchedIndexes.size);
        updateToggleChosenBtn();
    }
  });
}

function renderPresetsManager() {
  const container = document.getElementById('presets-list-container');
  const emptyState = document.querySelector('.empty-presets-state');
  if (!container) return;

  chrome.storage.local.get(['groupPresets'], (result) => {
    const presets = result.groupPresets || [];

    if (presets.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = presets.map(preset => {
      const createdDate = new Date(preset.createdAt).toLocaleDateString();

      // Take first 3 group names for chips
      const limit = 3;
      const visibleGroups = preset.groups.slice(0, limit);
      const remainingCount = preset.groups.length - limit;

      const chipsHtml = visibleGroups.map(g => {
        const groupName = groupDisplayName(g);
        return `
          <span style="
            background: rgba(30,178,255,0.08);
            border: 1px solid rgba(30,178,255,0.2);
            border-radius: 12px;
            padding: 2px 10px;
            font-size: 10px;
            color: #1eb2ff;
            font-weight: 500;
            white-space: nowrap;
            max-width: 100px;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${groupName}</span>
        `;
      }).join('');

      const moreBadge = remainingCount > 0 ? `
        <span style="
          background: rgba(0,0,0,0.05);
          border-radius: 12px;
          padding: 2px 8px;
          font-size: 10px;
          color: #65676b;
        ">+${remainingCount} more</span>
      ` : '';

      return `
        <div class="preset-card" data-preset-id="${preset.id}" style="
          background: #ffffff;
          border: 1px solid rgba(30,178,255,0.25);
          border-radius: 16px;
          padding: 14px;
          margin-bottom: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          transition: all 0.2s;
          position: relative;
        ">
          <!-- Checkbox for multi-select (fixed position) -->
          <input type="checkbox" class="preset-multi-select" data-id="${preset.id}" style="
            position: absolute; left: 8px; top: 18px;
            width:16px; height:16px; accent-color:#1eb2ff; cursor:pointer;
          ">

          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; padding-left: 20px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:18px;">📖</span>
              <span style="color:#1c1e21; font-size:15px; font-weight:800; letter-spacing:-0.2px;">${preset.name}</span>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="apply-preset-btn" data-preset-id="${preset.id}" style="
                background: #00d4ff;
                border:none; color:#fff; padding:6px 14px; border-radius:10px;
                font-size:12px; font-weight:800; cursor:pointer;
                box-shadow: 0 2px 6px rgba(0,212,255,0.2);
              ">✓ Apply</button>
              <button class="delete-preset-btn" data-preset-id="${preset.id}" style="
                background:rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.15);
                color:#ff3b30; padding:6px 10px; border-radius:10px;
                font-size:12px; cursor:pointer; opacity:0.6;
              ">🗑️</button>
            </div>
          </div>

          <div style="color:#65676b; font-size:11px; display:flex; gap:12px; padding-left: 28px; margin-bottom:12px; font-weight:500;">
            <span style="display:flex; align-items:center; gap:4px;">🎯 ${preset.groups.length} groups</span>
            <span style="display:flex; align-items:center; gap:4px;">📅 ${createdDate}</span>
          </div>

          <!-- Group Tags/Chips -->
          <div style="display:flex; flex-wrap:wrap; gap:6px; padding-left: 28px;">
            ${chipsHtml}
            ${moreBadge}
          </div>
        </div>`;
    }).join('');

    // Multi-select logic
    const multiBar = document.getElementById('presets-multi-action-bar');
    const updateMultiBar = () => {
       const selectedCount = container.querySelectorAll('.preset-multi-select:checked').length;
       if (selectedCount > 1) {
          multiBar?.classList.remove('hidden');
       } else {
          multiBar?.classList.add('hidden');
       }
    };

    container.querySelectorAll('.preset-multi-select').forEach(cb => {
       cb.addEventListener('change', updateMultiBar);
       // Stop click propagation so clicking checkbox doesn't trigger card click (if any)
       cb.addEventListener('click', e => e.stopPropagation());
    });

    // Apply Selected
    const applySelectedBtn = document.getElementById('apply-selected-presets-btn');
    if (applySelectedBtn) {
       applySelectedBtn.addEventListener('click', () => {
          const selectedIds = Array.from(container.querySelectorAll('.preset-multi-select:checked')).map(cb => cb.getAttribute('data-id'));
          const combinedGroups = [];
          selectedIds.forEach(id => {
             const p = presets.find(pr => pr.id === id);
             if (p) combinedGroups.push(...p.groups);
          });

          applyGroupsToMainList(combinedGroups);
       });
    }

    // Delete Selected
    const deleteSelectedBtn = document.getElementById('delete-selected-presets-btn');
    if (deleteSelectedBtn) {
       deleteSelectedBtn.addEventListener('click', () => {
          const selectedIds = Array.from(container.querySelectorAll('.preset-multi-select:checked')).map(cb => cb.getAttribute('data-id'));
          if (!confirm(`Delete ${selectedIds.length} selected presets?`)) return;

          const updated = presets.filter(p => !selectedIds.includes(p.id));
          chrome.storage.local.set({ groupPresets: updated }, () => {
             renderPresetsManager();
             renderQuickPresetDropdown();
          });
       });
    }

    // Attach Apply button listeners (single apply)
    container.querySelectorAll('.apply-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const presetId = btn.getAttribute('data-preset-id');
        const preset = presets.find(p => p.id === presetId);
        if (preset) applyGroupsToMainList(preset.groups);
      });
    });

    // Attach Delete button listeners
    container.querySelectorAll('.delete-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const presetId = btn.getAttribute('data-preset-id');
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return;
        if (!confirm(`Delete preset "${preset.name}"?`)) return;

        const updated = presets.filter(p => p.id !== presetId);
        chrome.storage.local.set({ groupPresets: updated }, () => {
          renderPresetsManager();
          renderQuickPresetDropdown();
        });
      });
    });
  });
}

// ── Save Preset Modal ─────────────────────────────────────
function openSavePresetModal(groups, skipQuestion = false) {
  const savePresetModal = document.getElementById('save-preset-modal');
  const presetGroupsCountQuestion = document.getElementById('preset-groups-count-question');
  const presetGroupsListQuestion = document.getElementById('preset-groups-list-question');
  const presetGroupsCount = document.getElementById('preset-groups-count');
  const presetGroupsList = document.getElementById('preset-groups-list');
  const presetQuestionView = document.getElementById('preset-question-view');
  const presetFormView = document.getElementById('preset-form-view');

  pendingPresetGroups = groups;
  const presetGroupLabels = groups.map(groupDisplayName);
  if (presetGroupsCountQuestion) presetGroupsCountQuestion.textContent = `${groups.length} groups selected`;
  if (presetGroupsListQuestion) {
    presetGroupsListQuestion.innerHTML = presetGroupLabels.slice(0, 8).map(g =>
      `<div style="padding:3px 0; color:rgba(255,255,255,0.8); font-size:12px;">• ${g}</div>`
    ).join('') + (groups.length > 8 ? `<div style="color:rgba(255,255,255,0.5); font-size:11px;">... and ${groups.length - 8} more</div>` : '');
  }
  if (presetGroupsCount) presetGroupsCount.textContent = `${groups.length} groups selected`;
  if (presetGroupsList) {
    presetGroupsList.innerHTML = presetGroupLabels.slice(0, 8).map(g =>
      `<div style="padding:3px 0; color:rgba(255,255,255,0.8); font-size:12px;">• ${g}</div>`
    ).join('') + (groups.length > 8 ? `<div style="color:rgba(255,255,255,0.5); font-size:11px;">... and ${groups.length - 8} more</div>` : '');
  }

  if (skipQuestion) {
    // Show form view directly
    if (presetQuestionView) presetQuestionView.classList.add('hidden');
    if (presetFormView) presetFormView.classList.remove('hidden');
  } else {
    // Show question view
    if (presetQuestionView) presetQuestionView.classList.remove('hidden');
    if (presetFormView) presetFormView.classList.add('hidden');
  }

  if (savePresetModal) savePresetModal.classList.remove('hidden');
}

// ── Trigger Presets Manager (Workflow Presets) ────────────
function renderTriggerPresetsManager() {
  const container = document.getElementById('trigger-presets-list');
  if (!container) return;

  chrome.storage.local.get(['triggerPresets'], (result) => {
    const presets = result.triggerPresets || [];

    if (presets.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.3); font-size:12px; padding:20px;">No saved workflows yet.</div>';
      return;
    }

    container.innerHTML = presets.map((preset, index) => `
      <div style="
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 12px 14px;
        margin-bottom: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      ">
        <div style="flex: 1; min-width: 0;">
          <div style="color: #fff; font-weight: 700; font-size: 13px; margin-bottom: 4px;">${preset.name}</div>
          <div style="color: rgba(255,255,255,0.4); font-size: 10px;">
            🔗 ${preset.links?.length || 0} links · 👥 ${preset.groups?.length || 0} groups · 🔄 Every ${preset.intervalValue} ${preset.intervalType}
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="apply-trigger-preset-btn" data-index="${index}" style="
            background: linear-gradient(135deg, #1eb2ff, #00d4ff);
            border: none; color: #fff; padding: 6px 12px; border-radius: 8px;
            font-size: 11px; font-weight: 700; cursor: pointer;
          ">▶ Apply</button>
          <button class="delete-trigger-preset-btn" data-index="${index}" style="
            background: rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.3);
            color: #ff6b6b; padding: 6px 10px; border-radius: 8px;
            font-size: 11px; cursor: pointer;
          ">🗑️</button>
        </div>
      </div>
    `).join('');

    // Apply button listeners
    container.querySelectorAll('.apply-trigger-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const preset = presets[index];
        if (!preset) return;

        // Apply all settings from the preset
        const intervalType = document.getElementById('schedule-interval-type');
        const intervalValue = document.getElementById('schedule-interval-value');
        const startTimeInput = document.getElementById('schedule-start-time');
        const endTimeInput = document.getElementById('schedule-end-time');
        const postContentArea = document.getElementById('post-content');

        if (intervalType && preset.intervalType) intervalType.value = preset.intervalType;
        if (intervalValue && preset.intervalValue) intervalValue.value = preset.intervalValue;
        if (startTimeInput && preset.startTime) startTimeInput.value = preset.startTime;
        if (endTimeInput && preset.endTime) endTimeInput.value = preset.endTime;
        if (postContentArea && preset.postContent) postContentArea.value = preset.postContent;

        // Apply links
        if (preset.links && preset.links.length > 0) {
          const linkListContainer = document.getElementById('link-list-to-visit');
          if (linkListContainer) {
            linkListContainer.innerHTML = '';
            preset.links.forEach((link, i) => {
              const item = document.createElement('div');
              item.className = 'link-item';
              item.innerHTML = `
                <span class="link-num">${i + 1}</span>
                <input type="text" class="link-input" value="${link}" placeholder="FB Post URL">
                <button class="remove-link-btn" title="Remove">✕</button>
              `;
              item.querySelector('.remove-link-btn').addEventListener('click', () => item.remove());
              linkListContainer.appendChild(item);
            });
          }
        }

        updateSchedulePreview();
        showCustomAlert("Workflow Applied", `"${preset.name}" workflow has been loaded. Review settings then activate.`, "✅");

        const triggerPresetsModal = document.getElementById('trigger-presets-modal');
        if (triggerPresetsModal) triggerPresetsModal.classList.add('hidden');
      });
    });

    // Delete button listeners
    container.querySelectorAll('.delete-trigger-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        if (!confirm('Delete this workflow preset?')) return;
        presets.splice(index, 1);
        chrome.storage.local.set({ triggerPresets: presets }, renderTriggerPresetsManager);
      });
    });
  });
}

// ── Fetch Facebook Title (for Link-to-Preset) ────────────
async function fetchFacebookTitle(url) {
  try {
    const res = await fetch(url.trim(), { credentials: 'omit' }); // Omit credentials to avoid FB auto-redirect to mobile sometimes, or keep include if needed
    const text = await res.text();
    const titleMatch = text.match(/<title>(.*?)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      let txt = document.createElement('textarea');
      txt.innerHTML = titleMatch[1];
      let cleanTitle = txt.value.replace(/ \| Facebook$/i, '').replace(/ - Facebook$/i, '').trim();
      if (cleanTitle && cleanTitle.toLowerCase() !== 'facebook') return cleanTitle;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ============================================================
// initPresetsUI — registers all preset-related event listeners.
// Called once from panel.js DOMContentLoaded.
// ============================================================
function initPresetsUI() {
  // ── Quick Preset Multi-Select Dropdown ─────────────────────
  const quickPresetTrigger = document.getElementById('quick-preset-trigger');
  const quickPresetDropdown = document.getElementById('quick-preset-dropdown-wrap');
  const quickPresetClear = document.getElementById('quick-preset-clear-btn');

  if (quickPresetTrigger && quickPresetDropdown) {
    quickPresetTrigger.addEventListener('click', (e) => {
       e.stopPropagation();
       quickPresetDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
       if (!quickPresetDropdown.classList.contains('hidden') && !quickPresetDropdown.contains(e.target) && e.target !== quickPresetTrigger) {
          quickPresetDropdown.classList.add('hidden');
       }
    });

    if (quickPresetClear) {
       quickPresetClear.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.quick-preset-checkbox').forEach(cb => cb.checked = false);
          updateQuickPresetSelection();
       });
    }
  }

  renderQuickPresetDropdown();

  // ── Group Presets Icon ─────────────────────────────────────
  const groupPresetsIcon = document.getElementById('groupPresetsIcon');
  if (groupPresetsIcon) {
    groupPresetsIcon.addEventListener('click', () => {
      openGroupPresetsManager();
    });
  }

  // ── Close Presets Manager Modal ────────────────────────────
  const closePresetsManager = document.getElementById('close-presets-manager');
  if (closePresetsManager) {
    closePresetsManager.addEventListener('click', () => {
      const modal = document.getElementById('presets-manager-modal');
      if (modal) modal.classList.add('hidden');
    });
  }

  const presetsManagerModal = document.getElementById('presets-manager-modal');
  if (presetsManagerModal) {
    presetsManagerModal.addEventListener('click', (e) => {
      if (e.target === presetsManagerModal) presetsManagerModal.classList.add('hidden');
    });
  }

  // ── Save Preset Modal Buttons ──────────────────────────────
  const savePresetModal = document.getElementById('save-preset-modal');
  const closeSavePresetModal = document.getElementById('close-save-preset-modal');
  const presetAnswerNo = document.getElementById('preset-answer-no');
  const presetAnswerYes = document.getElementById('preset-answer-yes');
  const presetQuestionView = document.getElementById('preset-question-view');
  const presetFormView = document.getElementById('preset-form-view');
  const presetNameInput = document.getElementById('preset-name');
  const cancelSavePreset = document.getElementById('cancel-save-preset');
  const confirmSavePreset = document.getElementById('confirm-save-preset');

  const popupSavePresetBtnEl = document.getElementById('popup-save-preset-btn');
  if (popupSavePresetBtnEl) {
    popupSavePresetBtnEl.addEventListener('click', () => {
      const selectedGroups = [];
      document.querySelectorAll('.group-checkbox:checked').forEach(cb => {
        const label = cb.nextElementSibling;
        if (label) selectedGroups.push(label.textContent);
      });

      if (selectedGroups.length === 0) {
        showCustomAlert("No Groups", "Please select at least one group first.", "👥");
        return;
      }

      openSavePresetModal(selectedGroups, true); // true = skip question
    });
  }

  if (closeSavePresetModal) {
    closeSavePresetModal.addEventListener('click', () => {
      if (savePresetModal) savePresetModal.classList.add('hidden');
    });
  }
  if (presetAnswerNo) {
    presetAnswerNo.addEventListener('click', () => {
      if (savePresetModal) savePresetModal.classList.add('hidden');
    });
  }
  if (presetAnswerYes) {
    presetAnswerYes.addEventListener('click', () => {
      if (presetQuestionView) presetQuestionView.classList.add('hidden');
      if (presetFormView) presetFormView.classList.remove('hidden');
    });
  }
  if (cancelSavePreset) {
    cancelSavePreset.addEventListener('click', () => {
      if (savePresetModal) savePresetModal.classList.add('hidden');
    });
  }
  if (confirmSavePreset) {
    confirmSavePreset.addEventListener('click', () => {
      const name = presetNameInput ? presetNameInput.value.trim() : '';
      if (!name) {
        alert('Please enter a name for your Group Preset!');
        if (presetNameInput) presetNameInput.focus();
        return;
      }

      chrome.storage.local.get(['groupPresets'], (result) => {
        const presets = result.groupPresets || [];
        const newPreset = {
          id: Date.now().toString(),
          name: name,
          groups: pendingPresetGroups,
          createdAt: new Date().toISOString()
        };
        presets.push(newPreset);
        chrome.storage.local.set({ groupPresets: presets }, () => {
          if (savePresetModal) savePresetModal.classList.add('hidden');
          if (presetNameInput) presetNameInput.value = '';
          alert(`✅ Group Preset "${name}" saved!`);
        });
      });
    });
  }

  // ── Trigger Presets Modal ──────────────────────────────────
  const triggerPresetsIcon = document.getElementById('triggerPresetsIcon');
  const triggerPresetsModal = document.getElementById('trigger-presets-modal');
  const closeTriggerPresets = document.getElementById('close-trigger-presets-modal');

  if (triggerPresetsIcon && triggerPresetsModal) {
    triggerPresetsIcon.addEventListener('click', () => {
      triggerPresetsModal.classList.remove('hidden');
      renderTriggerPresetsManager();
    });
  }

  if (closeTriggerPresets) {
    closeTriggerPresets.addEventListener('click', () => {
      if (triggerPresetsModal) triggerPresetsModal.classList.add('hidden');
    });
  }

  if (triggerPresetsModal) {
    triggerPresetsModal.addEventListener('click', (e) => {
      if (e.target === triggerPresetsModal) triggerPresetsModal.classList.add('hidden');
    });
  }

  // ── Save Workflow Button ───────────────────────────────────
  const saveWorkflowBtn = document.getElementById('save-workflow-btn');
  if (saveWorkflowBtn) {
    saveWorkflowBtn.addEventListener('click', () => {
      const workflowName = prompt('Enter a name for this workflow preset:', '');
      if (!workflowName || !workflowName.trim()) return;

      const intervalType = document.getElementById('schedule-interval-type');
      const intervalValue = document.getElementById('schedule-interval-value');
      const startTimeInput = document.getElementById('schedule-start-time');
      const endTimeInput = document.getElementById('schedule-end-time');
      const postContentArea = document.getElementById('post-content');
      const linkListContainer = document.getElementById('link-list-to-visit');

      const links = linkListContainer
        ? Array.from(linkListContainer.querySelectorAll('.link-input')).map(i => i.value.trim()).filter(Boolean)
        : [];

      // Get groups from current selection
      const selectedGroups = [];
      document.querySelectorAll('.group-checkbox:checked').forEach(cb => {
        const label = cb.nextElementSibling;
        if (label) selectedGroups.push(label.textContent.trim());
      });

      const newWorkflow = {
        id: Date.now().toString(),
        name: workflowName.trim(),
        intervalType: intervalType ? intervalType.value : 'hours',
        intervalValue: intervalValue ? intervalValue.value : '1',
        startTime: startTimeInput ? startTimeInput.value : '',
        endTime: endTimeInput ? endTimeInput.value : '',
        postContent: postContentArea ? postContentArea.value : '',
        links: links,
        groups: selectedGroups,
        createdAt: new Date().toISOString()
      };

      chrome.storage.local.get(['triggerPresets'], (result) => {
        const presets = result.triggerPresets || [];
        presets.push(newWorkflow);
        chrome.storage.local.set({ triggerPresets: presets }, () => {
          showCustomAlert("Workflow Saved", `"${workflowName.trim()}" has been saved as a workflow preset!`, "✅");
        });
      });
    });
  }

  // ── Link-to-Preset Functionality ──────────────────────────
  const openLinkToPresetBtn = document.getElementById('open-link-to-preset-btn');
  const linkToPresetModal = document.getElementById('link-to-preset-modal');
  const closeLinkToPreset = document.getElementById('close-link-to-preset');
  const fetchPresetLinksBtn = document.getElementById('fetch-preset-links-btn');
  const presetLinksInput = document.getElementById('preset-links-input');
  const presetScrapedNamesContainer = document.getElementById('preset-scraped-names-container');
  const saveLinkPresetBtn = document.getElementById('save-link-preset-btn');
  const linkPresetNameInput = document.getElementById('link-preset-name-input');
  const linkPresetSelect = document.getElementById('link-preset-select');

  if (linkPresetSelect) {
    linkPresetSelect.addEventListener('change', (e) => {
      if (e.target.value === 'new_preset') {
        if (linkPresetNameInput) linkPresetNameInput.style.display = 'block';
      } else {
        if (linkPresetNameInput) linkPresetNameInput.style.display = 'none';
      }
    });
  }

  if (openLinkToPresetBtn) {
    openLinkToPresetBtn.addEventListener('click', () => {
      document.getElementById('presets-manager-modal')?.classList.add('hidden');
      if (linkToPresetModal) {
        linkToPresetModal.classList.remove('hidden');
        if (presetLinksInput) {
          presetLinksInput.value = '';
          presetLinksInput.style.display = 'block';
          const label = presetLinksInput.parentElement.querySelector('label');
          if (label) label.style.display = 'block';
        }

        if (linkPresetNameInput) {
          linkPresetNameInput.value = '';
          linkPresetNameInput.style.display = 'block';
        }
        if (linkPresetSelect) linkPresetSelect.value = 'new_preset';
        presetScrapedNamesContainer.classList.add('hidden');

        chrome.storage.local.get(['groupPresets'], (result) => {
          const presets = result.groupPresets || [];
          if (linkPresetSelect) {
            linkPresetSelect.innerHTML = '<option value="new_preset">➕ Create New Preset</option>';
            presets.forEach(p => {
              const opt = document.createElement('option');
              opt.value = p.id;
              opt.textContent = `📁 Append to: ${p.name}`;
              linkPresetSelect.appendChild(opt);
            });
          }
        });
      }
    });
  }

  if (closeLinkToPreset) {
    closeLinkToPreset.addEventListener('click', () => {
      if (linkToPresetModal) linkToPresetModal.classList.add('hidden');
    });
  }

  if (fetchPresetLinksBtn) {
    fetchPresetLinksBtn.addEventListener('click', async () => {
      // 1. Google Sheets dynamic table mode
      const dynamicRows = document.querySelectorAll('.preset-dynamic-row');
      if (dynamicRows.length > 0) {
        const checkedRows = Array.from(dynamicRows).filter(tr => tr.querySelector('.preset-row-cb') && tr.querySelector('.preset-row-cb').checked);
        if (checkedRows.length === 0) {
           alert("Please select at least one row using the checkboxes to extract names.");
           return;
        }

        fetchPresetLinksBtn.textContent = '⏳ Fetching Names...';
        fetchPresetLinksBtn.disabled = true;
        const summaryText = document.getElementById('extraction-summary-text');

        let successCount = 0;
        let failedCount = 0;

        const promises = checkedRows.map(async (tr) => {
           const aTag = tr.querySelector('a.preset-potential-link');
           const inputField = tr.querySelector('.preset-extracted-name-input');
           if(!inputField) return null;

           let isSuccess = false;
           if(aTag) {
              const link = aTag.href;
              const title = await fetchFacebookTitle(link);
              if (title) {
                 inputField.value = title;
                 inputField.style.borderColor = 'rgba(74,222,128,0.4)';
                 isSuccess = true;
              } else {
                 if(!inputField.value) inputField.placeholder = 'Failed... Type name here';
                 inputField.style.borderColor = 'rgba(248,113,113,0.6)';
                 isSuccess = false;
              }
           } else {
              inputField.placeholder = "No link found";
              isSuccess = false;
           }

           if (isSuccess) successCount++; else failedCount++;
           if (summaryText) summaryText.innerHTML = `<span style="color:#4ade80">✅ ${successCount}</span> | <span style="color:#f87171">❌ ${failedCount}</span>`;
           return isSuccess;
        });

        await Promise.all(promises);

        if (summaryText) summaryText.innerHTML = `<span style="color:#4ade80">✅ ${successCount}</span> | <span style="color:#f87171">❌ ${failedCount}</span>`;
        fetchPresetLinksBtn.textContent = '✨ Extract Group Names';
        fetchPresetLinksBtn.disabled = false;
        return;
      }

      // 2. Manual Textarea mode
      const linksText = presetLinksInput.value.trim();
      if (!linksText) {
        alert('Please paste some links first.');
        return;
      }

      const links = linksText.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
      if (links.length === 0) {
        alert('No valid links found. Please ensure each link starts with http');
        return;
      }

      fetchPresetLinksBtn.textContent = '⏳ Fetching Names...';
      fetchPresetLinksBtn.disabled = true;

      const resultsTbody = document.getElementById('extraction-results-tbody');
      const summaryText = document.getElementById('extraction-summary-text');
      if (resultsTbody) resultsTbody.innerHTML = '';
      if (summaryText) summaryText.textContent = `0/${links.length} Extracted`;

      let successCount = 0;
      let failedCount = 0;

      const promises = links.map(async (link) => {
        const title = await fetchFacebookTitle(link);

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

        const tdLink = document.createElement('td');
        tdLink.style.padding = '8px 10px';
        tdLink.style.fontSize = '11px';
        tdLink.style.maxWidth = '100px';
        tdLink.style.overflow = 'hidden';
        tdLink.style.textOverflow = 'ellipsis';
        tdLink.style.whiteSpace = 'nowrap';
        tdLink.style.color = 'rgba(255,255,255,0.6)';

        try {
          const urlObj = new URL(link);
          const parts = urlObj.pathname.split('/').filter(Boolean);
          const groupId = parts[parts.indexOf('groups') + 1] || link.replace('https://','').substring(0, 20)+'...';
          tdLink.textContent = groupId;
          tdLink.title = link;
        } catch(e) {
          tdLink.textContent = 'Link';
        }

        const tdName = document.createElement('td');
        tdName.style.padding = '6px 10px';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'extracted-group-name-input';
        input.style.width = '100%';
        input.style.background = 'rgba(0,0,0,0.3)';
        input.style.border = '1px solid rgba(255,255,255,0.2)';
        input.style.borderRadius = '4px';
        input.style.color = '#fff';
        input.style.padding = '5px 8px';
        input.style.fontSize = '12px';
        input.style.boxSizing = 'border-box';

        if (title) {
          input.value = title;
          input.style.borderColor = 'rgba(74,222,128,0.4)';
          successCount++;
        } else {
          input.value = '';
          input.placeholder = 'Type name here...';
          input.style.borderColor = 'rgba(248,113,113,0.6)';
          failedCount++;
        }

        tdName.appendChild(input);
        tr.appendChild(tdLink);
        tr.appendChild(tdName);
        if (resultsTbody) resultsTbody.appendChild(tr);

        if (summaryText) {
          summaryText.innerHTML = `<span style="color:#4ade80">✅ ${successCount}</span> | <span style="color:#f87171">❌ ${failedCount}</span>`;
        }
      });

      await Promise.all(promises);

      presetScrapedNamesContainer.classList.remove('hidden');
      fetchPresetLinksBtn.textContent = '✨ Extract Group Names';
      fetchPresetLinksBtn.disabled = false;
    });
  }

  if (saveLinkPresetBtn) {
    saveLinkPresetBtn.addEventListener('click', () => {
      const selectedAction = linkPresetSelect ? linkPresetSelect.value : 'new_preset';
      const presetName = linkPresetNameInput ? linkPresetNameInput.value.trim() : '';

      if (selectedAction === 'new_preset' && !presetName) {
        alert('Please enter a name for your new preset.');
        return;
      }

      const finalGroups = [];
      const dynamicRows = document.querySelectorAll('.preset-dynamic-row');

      if(dynamicRows.length > 0) {
         // Sheet mode
         dynamicRows.forEach(tr => {
            const cb = tr.querySelector('.preset-row-cb');
            if(cb && cb.checked) {
               const inp = tr.querySelector('.preset-extracted-name-input');
               if(inp) {
                  const val = inp.value.trim();
                  if(val.length > 0) finalGroups.push(val);
               }
            }
         });
      } else {
         // Textarea mode
         const oldInputs = document.querySelectorAll('.extracted-group-name-input');
         oldInputs.forEach(inp => {
            const val = inp.value.trim();
            if (val.length > 0) finalGroups.push(val);
         });
      }

      if (finalGroups.length === 0) {
        alert('No valid group names found to save. Did you extract them or type them in?');
        return;
      }

      chrome.storage.local.get(['groupPresets'], (result) => {
        let presets = result.groupPresets || [];

        if (selectedAction === 'new_preset') {
          // Create new preset
          const newPreset = {
            id: Date.now().toString(),
            name: presetName,
            groups: finalGroups,
            createdAt: new Date().toISOString()
          };
          presets.push(newPreset);
          saveAndNotify(`✅ Preset "${presetName}" saved with ${finalGroups.length} groups!`);
        } else {
          // Append to existing preset
          let updatedName = "";
          presets = presets.map(p => {
            if (p.id === selectedAction) {
              updatedName = p.name;
              // Append new groups and preserve duplicates
              const combinedGroups = [...p.groups, ...finalGroups];
              p.groups = combinedGroups;
            }
            return p;
          });
          saveAndNotify(`✅ Added ${finalGroups.length} new groups to "${updatedName}"!`);
        }

        function saveAndNotify(msg) {
          chrome.storage.local.set({ groupPresets: presets }, () => {
             showCustomAlert("Success", msg, "✅");
             linkToPresetModal.classList.add('hidden');
             // Re-open presets modal
             const presetsManagerModal = document.getElementById('presets-manager-modal');
             if (presetsManagerModal) {
               presetsManagerModal.classList.remove('hidden');
               renderPresetsManager();
             }
             // IMPORTANT: Update the quick-access multi-select dropdown too!
             if (typeof renderQuickPresetDropdown === 'function') {
               renderQuickPresetDropdown();
             }
          });
        }
      });
    });
  }
}
