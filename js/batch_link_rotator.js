// ============================================================
// batch_link_rotator.js
// Handles rotating short links per batch.
// Reads from 'current_short_links_pool' in storage.
// ============================================================

async function getNextBatchUrl(defaultUrl, batchIndex) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['settings_rotate_short_links', 'current_short_links_pool'], (res) => {
            if (res.settings_rotate_short_links && res.current_short_links_pool && res.current_short_links_pool.length > 0) {
                const pool = res.current_short_links_pool;
                const nextUrl = pool[batchIndex % pool.length];
                console.log(`[LINK ROTATOR] Using short link ${ (batchIndex % pool.length) + 1 }/${pool.length}: ${nextUrl}`);
                resolve(nextUrl);
            } else {
                resolve(defaultUrl);
            }
        });
    });
}
