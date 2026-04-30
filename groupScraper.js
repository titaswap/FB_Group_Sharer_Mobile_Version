console.log('✅ groupScraper.js loaded!');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'get_groups') {
        try {
            console.log("Scraping groups from DOM...");
            const groups = extractGroupsFromDOM();
            console.log(`Found ${groups.length} groups:`, groups);
            sendResponse({ success: true, groups: groups });
        } catch (error) {
            console.error("Error extracting groups:", error);
            sendResponse({ success: false, error: error.message });
        }
    }
    // Return nothing (undefined) if we don't handle this message,
    // or if we handle it and have ALREADY called sendResponse synchronously.
});

function extractGroupsFromDOM() {
    const groups = [];
    
    // Find all checkboxes or things acting like checkboxes
    const checkboxes = document.querySelectorAll('input[type="checkbox"], [role="checkbox"], [aria-checked]');
    const nameOccurrences = {}; // track occurrences for duplicates
    
    checkboxes.forEach((box, index) => {
        let nameContent = '';
        let groupUrl = null;
        let groupId = null;

        // Traverse up to find a container with substantial text
        // Usually, a checkbox is inside a row with the group name spanning next to it.
        let parent = box.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
            if (parent.innerText && parent.innerText.trim().length > 0) {
                // Split text by lines to avoid grabbing entire sections of the page.
                const lines = parent.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                
                // Get the first line that looks like a group name (not checkbox states like "checked").
                for (let line of lines) {
                    const l = line.toLowerCase();
                    if (l !== 'checked' && l !== 'not checked' && l !== 'selected' && l !== 'unselected') {
                        nameContent = line;
                        break;
                    }
                }
                
                if (nameContent) break;
            }
            parent = parent.parentElement;
        }
        
        // Fallback: looking for spans next to the checkbox if DOM structure is unusual
        if (!nameContent) {
            const row = box.closest('div[role="row"], div.x1i10hfl');
            if (row) {
                const spans = row.querySelectorAll('span, span[dir]');
                let longestSpanText = '';
                spans.forEach(s => {
                    const t = s.innerText?.trim();
                    if (t && t.length > longestSpanText.length && !t.match(/checked|selected/i)) {
                        longestSpanText = t;
                    }
                });
                if (longestSpanText) nameContent = longestSpanText;
            }
        }

        // Fallback: aria-label
        if (!nameContent || nameContent.length <= 1) {
            nameContent = box.getAttribute('aria-label') || '';
        }
        
        // Clean up text
        nameContent = nameContent.replace(/Not checked|Checked|Select|Unselect/gi, '').trim();

        // Push valid names without deduplication to preserve order and duplicates
        if (nameContent && nameContent.length > 0) {
            
            // Try to find a link nearby to extract URL and ID
            const row = box.closest('div[role="row"]') || box.closest('div.x1i10hfl') || box.parentElement?.parentElement;
            if (row) {
                const link = row.querySelector('a[href*="/groups/"]');
                if (link) {
                    groupUrl = link.href.split('?')[0]; // clean up query params
                    const match = groupUrl.match(/\/groups\/([^/]+)/);
                    if (match) {
                        groupId = match[1];
                    }
                }
            }

            // Track occurrence
            nameOccurrences[nameContent] = (nameOccurrences[nameContent] || 0) + 1;
            const occurrenceIndex = nameOccurrences[nameContent] - 1;

            groups.push({
                id: groupId || `group_occurrence_${index}`,
                url: groupUrl,
                name: nameContent,
                occurrenceIndex: occurrenceIndex,
                checked: !!box.checked || box.getAttribute('aria-checked') === 'true'
            });
        }
    });

    return groups;
}
