const GoogleSheetFetcher = {
    async fetchColumns() {
        // Get URL from settings
        const { settings_sheet_url } = await chrome.storage.local.get(['settings_sheet_url']);
        if (!settings_sheet_url) {
            alert('❌ Google Sheet URL is missing!\n\nPlease add it in Settings first.');
            return;
        }

        // Extract ID
        let sheetId = '';
        try {
            const urlObj = new URL(settings_sheet_url);
            const pathParts = urlObj.pathname.split('/');
            const dIndex = pathParts.indexOf('d');
            if (dIndex !== -1 && pathParts.length > dIndex + 1) {
                sheetId = pathParts[dIndex + 1];
            } else {
                throw new Error("Invalid URL format");
            }
        } catch (err) {
            alert('❌ Invalid Google Sheet URL format in Settings.');
            return;
        }

        // Fetch gviz JSON data
        const apiUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=caption&headers=0`;
        
        // Show loading state
        const fetchBtn = document.getElementById('fetch-sheet-captions-btn');
        if(fetchBtn) {
            fetchBtn.dataset.originalText = fetchBtn.innerHTML;
            fetchBtn.innerHTML = '🔄 Fetching...';
            fetchBtn.style.opacity = '0.7';
            fetchBtn.style.pointerEvents = 'none';
        }

        try {
            const response = await fetch(apiUrl);
            let text = await response.text();
            
            // Clean up JSONP wrapping: remove google.visualization.Query.setResponse(...)
            const prefix = 'google.visualization.Query.setResponse(';
            const prefixIdx = text.indexOf(prefix);
            if(prefixIdx === -1) throw new Error("Could not parse Google Sheet response. Is it Public?");
            
            text = text.substring(prefixIdx + prefix.length);
            text = text.substring(0, text.lastIndexOf(')'));
            
            const jsonData = JSON.parse(text);
            
            if (jsonData.status === 'error') {
                throw new Error(jsonData.errors[0].message);
            }

            // Extract headers. If label is empty, try to use the first row.
            let firstRowIsHeader = false;
            let cols = jsonData.table.cols.map((col, index) => {
                let label = col.label;
                if (!label && jsonData.table.rows.length > 0) {
                    // Try to get from first row
                    const cell = jsonData.table.rows[0].c[index];
                    if (cell && cell.v) {
                        label = cell.v.toString().trim();
                        firstRowIsHeader = true;
                    }
                }
                return {
                    id: col.id || `Col${index}`,
                    label: label || `Column ${index + 1}`
                };
            });

            if (cols.length === 0) {
                throw new Error("No columns found in the 'caption' sheet.");
            }

            // Group rows by column index
            let rows = jsonData.table.rows;
            if (firstRowIsHeader) {
                rows = rows.slice(1); // remove the first row since we used it as headers
            }

            const columnData = cols.reduce((acc, col, index) => {
                acc[index] = {
                    label: col.label,
                    captions: []
                };
                return acc;
            }, {});

            rows.forEach(row => {
                row.c.forEach((cell, index) => {
                    if (cell && cell.v !== null && cell.v !== '') {
                        columnData[index].captions.push(cell.v.toString().trim());
                    }
                });
            });

            // Filter out columns with 0 captions
            const validColumns = Object.values(columnData).filter(c => c.captions.length > 0 && c.label.trim() !== '');

            if(validColumns.length === 0) {
                alert("⚠️ No captions found inside the 'caption' sheet.");
                return;
            }

            this.showColumnSelectionUI(validColumns);

        } catch (err) {
            alert(`❌ Error fetching sheet: ${err.message}\n\nMake sure the sheet is Public ("Anyone with the link") and has a tab named exactly "caption".`);
        } finally {
            if(fetchBtn) {
                fetchBtn.innerHTML = fetchBtn.dataset.originalText;
                fetchBtn.style.opacity = '1';
                fetchBtn.style.pointerEvents = 'auto';
            }
        }
    },

    showColumnSelectionUI(columns) {
        // Create modal overlay dynamically
        let overlay = document.getElementById('sheet-column-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sheet-column-modal-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.8); backdrop-filter: blur(5px);
                z-index: 99999; display: flex; align-items: center; justify-content: center;
                animation: fadeIn 0.2s;
            `;
            document.body.appendChild(overlay);
        }

        let html = `
            <div style="background:linear-gradient(135deg, #0d2137 0%, #0a1628 100%); border:1px solid rgba(30,178,255,0.4); border-radius:16px; width:90%; max-width:400px; padding:20px; box-shadow:0 15px 40px rgba(0,0,0,0.6); position:relative; overflow:hidden;">
                
                <button id="close-sheet-modal-btn" style="position:absolute; top:15px; right:15px; background:none; border:none; color:rgba(255,255,255,0.5); font-size:18px; cursor:pointer; line-height:1;">✕</button>
                
                <h3 style="margin:0 0 5px 0; color:#1eb2ff; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:20px;">📊</span> Select Columns
                </h3>
                <p style="margin:0 0 15px 0; color:rgba(255,255,255,0.5); font-size:11px; font-style:italic;">Choose the columns you want to import. You can rename the target Group manually below.</p>
                
                <div style="max-height:220px; overflow-y:auto; padding-right:5px; scrollbar-width:thin; display:flex; flex-direction:column; gap:8px;" id="sheet-columns-list">
        `;

        columns.forEach((col, idx) => {
            html += `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:10px; display:flex; align-items:center; gap:10px; transition:background 0.2s;">
                    <input type="checkbox" id="sheet-col-cb-${idx}" class="sheet-col-checkbox" data-idx="${idx}" checked style="width:16px; height:16px; accent-color:#1eb2ff; flex-shrink:0; cursor:pointer;">
                    
                    <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                        <span style="color:#fff; font-size:11px; font-weight:700;">Original: <span style="color:rgba(255,255,255,0.6);">${col.label}</span> (${col.captions.length} items)</span>
                        <input type="text" id="sheet-col-name-${idx}" value="${col.label}" placeholder="Group Name" style="width:100%; padding:6px 8px; border:1px solid rgba(30,178,255,0.3); border-radius:6px; background:rgba(0,12,35,0.8); color:#1eb2ff; font-size:12px; font-weight:700; outline:none; box-sizing:border-box;">
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                
                <button id="save-selected-columns-btn" style="width:100%; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff; border:none; padding:12px; border-radius:10px; font-weight:800; font-size:13px; cursor:pointer; margin-top:15px; box-shadow:0 4px 15px rgba(16, 185, 129, 0.3); transition:all 0.2s;">
                    ✅ Save Selected & Import
                </button>
            </div>
        `;

        overlay.innerHTML = html;
        overlay.style.display = 'flex';

        // Add Listeners
        document.getElementById('close-sheet-modal-btn').onclick = () => {
            overlay.style.display = 'none';
        };

        document.getElementById('save-selected-columns-btn').onclick = async () => {
            const checkboxes = document.querySelectorAll('.sheet-col-checkbox');
            let totalSaved = 0;
            let groupCount = 0;

            for (const cb of checkboxes) {
                if (cb.checked) {
                    const idx = cb.dataset.idx;
                    const groupNameInput = document.getElementById(`sheet-col-name-${idx}`);
                    let targetGroup = groupNameInput.value.trim();
                    if(!targetGroup) targetGroup = columns[idx].label || 'Untitled Group';
                    
                    const captionsText = columns[idx].captions.join('\n');
                    
                    // Uses existing CaptionManager infrastructure
                    await CaptionManager.saveCaptions(targetGroup, captionsText);
                    totalSaved += columns[idx].captions.length;
                    groupCount++;
                }
            }

            overlay.style.display = 'none';
            alert(`✅ Successfully imported ${totalSaved} captions across ${groupCount} groups.`);
            
            // Re-render the table if we're in the panel script context
            if (typeof renderCaptionTable === 'function') {
                renderCaptionTable();
            }
        };
    }
};

// Bind fetch button automatically when script loads
document.addEventListener('DOMContentLoaded', () => {
    // We attempt binding multiple times since toggle might happen dynamically
    setInterval(() => {
        const fetchBtn = document.getElementById('fetch-sheet-captions-btn');
        if(fetchBtn && !fetchBtn.dataset.bound) {
            fetchBtn.dataset.bound = 'true';
            fetchBtn.addEventListener('click', () => {
                GoogleSheetFetcher.fetchColumns();
            });
        }

        const fetchPresetBtn = document.getElementById('fetch-sheet-preset-btn');
        if(fetchPresetBtn && !fetchPresetBtn.dataset.bound) {
            fetchPresetBtn.dataset.bound = 'true';
            fetchPresetBtn.addEventListener('click', () => {
                GoogleSheetFetcher.fetchPresetColumns();
            });
        }
    }, 1000);
});

// Add these new methods dynamically to GoogleSheetFetcher
GoogleSheetFetcher.fetchPresetColumns = async function() {
    const { settings_sheet_url } = await chrome.storage.local.get(['settings_sheet_url']);
    if (!settings_sheet_url) {
        alert('❌ Google Sheet URL is missing!\n\nPlease add it in Settings first.');
        return;
    }

    let sheetId = '';
    try {
        const urlObj = new URL(settings_sheet_url);
        const pathParts = urlObj.pathname.split('/');
        const dIndex = pathParts.indexOf('d');
        if (dIndex !== -1 && pathParts.length > dIndex + 1) {
            sheetId = pathParts[dIndex + 1];
        } else throw new Error("Invalid URL");
    } catch (err) {
        alert('❌ Invalid Google Sheet URL format in Settings.');
        return;
    }

    // Always fetch All Group
    const apiUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=All Group&headers=1`;
    
    // UI Loading state
    const fetchBtn = document.getElementById('fetch-sheet-preset-btn');
    if(fetchBtn) {
        fetchBtn.dataset.originalText = fetchBtn.innerHTML;
        fetchBtn.innerHTML = '🔄 Fetching...';
        fetchBtn.style.opacity = '0.7';
        fetchBtn.style.pointerEvents = 'none';
    }

    try {
        const response = await fetch(apiUrl);
        let text = await response.text();
        const prefix = 'google.visualization.Query.setResponse(';
        const prefixIdx = text.indexOf(prefix);
        if(prefixIdx === -1) throw new Error("Could not parse Google Sheet response. Is it Public?");
        
        text = text.substring(prefixIdx + prefix.length);
        text = text.substring(0, text.lastIndexOf(')'));
        const jsonData = JSON.parse(text);
        
        if (jsonData.status === 'error') throw new Error(jsonData.errors[0].message);

        let firstRowIsHeader = false;
        let cols = jsonData.table.cols.map((col, index) => {
            let label = col.label;
            if (!label && jsonData.table.rows.length > 0) {
                const cell = jsonData.table.rows[0].c[index];
                if (cell && cell.v) {
                    label = cell.v.toString().trim();
                    firstRowIsHeader = true;
                }
            }
            return {
                id: col.id || `Col${index}`,
                label: label || `Column ${index + 1}`
            };
        });

        if (cols.length === 0) throw new Error("No columns found in the 'All Group' sheet.");

        let rows = jsonData.table.rows;
        if (firstRowIsHeader) rows = rows.slice(1);

        const columnData = cols.reduce((acc, col, index) => {
            acc[index] = { label: col.label, data: [] };
            return acc;
        }, {});

        rows.forEach(row => {
            row.c.forEach((cell, index) => {
                let val = '';
                if (cell && cell.v !== null && cell.v !== '') {
                    val = cell.v.toString().trim();
                }
                columnData[index].data.push(val);
            });
        });

        const validColumns = Object.entries(columnData)
            .filter(([idx, c]) => c.data.some(v => v !== '') && c.label.trim() !== '')
            .map(([idx, c]) => ({ idx, ...c }));

        if(validColumns.length === 0) {
            alert("⚠️ No data found inside the 'All Group' sheet.");
            return;
        }

        this.showPresetColumnSelectionUI(validColumns, rows.length);

    } catch (err) {
        alert(`❌ Error fetching sheet: ${err.message}\n\nMake sure the sheet is Public ("Anyone with the link") and has a tab named exactly "All Group".`);
    } finally {
        if(fetchBtn) {
            fetchBtn.innerHTML = fetchBtn.dataset.originalText;
            fetchBtn.style.opacity = '1';
            fetchBtn.style.pointerEvents = 'auto';
        }
    }
};

GoogleSheetFetcher.showPresetColumnSelectionUI = function(columns, totalRows) {
    let overlay = document.getElementById('sheet-preset-column-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sheet-preset-column-modal-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.8); backdrop-filter: blur(5px);
            z-index: 99999; display: flex; align-items: center; justify-content: center;
            animation: fadeIn 0.2s;
        `;
        document.body.appendChild(overlay);
    }

    let html = `
        <div style="background:linear-gradient(135deg, #0d2137 0%, #0a1628 100%); border:1px solid rgba(30,178,255,0.4); border-radius:16px; width:90%; max-width:400px; padding:20px; box-shadow:0 15px 40px rgba(0,0,0,0.6); position:relative; overflow:hidden;">
            <button id="close-preset-sheet-modal-btn" style="position:absolute; top:15px; right:15px; background:none; border:none; color:rgba(255,255,255,0.5); font-size:18px; cursor:pointer; line-height:1;">✕</button>
            <h3 style="margin:0 0 5px 0; color:#1eb2ff; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px;">📊</span> Select Data Columns
            </h3>
            <p style="margin:0 0 15px 0; color:rgba(255,255,255,0.5); font-size:11px; font-style:italic;">Check the columns you want to import into the Preset Manager table.</p>
            <div style="max-height:220px; overflow-y:auto; padding-right:5px; scrollbar-width:thin; display:flex; flex-direction:column; gap:8px;">
    `;

    columns.forEach((col, arrayIndex) => {
        html += `
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:10px; display:flex; align-items:center; gap:10px; transition:background 0.2s;">
                <input type="checkbox" id="preset-sheet-col-cb-${arrayIndex}" class="preset-sheet-col-checkbox" data-array-idx="${arrayIndex}" style="width:16px; height:16px; accent-color:#1eb2ff; flex-shrink:0; cursor:pointer;">
                <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                    <span style="color:#fff; font-size:12px; font-weight:700;">${col.label}</span>
                </div>
            </div>
        `;
    });

    html += `
            </div>
            <button id="import-preset-selected-columns-btn" style="width:100%; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff; border:none; padding:12px; border-radius:10px; font-weight:800; font-size:13px; cursor:pointer; margin-top:15px; box-shadow:0 4px 15px rgba(16, 185, 129, 0.3); transition:all 0.2s;">
                ⏬ Import to Manager
            </button>
        </div>
    `;

    overlay.innerHTML = html;
    overlay.style.display = 'flex';

    document.getElementById('close-preset-sheet-modal-btn').onclick = () => overlay.style.display = 'none';

    document.getElementById('import-preset-selected-columns-btn').onclick = () => {
        const checkboxes = document.querySelectorAll('.preset-sheet-col-checkbox');
        const selectedColumns = [];
        
        checkboxes.forEach(cb => {
            if (cb.checked) {
                const colData = columns[cb.dataset.arrayIdx];
                selectedColumns.push(colData);
            }
        });

        if (selectedColumns.length === 0) {
            alert("Please select at least one column.");
            return;
        }

        // Hide textarea, clear its content
        const linkInput = document.getElementById('preset-links-input');
        if(linkInput) {
            linkInput.value = '';
            linkInput.parentElement.querySelector('label').style.display = 'none';
            linkInput.style.display = 'none';
        }

        const thead = document.getElementById('preset-dynamic-thead');
        const tbody = document.getElementById('extraction-results-tbody');
        const container = document.getElementById('preset-scraped-names-container');
        const summaryText = document.getElementById('extraction-summary-text');
        
        if(container) container.classList.remove('hidden');
        
        // Rebuild THEAD
        let trHead = `<tr style="border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(74,222,128,0.1);">`;
        trHead += `<th style="padding: 6px; width: 30px; text-align:center;"><input type="checkbox" id="preset-master-cb" checked style="accent-color:#4ade80;"></th>`;
        selectedColumns.forEach(c => {
            trHead += `<th style="padding: 6px 10px; font-size: 11px; color: #4ade80; font-weight: 600;">${c.label}</th>`;
        });
        trHead += `<th style="padding: 6px 10px; font-size: 11px; color: #4ade80; font-weight: 600; width: 30%">Extracted Name (Edit)</th>`;
        trHead += `</tr>`;
        thead.innerHTML = trHead;

        // Rebuild TBODY
        let trBodyHtml = '';
        let actualRowCount = 0;
        for(let r = 0; r < totalRows; r++) {
            // Check if row is entirely empty
            const isEmptyRow = selectedColumns.every(c => !c.data[r] || c.data[r].trim() === '');
            if(isEmptyRow) continue;
            
            actualRowCount++;
            const safeId = `preset-row-${r}`;
            trBodyHtml += `<tr id="${safeId}" class="preset-dynamic-row" style="border-bottom: 1px solid rgba(255,255,255,0.05);">`;
            trBodyHtml += `<td style="padding: 6px; text-align:center;"><input type="checkbox" class="preset-row-cb" checked style="accent-color:#4ade80;"></td>`;
            
            selectedColumns.forEach(c => {
                const cellVal = c.data[r] || '';
                // Check if this looks like a link
                const isLink = cellVal.startsWith('http');
                const displayVal = isLink 
                    ? `<a href="${cellVal}" target="_blank" class="preset-potential-link" style="color:#1eb2ff; text-decoration:underline;">${cellVal}</a>` 
                    : cellVal;
                
                trBodyHtml += `<td style="padding: 8px 10px; font-size: 11px; color:rgba(255,255,255,0.8); max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayVal}</td>`;
            });
            trBodyHtml += `<td style="padding: 6px 10px;">
                               <input type="text" class="preset-extracted-name-input" placeholder="Pending Extraction..." style="width:100%; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.5); color:#fff; padding:4px 6px; font-size:11px; border-radius:4px;">
                           </td>`;
            trBodyHtml += `</tr>`;
        }
        tbody.innerHTML = trBodyHtml;
        
        if(summaryText) summaryText.textContent = `0/${actualRowCount} Extracted`;

        // Master checkbox event
        document.getElementById('preset-master-cb').addEventListener('change', (e) => {
            document.querySelectorAll('.preset-row-cb').forEach(cb => cb.checked = e.target.checked);
        });

        overlay.style.display = 'none';
    };
};
