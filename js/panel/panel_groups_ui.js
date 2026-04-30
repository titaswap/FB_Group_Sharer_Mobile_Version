// ============================================================
// panel_groups_ui.js
// Extracted from panel.js — Group list rendering, search,
// toggle chosen, select all, and load all groups button.
// ZERO logic changes. Shared state hoisted to global scope
// (necessary for cross-file access). DOM elements looked
// up by ID inside functions (same behavior, different syntax).
// ============================================================

// ============================================================
// SHARED STATE (was inside DOMContentLoaded closure in panel.js)
// These variables are used by functions in this file AND
// referenced during share/preset operations in panel.js core.
// ============================================================
var allGroups = [];
var showingChosenOnly = false;

// ============================================================
// HELPER: Group Identity Normalization
// ============================================================
function normalizeGroupEntry(group) {
  if (typeof group === 'string') {
    return { name: group, legacy: true };
  }
  return group;
}

function groupDisplayName(group) {
  const norm = normalizeGroupEntry(group);
  if (norm.id && !norm.id.startsWith('group_occurrence_')) {
    return `${norm.name} (ID: ${norm.id})`;
  }
  if (norm.occurrenceIndex !== undefined && norm.occurrenceIndex > 0) {
    return `${norm.name} (#${norm.occurrenceIndex + 1})`;
  }
  return norm.name;
}

// ============================================================
// HELPER: Update Count
// ============================================================
function updateGroupCount(totalCount) {
  const groupCountSpan = document.getElementById('group-count');
  const groupListDiv = document.getElementById('group-list');
  if (!groupCountSpan) return;
  const checkedCount = groupListDiv ? groupListDiv.querySelectorAll('.group-checkbox:checked').length : 0;
  if (checkedCount > 0) {
    groupCountSpan.textContent = `${checkedCount} selected / ${totalCount} found`;
  } else {
    groupCountSpan.textContent = `${totalCount} groups found`;
  }
}

