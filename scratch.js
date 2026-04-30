fetch('https://www.facebook.com/share/p/1HA6ALbCuC/', {
    redirect: 'follow', 
    headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept-Language': 'en-US,en;q=0.9',
    }
}).then(r => r.text()).then(t => {
    const ogUrlMatch = t.match(/<meta property="og:url" content="([^"]+)"/i);
    console.log('Length:', t.length);
    console.log('OGUrl:', ogUrlMatch ? ogUrlMatch[1] : 'NONE');
});
