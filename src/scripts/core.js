"use strict";

window.appGlobal = {
    FlowReaderApiClient: new FlowReaderApiClient(),
    feedTab: null,
    icons: {
        default: "/images/icon.png",
        inactive: "/images/icon_inactive.png",
        defaultBig: "/images/icon128.png"
    },
    options: {
        _updateInterval: 5, //minutes
        _popupWidth: 380,
        _expandedPopupWidth: 650,

        markReadOnClick: true,
        accessToken: "",
        refreshToken: "",
        showDesktopNotifications: true,
        hideNotificationDelay: 10, //seconds
        showFullFeedContent: false,
        maxNotificationsCount: 5,
        openSiteOnIconClick: false,
        FlowReaderUserId: "",
        SiteUri: "flow.local",
        abilitySaveFeeds: true,
        maxNumberOfFeeds: 20,
        forceUpdateFeeds: false,
        useSecureConnection: false,
        timeoutMillis: 7000,
        expandFeeds: false,
        openFeedsInSameTab: false,
        openFeedsInBackground: true,
        showCounter: true,
        playSound: false,
        oldestFeedsFirst: false,
        popupFontSize: 100, //percent

        get updateInterval(){
            var minimumInterval = 5;
            return this._updateInterval >= minimumInterval ? this._updateInterval : minimumInterval;
        },
        set updateInterval(value) {
            return this._updateInterval = value;
        },
        get popupWidth() {
            var maxValue = 750;
            var minValue = 380;
            if (this._popupWidth > maxValue ) {
                return maxValue;
            }
            if (this._popupWidth < minValue){
                return minValue;
            }
            return this._popupWidth;
        },
        set popupWidth(value) {
            this._popupWidth = value;
        },
        get expandedPopupWidth() {
            var maxValue = 750;
            var minValue = 380;
            if (this._expandedPopupWidth > maxValue ) {
                return maxValue;
            }
            if (this._expandedPopupWidth < minValue){
                return minValue;
            }
            return this._expandedPopupWidth;
        },
        set expandedPopupWidth(value) {
            this._expandedPopupWidth = value;
        }
    },
    //Names of options after changes of which scheduler will be initialized
    criticalOptionNames: ["updateInterval", "accessToken", "showFullFeedContent", "openSiteOnIconClick", "maxNumberOfFeeds", "abilitySaveFeeds", "showCounter", "oldestFeedsFirst", "resetCounterOnClick"],
    cachedFeeds: [],
    cachedSavedFeeds: [],
    isLoggedIn: false,
    intervalIds: [],
    clientId: "",
    clientSecret: "",
    tokenIsRefreshing: false,
    get flowReaderUrl() {
        return appGlobal.options.useSecureConnection ? "https://flow.local" : "http://flow.local" //TODO: move to flowreader.com
    }
};

// #Event handlers
chrome.runtime.onInstalled.addListener(function (details) {
    //Trying read old options (mostly access token) if possible
    readOptions(function () {
        //Write all options in chrome storage and initialize application
        writeOptions(initialize);
    });
});

chrome.storage.onChanged.addListener(function (changes, areaName) {
    var callback;

    for (var optionName in changes) {
        if (appGlobal.criticalOptionNames.indexOf(optionName) !== -1) {
            callback = initialize;
            break;
        }
    }
    readOptions(callback);
});

chrome.tabs.onRemoved.addListener(function(tabId){
    if (appGlobal.feedTab && appGlobal.feedTab.id == tabId) {
        appGlobal.feedTab = null;
    }
});

chrome.runtime.onStartup.addListener(function () {
    readOptions(initialize);
});

/* Listener for adding or removing feeds on the FlowReader website */
chrome.webRequest.onCompleted.addListener(function (details) {
    if (details.method === "POST") {
        //updateCounter(); TODO: Replace with removing from cache for perfomance
        //updateFeeds(); TODO: Replace with removing from cache for perfomance
    } // replace with out api
}, {urls: ["*://flow.local/api/items/read"]}); //TODO: Replace with flowreader.com

