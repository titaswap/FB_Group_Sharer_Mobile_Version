// ─────────────────────────────────────────────────────────────────────────────
// Smart photo_id extractor (based on user's fb.js logic)
// Problem: A single Facebook page HTML contains photo_id from:
//   - main post ✅  - suggested reels ❌  - ads ❌  - comment media ❌
// Solution: Find the photo_id that is ALSO referenced as story_fbid → that's
// the main post. Fallback: biggest numeric ID (usually the main post).
// ─────────────────────────────────────────────────────────────────────────────
function extractSmartPhotoId(html) {
    const allMatches = [...html.matchAll(/"photo_id"\s*:\s*"?(\d{10,})"?/g)];
    console.log(`[RESOLVER] -> photo_id candidates: ${allMatches.length}`);
    if (allMatches.length === 0) return null;

    const mainMatch = allMatches.find(m => {
        const id = m[1];
        return html.includes(`"story_fbid":"${id}"`) ||
               html.includes(`"story_fbid":${id}`);
    });
    if (mainMatch) {
        console.log(`[RESOLVER] -> photo_id matched via story_fbid: ${mainMatch[1]}`);
        return mainMatch[1];
    }

    const largest = allMatches
        .map(m => m[1])
        .sort((a, b) => Number(b) - Number(a))[0];
    console.log(`[RESOLVER] -> photo_id fallback (largest): ${largest}`);
    return largest;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main resolver
// KEY FIX: credentials:'omit' → no cookies → Facebook returns Googlebot-like
// simple HTML with og:url instead of the full logged-in React SPA.
// ─────────────────────────────────────────────────────────────────────────────
async function resolveFbShareLink(link) {
    if (!link || !link.includes('facebook.com')) return link;

    // Check if resolver is enabled in settings (default is true)
    const settings = await new Promise(resolve => {
        chrome.storage.local.get(['settings_clean_links'], (res) => {
            resolve(res);
        });
    });

    if (settings.settings_clean_links === false) {
        console.log(`[RESOLVER] -> ⚠️ Clean Links is OFF in settings. Returning original link.`);
        return link;
    }

    try {
        console.log(`[RESOLVER] Fetching: ${link}`);

        const response = await fetch(link, {
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            credentials: 'omit'  // no cookies → Googlebot-like simple HTML
        });
        const html = await response.text();
        const finalUrl = response.url;

        console.log(`[RESOLVER] -> Redirected to: ${finalUrl}`);
        console.log(`[RESOLVER] -> HTML: ${html.length} bytes, Status: ${response.status}`);
        console.log(`[RESOLVER] -> Has og:url: ${html.includes('og:url')}`);
        console.log(`[RESOLVER] -> Has photo_id: ${html.includes('"photo_id"')}`);
        console.log(`[RESOLVER] -> Has story_fbid: ${html.includes('"story_fbid"')}`);

        let photoId = '';
        let mediaType = 'Photo';

        // ── STRATEGY 1: Numeric ID from redirect URL ─────────────────
        // Only trust numeric IDs, NOT pfbid format
        try {
            const urlObj = new URL(finalUrl);
            const fbidParam   = urlObj.searchParams.get('fbid');
            const reelMatch   = urlObj.pathname.match(/\/reel\/(\d+)/);
            const photosMatch = urlObj.pathname.match(/\/photos\/(\d+)/);

            if (fbidParam && /^\d+$/.test(fbidParam)) {
                photoId = fbidParam;
                console.log(`[RESOLVER] -> Strategy 1: fbid param = ${photoId}`);
            } else if (reelMatch) {
                photoId = reelMatch[1];
                mediaType = 'Video';
                console.log(`[RESOLVER] -> Strategy 1: reel ID = ${photoId}`);
            } else if (photosMatch) {
                photoId = photosMatch[1];
                console.log(`[RESOLVER] -> Strategy 1: photos path = ${photoId}`);
            }
        } catch (e) {
            console.warn(`[RESOLVER] -> Strategy 1 error: ${e.message}`);
        }

        // ── STRATEGY 2: __typename Photo/Video ───────────────────────
        // Most accurate for photo/video — same as Node.js script.
        // og:url path gives POST ID; __typename gives actual MEDIA ID.
        // NOTE: this also handles wrong-source problem because Node.js
        // gets simpler HTML (via credentials:omit) where the FIRST
        // __typename match is the main post, not sidebar/ad.
        if (!photoId) {
            const photoRegex = /"__typename"\s*:\s*"(Photo|Video)"\s*,\s*"id"\s*:\s*"(\d{10,})"/g;
            const reversed   = /"id"\s*:\s*"(\d{10,})"\s*,\s*"__typename"\s*:\s*"(Photo|Video)"/g;
            const matches1   = [...html.matchAll(photoRegex)];
            const matches2   = [...html.matchAll(reversed)];
            console.log(`[RESOLVER] -> Strategy 2: __typename matches normal=${matches1.length} reversed=${matches2.length}`);

            if (matches1.length > 0) {
                mediaType = matches1[0][1];
                photoId   = matches1[0][2];
                console.log(`[RESOLVER] -> Strategy 2: ${mediaType} ID = ${photoId}`);
            } else if (matches2.length > 0) {
                photoId   = matches2[0][1];
                mediaType = matches2[0][2];
                console.log(`[RESOLVER] -> Strategy 2 (reversed): ${mediaType} ID = ${photoId}`);
            }
        }

        // ── STRATEGY 3: og:url — only fbid= or /reel/ID ─────────────
        // IMPORTANT: og:url path like /posts/slug/2196479251106620/ is
        // the POST ID, NOT the photo ID → we deliberately skip it here.
        // post ID goes to Strategy 6 as last resort only.
        if (!photoId) {
            const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
            if (ogUrlMatch && ogUrlMatch[1]) {
                console.log(`[RESOLVER] -> Strategy 3: og:url = ${ogUrlMatch[1]}`);
                try {
                    const ogObj = new URL(ogUrlMatch[1]);
                    const fbid  = ogObj.searchParams.get('fbid');
                    const reel  = ogObj.pathname.match(/\/reel\/(\d+)/);

                    if (fbid && /^\d+$/.test(fbid)) {
                        photoId = fbid;
                        console.log(`[RESOLVER] -> Strategy 3: fbid = ${photoId}`);
                    } else if (reel) {
                        photoId = reel[1];
                        mediaType = 'Video';
                        console.log(`[RESOLVER] -> Strategy 3: reel = ${photoId}`);
                    }
                } catch (e) { }
            } else {
                console.log(`[RESOLVER] -> Strategy 3: og:url not found.`);
            }
        }

        // ── STRATEGY 4: Smart photo_id + story_fbid cross-reference ──
        if (!photoId) {
            const smartId = extractSmartPhotoId(html);
            if (smartId) {
                photoId   = smartId;
                mediaType = 'Photo';
                console.log(`[RESOLVER] -> Strategy 4: smart photo_id = ${photoId}`);
            }
        }

        // ── STRATEGY 5: story_fbid ───────────────────────────────────
        if (!photoId) {
            const storyMatch = html.match(/"story_fbid"\s*:\s*"?(\d{10,})"?/);
            if (storyMatch) {
                photoId = storyMatch[1];
                console.log(`[RESOLVER] -> Strategy 5: story_fbid = ${photoId}`);
            }
        }

        // ── STRATEGY 6 (last resort): post ID from og:url path ───────
        // This is POST ID not photo ID — used only if nothing else worked.
        if (!photoId) {
            const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
            if (ogUrlMatch && ogUrlMatch[1]) {
                try {
                    const ogObj       = new URL(ogUrlMatch[1]);
                    const postIdMatch = ogObj.pathname.match(/(\d{10,})\/?$/);
                    if (postIdMatch) {
                        photoId = postIdMatch[1];
                        console.log(`[RESOLVER] -> Strategy 6 (post ID fallback): ${photoId}`);
                    }
                } catch (e) { }
            }
        }

        // ─── Build final clean link ──────────────────────────────────
        if (photoId) {
            const newLink = mediaType === 'Video'
                ? `https://www.facebook.com/reel/${photoId}/`
                : `https://www.facebook.com/photo/?fbid=${photoId}`;
            console.log(`[RESOLVER] -> ✅ ${link}  =>  ${newLink}`);
            return newLink;
        }

        console.log(`[RESOLVER] -> ❌ Could not resolve. Returning original.`);
        return link;

    } catch (err) {
        console.error(`[RESOLVER] Error: ${err.message}`);
    }
    return link;
}