// ============================================================
// HELPER: Render Groups
// ============================================================
function renderGroups(groups) {
  const groupListDiv = document.getElementById('group-list');
  if (!groupListDiv) return;
  groupListDiv.innerHTML = '';

  if (!groups || groups.length === 0) {
    groupListDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p class="empty-text">No groups found</p>
        <p class="empty-hint">Open Facebook, click "Share" on a post, then click "Load All".</p>
      </div>`;
    updateGroupCount(0);
    return;
  }

  updateGroupCount(groups.length);

  groups.forEach((group, index) => {
    const groupItem = document.createElement('div');
    groupItem.className = 'group-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'group-checkbox styled-checkbox';
    checkbox.id = `group-${index}`;
    // Store full object safely
    checkbox.dataset.groupObj = JSON.stringify(group);
    checkbox.value = group.id || group.name;

    const label = document.createElement('label');
    label.htmlFor = `group-${index}`;
    label.textContent = groupDisplayName(group);
    label.className = 'group-label';

    groupItem.appendChild(checkbox);
    groupItem.appendChild(label);
    groupListDiv.appendChild(groupItem);
  });

  // Update toggle-chosen button
  updateToggleChosenBtn();

  // Listen to checkbox changes to update selected count badge live
  groupListDiv.querySelectorAll('.group-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      updateGroupCount(allGroups.length);
      updateToggleChosenBtn();
    });
  });
}

// ============================================================
// HELPER: Toggle Chosen Button State
// ============================================================
function updateToggleChosenBtn() {
  const toggleChosenBtn = document.getElementById('toggle-chosen-groups');
  const popupSavePresetBtn = document.getElementById('popup-save-preset-btn');
  const groupListDiv = document.getElementById('group-list');

  const checkedCount = groupListDiv ? groupListDiv.querySelectorAll('.group-checkbox:checked').length : 0;
  
  if (toggleChosenBtn) {
    if (checkedCount > 0) {
      toggleChosenBtn.classList.remove('hidden');
    } else {
      toggleChosenBtn.classList.add('hidden');
      showingChosenOnly = false;
      toggleChosenBtn.textContent = 'Show Chosen';
      toggleChosenBtn.classList.remove('active');
    }
  }

  if (popupSavePresetBtn) {
    if (checkedCount > 0) {
      popupSavePresetBtn.classList.remove('hidden');
    } else {
      popupSavePresetBtn.classList.add('hidden');
    }
  }
  updateGroupCount(allGroups.length);
}

// ============================================================
// initGroupsUI — wraps all event listener registrations.
// Called once from panel.js DOMContentLoaded.
// ============================================================
function initGroupsUI() {
  const groupListDiv = document.getElementById('group-list');
  const searchInput = document.getElementById('group-search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const toggleChosenBtn = document.getElementById('toggle-chosen-groups');
  const showAllGroupsBtn = document.getElementById('show-all-groups-button');
  const selectAllCheckbox = document.getElementById('select-all-groups');

  // ── SEARCH & FILTER ────────────────────────────────────────
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      if (searchClearBtn) {
        searchClearBtn.classList.toggle('hidden', query === '');
      }
      const items = groupListDiv.querySelectorAll('.group-item');
      items.forEach(item => {
        const label = item.querySelector('.group-label');
        if (label) {
          item.style.display = label.textContent.toLowerCase().includes(query) ? '' : 'none';
        }
      });
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchClearBtn.classList.add('hidden');
      if (groupListDiv) groupListDiv.querySelectorAll('.group-item').forEach(item => item.style.display = '');
    });
  }

  // ── TOGGLE CHOSEN GROUPS BUTTON ────────────────────────────
  if (toggleChosenBtn) {
    toggleChosenBtn.addEventListener('click', () => {
      showingChosenOnly = !showingChosenOnly;
      toggleChosenBtn.textContent = showingChosenOnly ? 'Show All' : 'Show Chosen';
      toggleChosenBtn.classList.toggle('active', showingChosenOnly);

      const items = groupListDiv.querySelectorAll('.group-item');
      items.forEach(item => {
        const cb = item.querySelector('.group-checkbox');
        if (showingChosenOnly) {
          item.style.display = (cb && cb.checked) ? '' : 'none';
        } else {
          item.style.display = '';
        }
      });
    });
  }

  // ── BUTTON: Load All Groups ────────────────────────────────
  if (showAllGroupsBtn) {
    showAllGroupsBtn.addEventListener('click', () => {
      showAllGroupsBtn.textContent = '⏳ Loading...';
      showAllGroupsBtn.classList.add('loading');
      showAllGroupsBtn.disabled = true;

      const targetTabId = getTargetTabId();
      if (targetTabId) {
        chrome.tabs.sendMessage(targetTabId, { type: "get_groups" }, (response) => {
          showAllGroupsBtn.textContent = '📋 Load All';
          showAllGroupsBtn.classList.remove('loading');
          showAllGroupsBtn.disabled = false;

          if (chrome.runtime.lastError) {
            if (groupListDiv) groupListDiv.innerHTML = '<p style="padding:10px; color:#ff6b6b;">Error: Could not connect to Facebook tab. Refresh the page.</p>';
            return;
          }

          if (response && response.groups) {
            allGroups = response.groups;
            renderGroups(response.groups);
            showAllGroupsBtn.classList.add('loaded');
            showAllGroupsBtn.textContent = `✅ ${response.groups.length} Groups Loaded`;
          } else {
            if (groupListDiv) groupListDiv.innerHTML = '<p style="padding:10px;">Please open the "Share to Group" dialog on Facebook first.</p>';
          }
        });
      } else {
        // Fallback for debugging
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].url.includes('facebook.com')) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "get_groups" }, (response) => {
              // ... same response logic ...
            });
          } else {
             showAllGroupsBtn.textContent = '📋 Load All';
             showAllGroupsBtn.classList.remove('loading');
             showAllGroupsBtn.disabled = false;
             if (groupListDiv) groupListDiv.innerHTML = '<p style="padding:10px; color:#ff6b6b;">Error: Target tab lost. Please reopen the panel from Facebook tab.</p>';
          }
        });
      }
    });
  }

  // ── CHECKBOX: Select All ───────────────────────────────────
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      document.querySelectorAll('.group-checkbox').forEach(cb => {
        // Only change visible items
        const item = cb.closest('.group-item');
        if (!item || item.style.display !== 'none') {
          cb.checked = e.target.checked;
        }
      });
      updateToggleChosenBtn();
    });
  }

  // Listen for individual checkbox changes to update toggle button
  if (groupListDiv) {
    groupListDiv.addEventListener('change', (e) => {
      if (e.target.classList.contains('group-checkbox')) {
        updateToggleChosenBtn();
      }
    });
  }
}