chrome.browserAction.onClicked.addListener(function () {
    if (appGlobal.isLoggedIn) {
        openFlowReaderTab();
        if(appGlobal.options.resetCounterOnClick){
            resetCounter();
        }
    } else {
        getAccessToken();
    }
});

/* Initialization all parameters and run feeds check */
function initialize() {
    if (appGlobal.options.openSiteOnIconClick) {
        chrome.browserAction.setPopup({popup: ""});
    } else {
        chrome.browserAction.setPopup({popup: "popup.html"});
    }
    appGlobal.FlowReaderApiClient.accessToken = appGlobal.options.accessToken;

    startSchedule(appGlobal.options.updateInterval);
}

function startSchedule(updateInterval) {
    stopSchedule();
    updateCounter();
    updateFeeds();
    if(appGlobal.options.showCounter){
        appGlobal.intervalIds.push(setInterval(updateCounter, updateInterval * 60000));
    }
    if (appGlobal.options.showDesktopNotifications || appGlobal.options.playSound || !appGlobal.options.openSiteOnIconClick) {
        appGlobal.intervalIds.push(setInterval(updateFeeds, updateInterval * 60000));
    }
}

function stopSchedule() {
    appGlobal.intervalIds.forEach(function(intervalId){
        clearInterval(intervalId);
    });
    appGlobal.intervalIds = [];
}

/* Sends desktop notifications */
function sendDesktopNotification(feeds) {
    var notifications = [];
    //if notifications too many, then to show only count
    if (feeds.length > appGlobal.options.maxNotificationsCount) {
        //We can detect only limit count of new feeds at time, but actually count of feeds may be more
        var count = feeds.length === appGlobal.options.maxNumberOfFeeds ? chrome.i18n.getMessage("many") : feeds.length.toString();
        var notification = new Notification(chrome.i18n.getMessage("NewFeeds"), {
                body: chrome.i18n.getMessage("YouHaveNewFeeds", count),
                icon: appGlobal.icons.defaultBig
            });
        notifications.push(notification);
    } else {
        for (var i = 0; i < feeds.length; i++) {
            notification = new Notification(feeds[i].blog,{
                body: feeds[i].title,
                icon: feeds[i].blogIcon
            });

            //Open new tab on click and close notification
            notification.url = feeds[i].url;
            notification.feedId = feeds[i].id;
            notification.onclick = function (e) {
                var target = e.target;
                target.close();
                openUrlInNewTab(target.url, true);
                if (appGlobal.options.markReadOnClick) {
                    markAsRead([target.feedId]);
                }
            };
            notifications.push(notification);
        }
    }

    //Hide notifications after delay
    if (appGlobal.options.hideNotificationDelay > 0) {
        setTimeout(function () {
            for (i = 0; i < notifications.length; i++) {
                notifications[i].close();
            }
        }, appGlobal.options.hideNotificationDelay * 1000);
    }
}

/* Opens new tab, if tab is being opened when no active window (i.e. background mode)
 * then creates new window and adds tab in the end of it
 * url for open
 * active when is true, then tab will be active */
function openUrlInNewTab(url, active) {
    chrome.windows.getAll({}, function (windows) {
        if (windows.length < 1) {
            chrome.windows.create({focused: true}, function (window) {
                chrome.tabs.create({url: url, active: active }, function (feedTab) {
                });
            });
        } else {
            chrome.tabs.create({url: url, active: active }, function (feedTab) {
            });
        }
    });
}

/* Opens new FlowReader tab, if tab was already opened, then switches on it and reload. */
function openFlowReaderTab() {
    chrome.tabs.query({url: appGlobal.flowReaderUrl + "/*"}, function (tabs) {
        if (tabs.length < 1) {
            chrome.tabs.create({url: appGlobal.flowReaderUrl});
        } else {
            chrome.tabs.update(tabs[0].id, {active: true});
            chrome.tabs.reload(tabs[0].id);
        }
    });
}

