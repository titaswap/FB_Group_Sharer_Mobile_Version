// ============================================================
// popup_settings.js
// Extracted from popup.js — Settings panel DOM creation,
// export/import/clear data, settings load/save listeners.
// ZERO logic changes.
// ============================================================

// ============================================================
// CREATE SETTINGS PANEL DOM
// ============================================================
function popupCreateSettingsPanel() {
  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.className = 'hidden';
  panel.style.cssText = `
    position: absolute;
    top: 60px;
    right: 12px;
    background: linear-gradient(135deg, #0d2137 0%, #0a1628 100%);
    border: 1px solid rgba(30,178,255,0.3);
    border-radius: 14px;
    padding: 16px;
    width: 240px;
    z-index: 9999;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;
  panel.innerHTML = `
    <!-- Header -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <span style="color:#1eb2ff; font-size:14px; font-weight:700;">⚙️ Settings</span>
      <button id="close-settings-panel" style="background:none; border:none; color:rgba(255,255,255,0.6); font-size:18px; cursor:pointer; line-height:1;">✕</button>
    </div>

    <!-- Delay -->
    <div style="margin-bottom:11px;">
      <label style="color:rgba(255,255,255,0.8); font-size:11px; font-weight:700; display:block; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.4px;">🕐 Default Delay (seconds)</label>
      <input type="number" id="settings-delay" min="5" value="30" style="
        width:100%; padding:7px 10px; border:1px solid rgba(30,178,255,0.3);
        border-radius:8px; background:rgba(0,12,35,0.6); color:#fff;
        font-size:13px; box-sizing:border-box; outline:none;">
    </div>

    <!-- Google Sheet URL -->
    <div style="margin-bottom:11px;">
      <label style="color:rgba(255,255,255,0.8); font-size:11px; font-weight:700; display:block; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.4px;">📊 Public Google Sheet URL</label>
      <input type="text" id="settings-sheet-url" placeholder="https://docs.google.com/spreadsheets/d/..." style="
        width:100%; padding:7px 10px; border:1px solid rgba(30,178,255,0.3);
        border-radius:8px; background:rgba(0,12,35,0.6); color:#fff;
        font-size:11px; box-sizing:border-box; outline:none;">
    </div>

    <!-- Randomize -->
    <div style="margin-bottom:14px; display:flex; align-items:center; gap:8px;">
      <input type="checkbox" id="settings-randomize" checked style="width:16px; height:16px; accent-color:#1eb2ff; cursor:pointer;">
      <label for="settings-randomize" style="color:rgba(255,255,255,0.8); font-size:12px; cursor:pointer; font-weight:600;">Randomize Delay</label>
    </div>

    <!-- Clean Facebook Links -->
    <div style="margin-bottom:14px; display:flex; align-items:center; gap:8px;">
      <input type="checkbox" id="settings-clean-links" checked style="width:16px; height:16px; accent-color:#1eb2ff; cursor:pointer;">
      <label for="settings-clean-links" style="color:rgba(255,255,255,0.8); font-size:12px; cursor:pointer; font-weight:600;">Clean Facebook Links (Convert to Real ID)</label>
    </div>

    <!-- Rotate Short Links -->
    <div style="margin-bottom:14px; display:flex; align-items:center; gap:8px;">
      <input type="checkbox" id="settings-rotate-short-links" style="width:16px; height:16px; accent-color:#1eb2ff; cursor:pointer;">
      <label for="settings-rotate-short-links" style="color:rgba(255,255,255,0.8); font-size:12px; cursor:pointer; font-weight:600;">Rotate Short Links per Batch (Col C)</label>
    </div>

    <!-- Save Settings -->
    <button id="save-settings-btn" style="
      width:100%; background:linear-gradient(135deg,#1eb2ff 0%,#00d4ff 100%);
      border:none; color:#fff; padding:9px; border-radius:8px;
      font-size:13px; font-weight:700; cursor:pointer; margin-bottom:14px;
      box-shadow:0 3px 10px rgba(30,178,255,0.3);">💾 Save Settings</button>

    <!-- Divider -->
    <div style="height:1px; background:rgba(255,255,255,0.08); margin-bottom:14px;"></div>

    <!-- Backup & Restore Section -->
    <div style="margin-bottom:6px;">
      <div style="color:rgba(255,255,255,0.7); font-size:11px; font-weight:700; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.4px;">
        💾 Backup &amp; Restore
      </div>
      <p style="color:rgba(255,255,255,0.4); font-size:10.5px; margin:0 0 10px 0; line-height:1.5;">
        Export your data to keep it safe. Import to restore after reinstall.
      </p>

      <!-- Export Button -->
      <button id="export-data-btn" style="
        width:100%; background:rgba(34,197,94,0.15);
        border:1.5px solid rgba(34,197,94,0.4);
        color:#4ade80; padding:9px; border-radius:9px;
        font-size:12px; font-weight:700; cursor:pointer;
        margin-bottom:7px; display:flex; align-items:center;
        justify-content:center; gap:6px; box-sizing:border-box;
        transition:background 0.2s;">
        📤 Export Backup (.json)
      </button>

      <!-- Import Button -->
      <label id="import-label-btn" style="
        display:flex; align-items:center; justify-content:center; gap:6px;
        width:100%; background:rgba(251,146,60,0.15);
        border:1.5px solid rgba(251,146,60,0.4);
        color:#fb923c; padding:9px; border-radius:9px;
        font-size:12px; font-weight:700; cursor:pointer;
        box-sizing:border-box; transition:background 0.2s;">
        📥 Import Backup (.json)
        <input type="file" id="import-data-file" accept=".json" style="display:none;">
      </label>

      <div id="backup-status" style="
        display:none; margin-top:8px; padding:7px 10px;
        border-radius:8px; font-size:11.5px; font-weight:600;
        text-align:center;"></div>
    </div>

    <!-- Divider -->
    <div style="height:1px; background:rgba(255,255,255,0.08); margin:14px 0;"></div>

    <!-- Danger Zone -->
    <div style="padding:10px; background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.2); border-radius:9px;">
      <div style="color:rgba(255,100,100,0.9); font-size:11px; font-weight:700; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.3px;">⚠️ Danger Zone</div>
      <button id="clear-all-data-btn" style="
        width:100%; background:rgba(255,59,48,0.15); border:1px solid rgba(255,59,48,0.4);
        color:#ff6b6b; padding:8px; border-radius:8px; font-size:12px;
        font-weight:600; cursor:pointer;">🗑️ Clear All Saved Data</button>
    </div>
  `;
  return panel;
}

// ============================================================
// EXPORT / IMPORT / BACKUP STATUS
// ============================================================
function popupExportAllData() {
  chrome.storage.local.get(null, (allData) => {
    const dataStr = JSON.stringify(allData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const filename = `group-share-backup-${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    popupShowBackupStatus('✅ Backup downloaded!', '#4ade80', 'rgba(34,197,94,0.15)');
  });
}

function popupImportDataFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // Validate it has at least one recognizable key
      const validKeys = ['groupPresets', 'postTemplates', 'oneClickTemplates', 'signature_text', 'settings_delay', 'aiSystemPrompt'];
      const hasValidData = validKeys.some(k => data[k] !== undefined);

      if (!hasValidData) {
        popupShowBackupStatus('❌ Invalid backup file', '#f87171', 'rgba(239,68,68,0.15)');
        return;
      }

      if (!confirm(`Import backup?\n\nThis will MERGE with your current data (existing items won't be deleted).\n\nFound:\n• ${(data.groupPresets||[]).length} Group Presets\n• ${Object.keys(data.postTemplates||{}).length} Post Templates\n• ${(data.oneClickTemplates||[]).length} 1-Click Templates\n\nContinue?`)) return;

      // Merge strategy: combine arrays, merge objects
      chrome.storage.local.get(null, (current) => {
        const merged = { ...current };

        // Merge groupPresets (avoid duplicates by id)
        if (data.groupPresets) {
          const existingIds = new Set((current.groupPresets || []).map(p => p.id));
          const newPresets = data.groupPresets.filter(p => !existingIds.has(p.id));
          merged.groupPresets = [...(current.groupPresets || []), ...newPresets];
        }

        // Merge postTemplates (object — new keys added, existing not overwritten)
        if (data.postTemplates) {
          merged.postTemplates = { ...data.postTemplates, ...(current.postTemplates || {}) };
        }

        // Merge oneClickTemplates (by id)
        if (data.oneClickTemplates) {
          const existingIds = new Set((current.oneClickTemplates || []).map(t => t.id));
          const newTemplates = data.oneClickTemplates.filter(t => !existingIds.has(t.id));
          merged.oneClickTemplates = [...(current.oneClickTemplates || []), ...newTemplates];
        }

        // Restore other settings only if not already set
        ['signature_text', 'signature_enabled', 'settings_delay', 'settings_randomize', 'aiSystemPrompt'].forEach(key => {
          if (data[key] !== undefined && current[key] === undefined) {
            merged[key] = data[key];
          }
        });

        chrome.storage.local.set(merged, () => {
          popupShowBackupStatus('✅ Data imported successfully!', '#4ade80', 'rgba(34,197,94,0.15)');
          setTimeout(() => location.reload(), 1500);
        });
      });

    } catch (err) {
      popupShowBackupStatus('❌ Invalid JSON file', '#f87171', 'rgba(239,68,68,0.15)');
    }
  };
  reader.readAsText(file);
}

