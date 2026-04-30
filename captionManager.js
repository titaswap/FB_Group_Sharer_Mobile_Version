/**
 * CAPTION MANAGER SYSTEM
 * Handles Bulk Import, Grouping, and Persistence of Captions
 */

const CaptionManager = {
    async init() {
        console.log("📋 CaptionManager Initialized");
        
        // Setup UI Listeners
        const saveBtn = document.getElementById('import-captions-btn');
        const bulkInput = document.getElementById('caption-bulk-textarea');
        const groupInput = document.getElementById('caption-group-input');
        const existingSelector = document.getElementById('existing-group-selector');
        
        // Helper: populate the existing groups dropdown
        const populateGroupSelector = async () => {
            if (!existingSelector) return;
            const groups = await this.getGroups();
            existingSelector.innerHTML = '<option value="">-- Select a group to append to --</option>';
            groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g;
                opt.textContent = `📁 ${g}`;
                existingSelector.appendChild(opt);
            });
        };

        // When existing group is selected → auto-fill the text input
        if (existingSelector) {
            existingSelector.onchange = () => {
                if (existingSelector.value) {
                    groupInput.value = existingSelector.value;
                    groupInput.style.borderColor = '#1eb2ff';
                    groupInput.style.color = '#1eb2ff';
                } else {
                    groupInput.value = '';
                    groupInput.style.borderColor = '';
                    groupInput.style.color = '#fff'; // keep visible on dark bg
                }
            };
        }

        // When user manually types in group name → clear dropdown selection
        if (groupInput) {
            groupInput.oninput = () => {
                if (existingSelector) existingSelector.value = '';
                groupInput.style.borderColor = '';
                groupInput.style.color = '#fff'; // always keep white text
            };
        }
        
        // Toggle Logic
        const toggleBtn = document.getElementById('toggle-import-section');
        const importContainer = document.getElementById('import-section-container');
        const toggleIcon = document.getElementById('toggle-icon');

        if (toggleBtn && importContainer) {
            toggleBtn.onclick = async () => {
                const isHidden = importContainer.classList.toggle('hidden');
                if (toggleIcon) {
                    toggleIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(45deg)';
                    toggleIcon.textContent = isHidden ? '➕' : '✕';
                }
                toggleBtn.style.borderColor = isHidden ? 'rgba(30,178,255,0.3)' : '#ff5252';
                toggleBtn.style.color = isHidden ? '#1eb2ff' : '#ff5252';
                
                const btnText = toggleBtn.childNodes[2];
                if (btnText) btnText.textContent = isHidden ? ' Add New Captions' : ' Close Form';
                
                // Refresh group list every time form opens
                if (!isHidden) await populateGroupSelector();
            };
        }

        if (saveBtn) {
            saveBtn.onclick = async () => {
                const group = groupInput.value.trim() || 'Default';
                const text = bulkInput.value.trim();
                if (!text) return alert("Please paste some captions first.");
                if (!groupInput.value.trim()) return alert("Please enter or select a group name.");

                const count = await this.saveCaptions(group, text);
                bulkInput.value = '';
                groupInput.value = '';
                groupInput.style.borderColor = '';
                groupInput.style.color = '';
                if (existingSelector) existingSelector.value = '';
                
                // Close form after save
                if (toggleBtn) toggleBtn.click();
                
                alert(`✅ Successfully imported ${count} captions to group "${group}"`);
                renderCaptionTable();
            };
        }

        // Initial Table Render

        renderCaptionTable();
    },


    async saveCaptions(groupName, rawText) {
        // Split by lines and filter empty ones
        const newCaptions = rawText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(text => ({
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                group: groupName,
                text: text,
                used: false,
                timestamp: Date.now()
            }));

        const result = await chrome.storage.local.get(['managedCaptions']);
        const existing = result.managedCaptions || [];
        const updated = [...existing, ...newCaptions];
        
        await chrome.storage.local.set({ managedCaptions: updated });
        return newCaptions.length;
    },

    async getCaptions() {
        const result = await chrome.storage.local.get(['managedCaptions']);
        return result.managedCaptions || [];
    },

    async deleteCaption(id) {
        const captions = await this.getCaptions();
        const updated = captions.filter(c => c.id !== id);
        await chrome.storage.local.set({ managedCaptions: updated });
    },

    async updateCaption(id, newText) {
        const captions = await this.getCaptions();
        const updated = captions.map(c => {
            if (c.id === id) return { ...c, text: newText };
            return c;
        });
        await chrome.storage.local.set({ managedCaptions: updated });
    },

    async markAsUsed(groupName, text) {
        const captions = await this.getCaptions();
        const updated = captions.map(c => {
            if (c.group === groupName && c.text === text) return { ...c, used: true };
            return c;
        });
        await chrome.storage.local.set({ managedCaptions: updated });
    },

    async resetUsedStatus(groupName) {
        const captions = await this.getCaptions();
        const updated = captions.map(c => {
            if (c.group === groupName) return { ...c, used: false };
            return c;
        });
        await chrome.storage.local.set({ managedCaptions: updated });
    },

    async deleteGroup(groupName) {
        const captions = await this.getCaptions();
        const updated = captions.filter(c => c.group !== groupName);
        await chrome.storage.local.set({ managedCaptions: updated });
    },

    /**
     * Pick exactly one unused caption. 
     * If all are used, it returns null.
     */
    async getUnusedCaption(groupName) {
        const captions = await this.getCaptions();
        const unused = captions.filter(c => c.group === groupName && !c.used);
        
        if (unused.length === 0) {
            console.warn(`⚠️ No unused captions left in group: ${groupName}`);
            return null;
        }
        
        const picked = unused[0]; 
        console.log(`🎯 Found unused caption: "${picked.text.substring(0, 20)}..."`);
        return picked.text;
    },

    async getGroups() {
        const captions = await this.getCaptions();
        const groups = [...new Set(captions.map(c => c.group))];
        return groups;
    }
};