/* Removes feeds from cache by feed ID */
function removeFeedFromCache(feedId) {
    var indexFeedForRemove;
    for (var i = 0; i < appGlobal.cachedFeeds.length; i++) {
        if (appGlobal.cachedFeeds[i].id === feedId) {
            indexFeedForRemove = i;
            break;
        }
    }

    //Remove feed from cached feeds
    if (indexFeedForRemove !== undefined) {
        appGlobal.cachedFeeds.splice(indexFeedForRemove, 1);
    }
}

/* Plays alert sound */
function playSound(){
    var audio = new Audio("sound/alert.mp3");
    audio.play();
}

/* Returns only new feeds and set date of last feed
 * The callback parameter should specify a function that looks like this:
 * function(object newFeeds) {...};*/
function filterByNewFeeds(feeds, callback) {
    chrome.storage.local.get("lastFeedTime", function (options) {
        var lastFeedTime;

        if (options.lastFeedTime) {
            lastFeedTime = Math.round((new Date()).getTime() / 1000);
        } else {
            lastFeedTime = 0;
        }

        var newFeeds = [];
        var maxFeedTime = lastFeedTime;
        for (var i = 0; i < feeds.length; i++) {
            if (feeds[i].unixTime > lastFeedTime) {
                newFeeds.push(feeds[i]);
                if (feeds[i].unixTime > maxFeedTime) {
                    maxFeedTime = feeds[i].unixTime;
                }
            }
        }

        chrome.storage.local.set({ lastFeedTime: maxFeedTime }, function () {
            if (typeof callback === "function") {
                callback(newFeeds);
            }
        });
    });
}

function resetCounter(){
    setBadgeCounter(0);
    chrome.storage.local.set({ lastCounterResetTime: new Date().getTime() });
}

function setBadgeCounter(unreadFeedsCount) {
    if (appGlobal.options.showCounter) {
        if (unreadFeedsCount > 999) {
            chrome.browserAction.setBadgeText({text: "999+"});
        } else {
            chrome.browserAction.setBadgeText({text: String(+unreadFeedsCount > 0 ? unreadFeedsCount : "")});
        }
    } else {
        chrome.browserAction.setBadgeText({ text: ""});
    }
}

/* Runs feeds update and stores unread feeds in cache
 * Callback will be started after function complete
 * */
function updateCounter(callback) {
    apiRequestWrapper("items/count", {
        timeout: appGlobal.options.timeoutMillis,
        parameters: null,
        verb: 'POST',
        body: {
            filters: [
                {
                    fieldName: 'read',
                    operator: '==',
                    value: false
                },
                {
                    fieldName: 'type',
                    operator: '==',
                    value: 'rss'
                }
            ]
        },
        onSuccess: function (response) {
            setBadgeCounter(response.data);
            chrome.storage.local.set(
                {
                    lastCounterResetTime: new Date(0).getTime()
                }
            );

            if (typeof callback === "function") {
                callback(true);
            }
        }
    });
}

/* Update saved feeds and stores its in cache */
function updateSavedFeeds(callback) {
    apiRequestWrapper("items", {
        timeout: appGlobal.options.timeoutMillis, // Prevent infinite loading
        parameters: null,
        verb: 'POST',
        body: {
            filters: [
                {
                    fieldName: 'favorite',
                    operator: '==',
                    value: true
                },
                {
                    fieldName: 'type',
                    operator: '==',
                    value: 'rss'
                }
            ]
        },
        onSuccess: function (response) {
            appGlobal.cachedSavedFeeds = parseFeeds(response);
            if (typeof callback === "function") {
                callback();
            }
        }
    });
}

/* Runs feeds update and stores unread feeds in cache
 * Callback will be started after function complete
 * If silentUpdate is true, then notifications will not be shown
 *  */