function popupShowBackupStatus(msg, color, bg) {
  const el = document.getElementById('backup-status');
  if (!el) return;
  el.style.display = 'block';
  el.style.color = color;
  el.style.background = bg;
  el.style.border = `1px solid ${color}40`;
  el.textContent = msg;
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ============================================================
// initPopupSettingsUI — registers all settings-related listeners.
// Called once from popup.js DOMContentLoaded.
// ============================================================
function initPopupSettingsUI(settingsPanel, settingsIcon, delayInput, randomizeCheckbox) {

  // Load saved settings into the panel
  chrome.storage.local.get(['settings_delay', 'settings_randomize', 'settings_sheet_url', 'settings_clean_links', 'settings_rotate_short_links'], (result) => {
    const settingsDelay = document.getElementById('settings-delay');
    const settingsRandomize = document.getElementById('settings-randomize');
    const settingsSheetUrl = document.getElementById('settings-sheet-url');
    const settingsCleanLinks = document.getElementById('settings-clean-links');
    const settingsRotateShortLinks = document.getElementById('settings-rotate-short-links');
    if (settingsDelay && result.settings_delay) settingsDelay.value = result.settings_delay;
    if (settingsRandomize && result.settings_randomize !== undefined) settingsRandomize.checked = result.settings_randomize;
    if (settingsSheetUrl && result.settings_sheet_url) settingsSheetUrl.value = result.settings_sheet_url;
    if (settingsCleanLinks) settingsCleanLinks.checked = result.settings_clean_links !== false; // default true
    if (settingsRotateShortLinks) settingsRotateShortLinks.checked = result.settings_rotate_short_links === true; // default false
  });

  if (settingsIcon) {
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsPanel.classList.toggle('hidden');
    });
  }

  document.getElementById('close-settings-panel').addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const delay = parseInt(document.getElementById('settings-delay').value) || 30;
    const randomize = document.getElementById('settings-randomize').checked;
    const cleanLinks = document.getElementById('settings-clean-links') ? document.getElementById('settings-clean-links').checked : true;
    const rotateShortLinks = document.getElementById('settings-rotate-short-links') ? document.getElementById('settings-rotate-short-links').checked : false;
    const sheetUrl = document.getElementById('settings-sheet-url') ? document.getElementById('settings-sheet-url').value.trim() : '';

    if (delayInput) delayInput.value = delay;
    if (randomizeCheckbox) randomizeCheckbox.checked = randomize;

    chrome.storage.local.set({ 
      settings_delay: delay, 
      settings_randomize: randomize, 
      settings_sheet_url: sheetUrl, 
      settings_clean_links: cleanLinks,
      settings_rotate_short_links: rotateShortLinks
    }, () => {
      const btn = document.getElementById('save-settings-btn');
      btn.textContent = '✅ Saved!';
      setTimeout(() => {
        btn.textContent = '💾 Save Settings';
        settingsPanel.classList.add('hidden');
      }, 1500);
    });
  });

  // Export button
  document.getElementById('export-data-btn').addEventListener('click', () => {
    popupExportAllData();
  });

  // Import button — file input change
  document.getElementById('import-data-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      popupImportDataFromFile(file);
      e.target.value = ''; // Reset so same file can be re-imported
    }
  });

  document.getElementById('clear-all-data-btn').addEventListener('click', () => {
    if (confirm('⚠️ This will delete ALL saved templates, presets, and settings. Are you sure?')) {
      chrome.storage.local.clear(() => {
        alert('✅ All data cleared!');
        settingsPanel.classList.add('hidden');
        location.reload();
      });
    }
  });

  // Close settings panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!settingsPanel.contains(e.target) && e.target !== settingsIcon) {
      settingsPanel.classList.add('hidden');
    }
  });
}