// Logic for rendering the Captain View
function renderCaptionTable() {
    const container = document.getElementById('captions-list-container');
    if (!container) return;

    CaptionManager.getCaptions().then(captions => {
        if (captions.length === 0) {
            container.innerHTML = '<div style="color:rgba(255,255,255,0.4); text-align:center; padding:20px;">No captions saved yet. Click the button above to start!</div>';
            return;
        }

        // Group by group name
        const grouped = captions.reduce((acc, cap) => {
            if (!acc[cap.group]) acc[cap.group] = [];
            acc[cap.group].push(cap);
            return acc;
        }, {});

        let html = '';
        const groupEntries = Object.entries(grouped);
        
        groupEntries.forEach(([groupName, caps], index) => {
            const unusedCount = caps.filter(c => !c.used).length;
            const safeGroupId = `group-content-${index}`;
            
            html += `
                <div class="caption-accordion-item" style="margin-bottom:10px; border:1px solid rgba(255,255,255,0.05); border-radius:12px; overflow:hidden; background:rgba(0,0,0,0.15);">
                    <div class="caption-group-header" data-target="${safeGroupId}" style="background:rgba(30,178,255,0.08); padding:10px 12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:all 0.2s; user-select:none;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span class="folder-icon" style="font-size:16px; transition:transform 0.3s; transform:scale(1);">📁</span>
                            <div style="display:flex; flex-direction:column;">
                                <span style="color:#1eb2ff; font-weight:800; font-size:13px; letter-spacing:0.3px;">${groupName}</span>
                                <span style="color:rgba(255,255,255,0.4); font-size:10px;">${unusedCount}/${caps.length} Unused</span>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <button class="reset-group-btn" data-group="${groupName}" title="Mark all captions as Unused (Ready)" style="background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); color:#fbbf24; font-size:9px; cursor:pointer; font-weight:800; padding:4px 7px; border-radius:6px; transition:all 0.2s;">🔄 Reset</button>
                            <button class="delete-group-btn" data-group="${groupName}" title="Delete entire group" style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); color:#f87171; font-size:9px; cursor:pointer; font-weight:800; padding:4px 7px; border-radius:6px; transition:all 0.2s;">🗑️ Delete</button>
                            <span class="chevron-icon" style="color:rgba(255,255,255,0.3); font-size:10px; transition:transform 0.3s; transform:rotate(0deg);">▼</span>
                        </div>
                    </div>
                    
                    <div id="${safeGroupId}" class="caption-group-content hidden" style="max-height: 250px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.03); scrollbar-width: thin;">
                        <table style="width:100%; border-collapse:collapse; table-layout: fixed;">
                            <thead>
                                <tr style="text-align:left; font-size:9px; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.1);">
                                    <th style="padding:8px 8px; width:28px; text-align:center;">#</th>
                                    <th style="padding:8px 6px; width:60px;">Status</th>
                                    <th style="padding:8px 10px;">Caption Text</th>
                                    <th style="padding:8px 10px; width:70px; text-align:right;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            caps.forEach((c, idx) => {
                html += `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.03); font-size:11px; transition:background 0.2s;">
                        <td style="padding:6px 8px; text-align:center;">
                            <span style="color:rgba(255,255,255,0.25); font-size:9px; font-weight:700;">${idx + 1}</span>
                        </td>
                        <td style="padding:6px 6px;">
                            <div style="color:${c.used ? '#f87171' : '#4ade80'}; background:${c.used ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)'}; padding:2px 0; border-radius:4px; font-weight:800; font-size:8px; text-align:center;">
                                ${c.used ? 'USED' : 'READY'}
                            </div>
                        </td>
                        <td style="padding:6px 10px; color:rgba(255,255,255,0.7); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${c.text.replace(/"/g, '&quot;')}">
                            ${c.text}
                        </td>
                        <td style="padding:6px 10px; text-align:right;">
                            <div style="display:flex; gap:6px; justify-content:flex-end;">
                                <button class="edit-caption-btn" data-id="${c.id}" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:6px; height:24px; width:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#fff; font-size:10px;">✏️</button>
                                <button class="delete-caption-btn" data-id="${c.id}" style="background:rgba(239,68,68,0.05); border:1px solid rgba(239, 68, 68, 0.2); border-radius:6px; height:24px; width:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:10px;">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `;
            });


            html += `</tbody></table></div></div>`;
        });
        container.innerHTML = html;

        // --- ATTACH EVENTS ---
        
        // Accordion Toggle Logic
        container.querySelectorAll('.caption-group-header').forEach(header => {
            header.onclick = (e) => {
                // Ignore if clicked on Reset button
                if (e.target.closest('.reset-group-btn')) return;

                const targetId = header.dataset.target;
                const content = document.getElementById(targetId);
                const isHidden = content.classList.toggle('hidden');
                
                // Animate icons
                const chevron = header.querySelector('.chevron-icon');
                const folder = header.querySelector('.folder-icon');
                if (chevron) chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
                if (folder) folder.style.transform = isHidden ? 'scale(1)' : 'scale(1.2)';
                
                header.style.background = isHidden ? 'rgba(30,178,255,0.08)' : 'rgba(30,178,255,0.15)';
            };
        });

        // Delete Row
        container.querySelectorAll('.delete-caption-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if(confirm('Delete this caption?')) {
                    CaptionManager.deleteCaption(btn.dataset.id).then(renderCaptionTable);
                }
            };
        });

        // Reset Group
        container.querySelectorAll('.reset-group-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`Reset all captions in "${btn.dataset.group}"?\n\nThis will mark all USED captions back to READY so they can be used again.`)) {
                    CaptionManager.resetUsedStatus(btn.dataset.group).then(renderCaptionTable);
                }
            };
        });

        // Delete Entire Group
        container.querySelectorAll('.delete-group-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`⚠️ Delete entire group "${btn.dataset.group}"?\n\nAll ${btn.dataset.group} captions will be permanently deleted. This cannot be undone.`)) {
                    CaptionManager.deleteGroup(btn.dataset.group).then(renderCaptionTable);
                }
            };
        });


        // Edit Row
        container.querySelectorAll('.edit-caption-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const cap = captions.find(c => c.id === id);
                const newText = prompt("Edit Caption:", cap.text);
                if (newText !== null && newText.trim() !== "") {
                    CaptionManager.updateCaption(id, newText.trim()).then(renderCaptionTable);
                }
            };
        });
    });
}