function updateFeeds(callback, silentUpdate){
    if (typeof(silentUpdate) !== "boolean")
        silentUpdate = false;
    apiRequestWrapper("items", {
        timeout: appGlobal.options.timeoutMillis, // Prevent infinite loading
        parameters: null,
        verb: 'POST',
        body: {
            filters: [
                {
                    fieldName: 'read',
                    operator: '==',
                    value: false
                },
                {
                    fieldName: 'type',
                    operator: '==',
                    value: 'rss'
                }
            ]
        },
        onSuccess: function (response) {
            if (response.exitCode != 1) {
                if (response.exitCode == 404) {
                    appGlobal.cachedFeeds = [];
                }
                return;
            }

            appGlobal.cachedFeeds = appGlobal.cachedFeeds.concat(parseFeeds(response));
            // Remove duplicates
            appGlobal.cachedFeeds = appGlobal.cachedFeeds.filter(function(value, index, feeds){
                for(var i = ++index; i < feeds.length; i++){
                    if(feeds[i].id == value.id){
                        return false;
                    }
                }
                return true;
            });

            appGlobal.cachedFeeds = appGlobal.cachedFeeds.sort(function (a, b) {
                if (a.unixTime > b.unixTime) {
                    return appGlobal.options.oldestFeedsFirst ? 1 : -1;
                } else if (a.unixTime < b.unixTime) {
                    return appGlobal.options.oldestFeedsFirst ? -1 : 1;
                }
                return 0;
            });

            appGlobal.cachedFeeds = appGlobal.cachedFeeds.splice(0, appGlobal.options.maxNumberOfFeeds);
            if (!silentUpdate
                && (appGlobal.options.showDesktopNotifications || appGlobal.options.playSound)) {

                filterByNewFeeds(appGlobal.cachedFeeds, function (newFeeds) {
                    if (appGlobal.options.showDesktopNotifications) {
                        sendDesktopNotification(newFeeds);
                    }
                    if (appGlobal.options.playSound && newFeeds.length > 0) {
                        playSound();
                    }
                });
            }

            if (typeof callback === "function") {
                callback(true);
            }
        }
    });
}

/* Stops scheduler, sets badge as inactive and resets counter */
function setInactiveStatus() {
    chrome.browserAction.setIcon({ path: appGlobal.icons.inactive }, function () {
    });
    chrome.browserAction.setBadgeText({ text: ""});
    appGlobal.cachedFeeds = [];
    appGlobal.isLoggedIn = false;
    appGlobal.options.FlowReaderUserId = "";
    stopSchedule();
}

/* Sets badge as active */
function setActiveStatus() {
    chrome.browserAction.setIcon({ path: appGlobal.icons.default }, function () {
    });
    appGlobal.isLoggedIn = true;
}

/* Converts FlowReader response to feeds */
function parseFeeds(response) {
    var feeds = response.data.map(function (item) {
        return {
            title: item.contentData.body.title,
            url: item.contentData.link,
            blog: item.contentData.user.userName,
            blogUrl: item.metaData.externalNetUrl,
            blogIcon: item.contentData.user.faviconUrl,
            id: item.metaData.id,
            content: item.contentData.body.text,
            isoDate: item.contentData.publishedAt.time,
            unixTime: item.contentData.publishedAt.timestamp,
            isSaved: item.metaData.favorite
        };
    });
    return feeds;
}

/* Returns feeds from the cache.
 * If the cache is empty, then it will be updated before return
 * forceUpdate, when is true, then cache will be updated
 */
function getFeeds(forceUpdate, callback) {
    if (appGlobal.cachedFeeds.length > 0 && !forceUpdate) {
        callback(appGlobal.cachedFeeds.slice(0), appGlobal.isLoggedIn);
    } else {
        updateFeeds(function () {
            callback(appGlobal.cachedFeeds.slice(0), appGlobal.isLoggedIn);
        }, true);
        updateCounter();
    }
}

