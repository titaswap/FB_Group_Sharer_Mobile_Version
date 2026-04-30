// ============================================================
// popup_groups_ui.js
// Extracted from popup.js — Group list rendering, search,
// toggle chosen, select all, load all groups button.
// ZERO logic changes. Shared state at global scope.
// ============================================================

// ============================================================
// SHARED STATE
// ============================================================
var popupAllGroups = [];
var popupShowingChosenOnly = false;

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
// HELPER: Update Group Count
// ============================================================
function popupUpdateGroupCount(totalCount) {
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
function popupRenderGroups(groups) {
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
    popupUpdateGroupCount(0);
    return;
  }

  popupUpdateGroupCount(groups.length);

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
  popupUpdateToggleChosenBtn();

  // Listen to checkbox changes to update selected count badge live
  groupListDiv.querySelectorAll('.group-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      popupUpdateGroupCount(popupAllGroups.length);
      popupUpdateToggleChosenBtn();
    });
  });
}

// ============================================================
// HELPER: Toggle Chosen Button State
// ============================================================
function popupUpdateToggleChosenBtn() {
  const toggleChosenBtn = document.getElementById('toggle-chosen-groups');
  const popupSavePresetBtn = document.getElementById('popup-save-preset-btn');
  const groupListDiv = document.getElementById('group-list');

  const checkedCount = groupListDiv ? groupListDiv.querySelectorAll('.group-checkbox:checked').length : 0;
  
  if (toggleChosenBtn) {
    if (checkedCount > 0) {
      toggleChosenBtn.classList.remove('hidden');
    } else {
      toggleChosenBtn.classList.add('hidden');
      popupShowingChosenOnly = false;
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
  popupUpdateGroupCount(popupAllGroups.length);
}

// ============================================================
// initPopupGroupsUI — wraps all group-related event listeners.
// Called once from popup.js DOMContentLoaded.
// ============================================================
function initPopupGroupsUI() {
  const groupListDiv = document.getElementById('group-list');
  const searchInput = document.getElementById('group-search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const showAllGroupsBtn = document.getElementById('show-all-groups-button');
  const selectAllCheckbox = document.getElementById('select-all-groups');
  const toggleChosenBtn = document.getElementById('toggle-chosen-groups');

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
      popupShowingChosenOnly = !popupShowingChosenOnly;
      toggleChosenBtn.textContent = popupShowingChosenOnly ? 'Show All' : 'Show Chosen';
      toggleChosenBtn.classList.toggle('active', popupShowingChosenOnly);

      const items = groupListDiv.querySelectorAll('.group-item');
      items.forEach(item => {
        const cb = item.querySelector('.group-checkbox');
        if (popupShowingChosenOnly) {
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

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "get_groups" }, (response) => {
            showAllGroupsBtn.textContent = '📋 Load All';
            showAllGroupsBtn.classList.remove('loading');
            showAllGroupsBtn.disabled = false;

            if (chrome.runtime.lastError) {
              if (groupListDiv) groupListDiv.innerHTML = '<p style="padding:10px; color:#ff6b6b;">Error: Could not connect to Facebook tab. Refresh the page.</p>';
              return;
            }

            if (response && response.groups) {
              popupAllGroups = response.groups;
              popupRenderGroups(response.groups);
              showAllGroupsBtn.classList.add('loaded');
              showAllGroupsBtn.textContent = `✅ ${response.groups.length} Groups Loaded`;
            } else {
              if (groupListDiv) groupListDiv.innerHTML = '<p style="padding:10px;">Please open the "Share to Group" dialog on Facebook first.</p>';
            }
          });
        }
      });
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
      popupUpdateToggleChosenBtn();
    });
  }

  // Listen for individual checkbox changes to update toggle button
  if (groupListDiv) {
    groupListDiv.addEventListener('change', (e) => {
      if (e.target.classList.contains('group-checkbox')) {
        popupUpdateToggleChosenBtn();
      }
    });
  }
}
