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
        return appGlobal.options.useSecureConnection ? "https://flow.local" : "http://flow.local" //TODO: FIX AND ADD (S) BACK
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
    console.log(details);
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
    chrome.storage.local.get("lastFeedTimeTicks", function (options) {
        var lastFeedTime;

        if (options.lastFeedTimeTicks) {
            lastFeedTime = new Date(options.lastFeedTimeTicks);
        } else {
            lastFeedTime = new Date(1971, 0, 1);
        }

        var newFeeds = [];
        var maxFeedTime = lastFeedTime;

        for (var i = 0; i < feeds.length; i++) {
            if (feeds[i].date > lastFeedTime) {
                newFeeds.push(feeds[i]);
                if (feeds[i].date > maxFeedTime) {
                    maxFeedTime = feeds[i].date;
                }
            }
        }

        chrome.storage.local.set({ lastFeedTimeTicks: maxFeedTime.getTime() }, function () {
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

/* Update saved feeds and stores its in cache */
function updateSavedFeeds(callback) {
    apiRequestWrapper("streams/" + encodeURIComponent(appGlobal.savedGroup) + "/contents", {
        onSuccess: function (response) {
            appGlobal.cachedSavedFeeds = parseFeeds(response);
            if (typeof callback === "function") {
                callback();
            }
        }
    });
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
function updateCounter() {
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
        }
    });
}

/* Runs feeds update and stores unread feeds in cache
 * Callback will be started after function complete
 * If silentUpdate is true, then notifications will not be shown
 *  */
function updateFeeds(callback, silentUpdate){
    apiRequestWrapper("items", {
        timeout: appGlobal.options.timeoutMillis, // Prevent infinite loading
        parameters: null,
        verb: 'POST',
        body: {
            filters: [
                {
                    fieldName: 'read',
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
            if (response.exitCode != 1) {
                if (response.exitCode == 404) {
                    appGlobal.cachedFeeds = [];
                }

                return;
            }

            var feeds = parseFeeds(response);
            appGlobal.cachedFeeds = feeds;
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
            date: item.contentData.publishedAt.timestamp,
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

/* Marks feed as read, remove it from the cache and decrement badge.
 * array of the ID of feeds
 * The callback parameter should specify a function that looks like this:
 * function(boolean isLoggedIn) {...};*/
function markAsRead(id) {
    apiRequestWrapper("items/read", {
        timeout: appGlobal.options.timeoutMillis, // Prevent infinite loading
        parameters: null,
        verb: 'POST',
        body: {
            ids: [
                id
            ]
        },
        onSuccess: function () {
            removeFeedFromCache(id);
            chrome.browserAction.getBadgeText({}, function (feedsCount) {
                if (feedsCount > 0) {
                    feedsCount--;
                    setBadgeCounter(feedsCount);
                }
            });
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

/* Runs authenticating a user process,
 * then read access token and stores in chrome.storage */
function getAccessToken() {
    var state = (new Date()).getTime();
    var url = appGlobal.FlowReaderApiClient.getMethodUrl("auth/auth", {
        response_type: "code",
        client_id: appGlobal.clientId,
        redirect_uri: "http://localhost",
        scope: "https://" + this.options.SiteUri + "/subscriptions",
        state: state
    }, appGlobal.options.useSecureConnection);

    chrome.tabs.create({url: url}, function (authorizationTab) {
        chrome.tabs.onUpdated.addListener(function processCode(tabId, information, tab) {

            var checkStateRegex = new RegExp("state=" + state);
            if (!checkStateRegex.test(information.url)) {
                return;
            }

            var codeParse = /code=(.+?)(?:&|$)/i;
            var matches = codeParse.exec(information.url);
            if (matches) {
                appGlobal.FlowReaderApiClient.request("auth/token", {
                    method: "POST",
                    useSecureConnection: appGlobal.options.useSecureConnection,
                    parameters: {
                        code: matches[1],
                        client_id: appGlobal.clientId,
                        client_secret: appGlobal.clientSecret,
                        redirect_uri: "http://localhost",
                        grant_type: "authorization_code"
                    },
                    onSuccess: function (response) {
                        chrome.storage.sync.set({
                            accessToken: response.access_token,
                            refreshToken: response.refresh_token,
                            FlowReaderUserId: response.id
                        }, function () {
                        });
                        chrome.tabs.onUpdated.removeListener(processCode);
                        chrome.tabs.update(authorizationTab.id, {url: chrome.extension.getURL("options.html")});
                    }
                });
            }
        });
    });
}

/* Tries refresh access token if possible */
function refreshAccessToken(){
    if(!appGlobal.options.refreshToken) return;

    appGlobal.FlowReaderApiClient.request("auth/token", {
        method: "POST",
        useSecureConnection: appGlobal.options.useSecureConnection,
        parameters: {
            refresh_token: appGlobal.options.refreshToken,
            client_id: appGlobal.clientId,
            client_secret: appGlobal.clientSecret,
            grant_type: "refresh_token"
        },
        onSuccess: function (response) {
            chrome.storage.sync.set({
                accessToken: response.access_token,
                FlowReaderUserId: response.id
            }, function () {});
        },
        onComplete: function(){
            appGlobal.tokenIsRefreshing = false;
        }
    });
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

    var onAuthorizationRequired = settings.onAuthorizationRequired;

    settings.onAuthorizationRequired = function (accessToken) {
        if (appGlobal.isLoggedIn) {
            setInactiveStatus();
        }
        if (!appGlobal.tokenIsRefreshing){
            appGlobal.tokenIsRefreshing = true;
            refreshAccessToken();
        }
        if (typeof onAuthorizationRequired === "function") {
            onAuthorizationRequired(accessToken);
        }
    };

    appGlobal.FlowReaderApiClient.request(methodName, settings);
}