/* Returns saved feeds from the cache.
 * If the cache is empty, then it will be updated before return
 * forceUpdate, when is true, then cache will be updated
 */
function getSavedFeeds(forceUpdate, callback) {
    if (appGlobal.cachedSavedFeeds.length > 0 && !forceUpdate) {
        callback(appGlobal.cachedSavedFeeds.slice(0), appGlobal.isLoggedIn);
    } else {
        updateSavedFeeds(function () {
            callback(appGlobal.cachedSavedFeeds.slice(0), appGlobal.isLoggedIn);
        }, true);
    }
}

/* Marks feed as read, remove it from the cache and decrement badge.
 * array of the ID of feeds
 * The callback parameter should specify a function that looks like this:
 * function(boolean isLoggedIn) {...};*/
function markAsRead(id, callback) {
    apiRequestWrapper("items/read", {
        timeout: appGlobal.options.timeoutMillis, // Prevent infinite loading
        parameters: null,
        verb: 'POST',
        body: {
            ids: [
                id
            ],
            read: true
        },
        onSuccess: function (result) {
            removeFeedFromCache(id);
            chrome.browserAction.getBadgeText({}, function (feedsCount) {
                if (feedsCount > 0) {
                    feedsCount--;
                    setBadgeCounter(feedsCount);
                }
            });
            if (typeof callback === "function") {
                callback(true);
            }
        }
    });
}

function markAllAsRead(callback) {
    apiRequestWrapper("items/all/read", {
        timeout: appGlobal.options.timeoutMillis,
        parameters: null,
        verb: 'POST',
        body: {
            filters: [
                {
                    fieldName: 'type',
                    operator: '==',
                    value: 'rss'
                }
            ]
        },
        onSuccess: function() {
            if (typeof callback === "function") {
                callback(true);
            }
        }
    });
}

/* Save feed or unsave it.
 * feed ID
 * if saveFeed is true, then save feed, else unsafe it
 * The callback parameter should specify a function that looks like this:
 * function(boolean isLoggedIn) {...};*/
function toggleSavedFeed(id, saveFeed, callback) {
    apiRequestWrapper("items/favorite/" + id, {
        onSuccess: function (response) {
            if (typeof callback === "function") {
                callback(true);
            }
        },
        onAuthorizationRequired: function () {
            if (typeof callback === "function") {
                callback(false);
            }
        }
    });

    //Update state in the cache
    for (var i = 0; i < appGlobal.cachedFeeds.length; i++) {
        if (appGlobal.cachedFeeds[i].id === id) {
            appGlobal.cachedFeeds[i].isSaved = saveFeed;
            break;
        }
    }
}

/* Writes all application options in chrome storage and runs callback after it */
function writeOptions(callback) {
    var options = {};
    for (var option in appGlobal.options) {
        options[option] = appGlobal.options[option];
    }
    chrome.storage.sync.set(options, function () {
        if (typeof callback === "function") {
            callback();
        }
    });
}

/* Reads all options from chrome storage and runs callback after it */
function readOptions(callback) {
    chrome.storage.sync.get(null, function (options) {
        for (var optionName in options) {
            if (typeof appGlobal.options[optionName] === "boolean") {
                appGlobal.options[optionName] = Boolean(options[optionName]);
            } else if (typeof appGlobal.options[optionName] === "number") {
                appGlobal.options[optionName] = Number(options[optionName]);
            } else {
                appGlobal.options[optionName] = options[optionName];
            }
        }
        if (typeof callback === "function") {
            callback();
        }
    });
}

function apiRequestWrapper(methodName, settings) {
    var onSuccess = settings.onSuccess;
    settings.onSuccess = function (response) {
        setActiveStatus();
        if (typeof onSuccess === "function") {
            onSuccess(response);
        }
    };

    settings.onAuthorizationRequired = function (accessToken) {
        openFlowReaderTab();
    };

    appGlobal.FlowReaderApiClient.request(methodName, settings);
}