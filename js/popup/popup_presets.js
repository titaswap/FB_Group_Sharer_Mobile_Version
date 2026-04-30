// ============================================================
// popup_presets.js
// Extracted from popup.js — Group Presets Manager (render,
// apply, delete), Save Preset Modal, Link-to-Preset.
// ZERO logic changes. pendingPresetGroups at global scope.
// ============================================================

// ============================================================
// SHARED STATE
// ============================================================
var popupPendingPresetGroups = [];

// ============================================================
// GROUP PRESETS MANAGER
// ============================================================
function openGroupPresetsManager() {
  const modal = document.getElementById('presets-manager-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderPresetsManager();
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
      return `
        <div class="preset-card" data-preset-id="${preset.id}" style="
          background: #ffffff;
          border: 1px solid rgba(30,178,255,0.3);
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 10px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
          transition: all 0.2s;
        ">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:18px;">📖</span>
              <span style="color:#1c1e21; font-size:14px; font-weight:700;">${preset.name}</span>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="apply-preset-btn" data-preset-id="${preset.id}" style="
                background:linear-gradient(135deg,#1eb2ff 0%,#00d4ff 100%);
                border:none; color:#fff; padding:5px 12px; border-radius:8px;
                font-size:12px; font-weight:700; cursor:pointer;">✓ Apply</button>
              <button class="delete-preset-btn" data-preset-id="${preset.id}" style="
                background:rgba(255,59,48,0.15); border:1px solid rgba(255,59,48,0.3);
                color:#e02424; padding:5px 10px; border-radius:8px;
                font-size:12px; font-weight:600; cursor:pointer;">🗑️</button>
            </div>
          </div>
          <div style="color:#65676b; font-size:12px; display:flex; gap:12px;">
            <span>🎯 ${preset.groups.length} group${preset.groups.length !== 1 ? 's' : ''}</span>
            <span>📅 ${createdDate}</span>
          </div>
          <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:4px;">
            ${preset.groups.slice(0, 5).map(g => `<span style="background:#e7f3ff; border:1px solid #cbe4fd; color:#1877f2; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:500;">${groupDisplayName(g)}</span>`).join('')}
            ${preset.groups.length > 5 ? `<span style="color:#65676b; background:#f0f2f5; font-size:11px; padding:3px 8px; border-radius:10px;">+${preset.groups.length - 5} more</span>` : ''}
          </div>
        </div>`;
    }).join('');

    // Attach Apply button listeners
    container.querySelectorAll('.apply-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const presetId = btn.getAttribute('data-preset-id');
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return;

        // Load all groups then select preset groups
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs[0]) return;
          chrome.tabs.sendMessage(tabs[0].id, { type: 'get_groups' }, (response) => {
            const modal = document.getElementById('presets-manager-modal');
            if (modal) modal.classList.add('hidden');

            if (response && response.groups) {
              popupAllGroups = response.groups;
              popupRenderGroups(response.groups);
              // Pre-select groups from preset
              setTimeout(() => {
                const normalizedGroups = preset.groups.map(normalizeGroupEntry);
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
                popupUpdateGroupCount(response.groups.length);
                popupUpdateToggleChosenBtn();
              }, 100);
            }
          });
        });
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
        });
      });
    });
  });
}

// ============================================================
// SAVE PRESET MODAL
// ============================================================
function openSavePresetModal(groups, skipQuestion = false) {
  const savePresetModal = document.getElementById('save-preset-modal');
  const presetGroupsCountQuestion = document.getElementById('preset-groups-count-question');
  const presetGroupsListQuestion = document.getElementById('preset-groups-list-question');
  const presetGroupsCount = document.getElementById('preset-groups-count');
  const presetGroupsList = document.getElementById('preset-groups-list');
  const presetQuestionView = document.getElementById('preset-question-view');
  const presetFormView = document.getElementById('preset-form-view');

  popupPendingPresetGroups = groups;
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

// ============================================================
// initPopupPresetsUI — registers all preset-related listeners.
// Called once from popup.js DOMContentLoaded.
// ============================================================
function initPopupPresetsUI() {
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
        alert('Please select at least one group first.');
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
          groups: popupPendingPresetGroups,
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

  // ── Link-to-Preset Functionality ──────────────────────────
  const openLinkToPresetBtn = document.getElementById('open-link-to-preset-btn');
  const linkToPresetModal = document.getElementById('link-to-preset-modal');
  const closeLinkToPreset = document.getElementById('close-link-to-preset');
  const fetchPresetLinksBtn = document.getElementById('fetch-preset-links-btn');
  const presetLinksInput = document.getElementById('preset-links-input');
  const presetScrapedNamesContainer = document.getElementById('preset-scraped-names-container');
  const presetNamesInput = document.getElementById('preset-names-input');
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
        presetLinksInput.value = '';
        presetNamesInput.value = '';
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

  async function popupFetchFacebookTitle(url) {
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

  if (fetchPresetLinksBtn) {
    fetchPresetLinksBtn.addEventListener('click', async () => {
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

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (summaryText) summaryText.textContent = `Extracting ${i+1}/${links.length}...`;
        const title = await popupFetchFacebookTitle(link);

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
      }

      if (summaryText) {
        summaryText.innerHTML = `<span style="color:#4ade80">✅ ${successCount}</span> | <span style="color:#f87171">❌ ${failedCount}</span>`;
      }

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

      const inputs = document.querySelectorAll('.extracted-group-name-input');
      const finalGroups = [];
      inputs.forEach(inp => {
        const val = inp.value.trim();
        if (val.length > 0) finalGroups.push(val);
      });

      if (finalGroups.length === 0) {
        alert('No valid group names found to save.');
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
              // Append new groups (allow duplicates)
              p.groups = [...p.groups, ...finalGroups];
            }
            return p;
          });
          saveAndNotify(`✅ Added ${finalGroups.length} new groups to "${updatedName}"!`);
        }

        function saveAndNotify(msg) {
          chrome.storage.local.set({ groupPresets: presets }, () => {
            alert(msg);
            linkToPresetModal.classList.add('hidden');
            // Re-open presets modal
            const presetsManagerModal = document.getElementById('presets-manager-modal');
            if (presetsManagerModal) {
              presetsManagerModal.classList.remove('hidden');
              renderPresetsManager();
            }
          });
        }
      });
    });
  }
}
