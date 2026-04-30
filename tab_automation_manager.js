// ============================================================
// tab_automation_manager.js
// নতুন ট্যাব ওপেন/ক্লোজ ফিচার ম্যানেজার
// 
// এই মডিউল ম্যানেজ করে:
//   - ইউজার toggle ON করলে → প্রতি batch-এ নতুন ট্যাব ওপেন
//   - ঐ ট্যাবে automation শেষ হলে → ট্যাব ক্লোজ
//   - পরবর্তী batch-এ আবার নতুন ট্যাব → কাজ → ক্লোজ
//   - toggle OFF থাকলে → কিছুই করবে না, আগের মতো চলবে
// ============================================================

window.TabAutomationManager = (() => {
    // বর্তমান ম্যানেজড ট্যাবের ID (null = কোনো ট্যাব নেই)
    let _managedTabId = null;

    /**
     * isEnabled — storage থেকে tabAutoMode পড়ে ON/OFF রিটার্ন করে
     * @param {function} callback — callback(boolean)
     */
    function isEnabled(callback) {
        chrome.storage.local.get(['tabAutoMode'], (res) => {
            callback(res.tabAutoMode === true);
        });
    }

    /**
     * setEnabled — storage-এ tabAutoMode সেট করে
     * @param {boolean} val
     * @param {function} [callback]
     */
    function setEnabled(val, callback) {
        chrome.storage.local.set({ tabAutoMode: !!val }, () => {
            console.log(`🔄 [TAB-MODE] New Tab Mode ${val ? 'ON ✅' : 'OFF ❌'}`);
            if (callback) callback();
        });
    }

    /**
     * openTab — নতুন ট্যাব তৈরি করে এবং ট্যাব ID সেভ করে
     * @param {string} url — যেই URL-এ নেভিগেট করবে
     * @param {function} callback — callback(tabId)
     */
    function openTab(url, callback) {
        // আগের ম্যানেজড ট্যাব থাকলে আগে ক্লোজ করো
        if (_managedTabId !== null) {
            console.log(`🔄 [TAB-MODE] আগের ট্যাব ${_managedTabId} ক্লোজ করা হচ্ছে...`);
            chrome.tabs.remove(_managedTabId, () => {
                if (chrome.runtime.lastError) {
                    // ট্যাব হয়তো আগেই ক্লোজ হয়ে গেছে — ignore
                }
                _createNewTab(url, callback);
            });
        } else {
            _createNewTab(url, callback);
        }
    }

    /**
     * _createNewTab — অভ্যন্তরীণ হেল্পার, নতুন ট্যাব তৈরি করে
     */
    function _createNewTab(url, callback) {
        chrome.tabs.create({ url: url, active: true }, (tab) => {
            _managedTabId = tab.id;
            console.log(`🆕 [TAB-MODE] নতুন ট্যাব তৈরি হয়েছে: ID=${tab.id}, URL=${url}`);

            // ট্যাবের window ফোকাস করো
            if (tab.windowId) {
                chrome.windows.update(tab.windowId, { focused: true, drawAttention: true }, () => {
                    if (chrome.runtime.lastError) {}
                });
            }

            if (callback) callback(tab.id);
        });
    }

    /**
     * closeTab — বর্তমান ম্যানেজড ট্যাব ক্লোজ করে
     * @param {function} [callback]
     */
    function closeTab(callback) {
        if (_managedTabId === null) {
            console.log('🔄 [TAB-MODE] কোনো ম্যানেজড ট্যাব নেই। ক্লোজ করার কিছু নেই।');
            if (callback) callback();
            return;
        }

        const tabIdToClose = _managedTabId;
        _managedTabId = null;

        chrome.tabs.remove(tabIdToClose, () => {
            if (chrome.runtime.lastError) {
                console.warn(`⚠️ [TAB-MODE] ট্যাব ${tabIdToClose} ক্লোজ করা যায়নি (সম্ভবত আগেই ক্লোজ):`, chrome.runtime.lastError.message);
            } else {
                console.log(`🗑️ [TAB-MODE] ট্যাব ${tabIdToClose} সফলভাবে ক্লোজ হয়েছে।`);
            }
            if (callback) callback();
        });
    }

    /**
     * getActiveTabId — বর্তমান ম্যানেজড ট্যাবের ID
     * @returns {number|null}
     */
    function getActiveTabId() {
        return _managedTabId;
    }

    /**
     * reset — সব ক্লিনআপ (স্টপ/ডিঅ্যাক্টিভেট করলে)
     * @param {function} [callback]
     */
    function reset(callback) {
        if (_managedTabId !== null) {
            closeTab(() => {
                console.log('🔄 [TAB-MODE] ম্যানেজার রিসেট হয়েছে।');
                if (callback) callback();
            });
        } else {
            console.log('🔄 [TAB-MODE] ম্যানেজার রিসেট — কোনো active ট্যাব ছিল না।');
            if (callback) callback();
        }
    }

    // ── ট্যাব ক্লোজ ডিটেকশন ──────────────────────────────────
    // ইউজার যদি ম্যানুয়ালি ট্যাব ক্লোজ করে, তাহলে _managedTabId রিসেট করো
    chrome.tabs.onRemoved.addListener((tabId) => {
        if (tabId === _managedTabId) {
            console.log(`🔔 [TAB-MODE] ম্যানেজড ট্যাব ${tabId} বাইরে থেকে ক্লোজ হয়েছে।`);
            _managedTabId = null;
        }
    });

    // Public API
    return {
        isEnabled,
        setEnabled,
        openTab,
        closeTab,
        getActiveTabId,
        reset
    };
})();
