// ==========================================
// FILE: js/panel/panel_triggers_log.js
// DESCRIPTION: Renders the schedule triggers history log in the Activity Modal UI.
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    // UI Elements
    const scheduleLogEntries = document.getElementById('schedule-log-entries');
    
    // Core Rendering Function
    const renderScheduleLogs = () => {
        if (!scheduleLogEntries) return;

        chrome.storage.local.get(['trigger_logs'], (res) => {
            const logs = res.trigger_logs || [];
            
            if (logs.length === 0) {
                scheduleLogEntries.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #9ca3af; padding: 15px;">No schedule triggers yet.</td></tr>`;
                return;
            }

            let html = '';
            logs.forEach((log, idx) => {
                const isSuccess = log.status === 'SUCCESS' || log.status === 'STARTED';
                const statusColor = isSuccess ? '#34d399' : '#f87171';

                // ✅ CSP FIX: No inline onmouseover/onmouseout — use data attribute + addEventListener below
                html += `
                  <tr data-log-row="${idx}" style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; cursor: default;">
                    <td style="padding: 10px; font-weight: 700; color: #60a5fa;">#${log.run}</td>
                    <td style="padding: 10px; color: #d1d5db; font-size: 11px;">⏰ ${log.time}</td>
                    <td style="padding: 10px; text-align: right; font-weight: 600; font-size: 11px; color: ${statusColor};">
                        ${log.status}
                    </td>
                  </tr>
                `;
            });

            scheduleLogEntries.innerHTML = html;

            // ✅ CSP FIX: Attach hover effects via JS after DOM insert (not inline attributes)
            scheduleLogEntries.querySelectorAll('tr[data-log-row]').forEach(row => {
                row.addEventListener('mouseover', () => { row.style.background = 'rgba(255,255,255,0.05)'; });
                row.addEventListener('mouseout',  () => { row.style.background = 'transparent'; });
            });

        });
    };

    // Make global so refresh button in panel.js can call it
    window.renderScheduleLogs = renderScheduleLogs;

    // Extend the existing refresh button listener in panel.js
    const refreshLogsBtn = document.getElementById('refresh-logs-btn');
    if (refreshLogsBtn) {
        refreshLogsBtn.addEventListener('click', renderScheduleLogs);
    }
    
    // Extend clear logs button listener
    // Note: clear-logs-btn logic is handled directly in panel_automation.js to ensure the confirm prompt works for both tables simultaneously.

    // Bind event to modal open (assuming the view activity click binds to it)
    const viewActivityLogBtn = document.getElementById('view-activity-log-btn');
    if (viewActivityLogBtn) {
        viewActivityLogBtn.addEventListener('click', renderScheduleLogs);
    }

    // Initial render
    renderScheduleLogs();
});
