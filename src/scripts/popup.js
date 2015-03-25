"use strict";

var popupGlobal = {
    //Determines lists of supported jQuery.timeago localizations, default localization is en
    supportedTimeAgoLocales: ["ru", "fr", "pt-BR", "it", "cs"],
    feeds: [],
    savedFeeds: [],
    /**
     * core.js
     */
    backgroundPage: chrome.extension.getBackgroundPage()
};

$(document).ready(function () {
    $("#feed, #feed-saved").css("font-size", popupGlobal.backgroundPage.appGlobal.options.popupFontSize / 100 + "em");
    $("#website").text(chrome.i18n.getMessage("FlowReaderWebsite"));
    $("#mark-all-read>span").text(chrome.i18n.getMessage("MarkAllAsRead"));
    $("#update-feeds>span").text(chrome.i18n.getMessage("UpdateFeeds"));
    $("#open-all-news>span").text(chrome.i18n.getMessage("OpenAllFeeds"));

    if (popupGlobal.backgroundPage.appGlobal.options.abilitySaveFeeds) {
        $("#popup-content").addClass("tabs");
    }

    setPopupExpand(false);

    //If we support this localization of timeago, then insert script with it
    if (popupGlobal.supportedTimeAgoLocales.indexOf(window.navigator.language) !== -1) {
        //Trying load localization for jQuery.timeago
        $.getScript("/scripts/timeago/locales/jquery.timeago." + window.navigator.language + ".js", function () {
            renderFeeds();
        });
    } else {
        renderFeeds();
    }
});

//using "mousedown" instead of "click" event to process middle button click.
$("#feed, #feed-saved").on("mousedown", "a", function (event) {
    var link = $(this);
    if (event.which === 1 || event.which === 2) {
        var isActiveTab = !(event.ctrlKey || event.which === 2) && !popupGlobal.backgroundPage.appGlobal.options.openFeedsInBackground;
        var isFeed = link.hasClass("title") && $("#feed").is(":visible");
        var url = link.data("link");

        if (isFeed && popupGlobal.backgroundPage.appGlobal.feedTab && popupGlobal.backgroundPage.appGlobal.options.openFeedsInSameTab) {
            chrome.tabs.update(popupGlobal.backgroundPage.appGlobal.feedTab.id,{url: url}, function(tab) {
                onOpenCallback(isFeed, tab);
            })
        } else {
            chrome.tabs.create({url: url, active: isActiveTab }, function(tab) {
                onOpenCallback(isFeed, tab);
            });
        }
    }

    function onOpenCallback(isFeed, tab) {
        if (isFeed) {
            popupGlobal.backgroundPage.appGlobal.feedTab = tab;

            if (popupGlobal.backgroundPage.appGlobal.options.markReadOnClick) {
                markAsRead(link.closest(".item").data("id"));
            }
        }
    }
});

$("#popup-content").on("click", "#mark-all-read", markAllAsRead);

$("#popup-content").on("click", "#open-all-news", function () {
    $("#feed").find("a.title[data-link]").filter(":visible").each(function (key, value) {
        var news = $(value);
        chrome.tabs.create({url: news.data("link"), active: false }, function () {});
    });
    if (popupGlobal.backgroundPage.appGlobal.options.markReadOnClick) {
        markAllAsRead();
    }
});

$("#feed").on("click", ".mark-read", function (event) {
    var feed = $(this).closest(".item");
    markAsRead(feed.data("id"));
});

$("#FlowReader").on("click", "#btn-feeds-saved", function () {
    $(this).addClass("active-tab");
    $("#btn-feeds").removeClass("active-tab");
    renderSavedFeeds(false);
});

$("#FlowReader").on("click", "#btn-feeds", function () {
    $(this).addClass("active-tab");
    $("#btn-feeds-saved").removeClass("active-tab");
    renderFeeds(false);
});

$("#popup-content").on("click", ".show-content", function () {
    var $this = $(this);
    var feed = $this.closest(".item");
    var contentContainer = feed.find(".content");
    var feedId = feed.data("id");
    if (contentContainer.html() === "") {
        var feeds = $("#feed").is(":visible") ? popupGlobal.feeds : popupGlobal.savedFeeds;

        for (var i = 0; i < feeds.length; i++) {
            if (feeds[i].id === feedId) {
                contentContainer.html($("#feed-content").mustache(feeds[i]));

                //For open new tab without closing popup
                contentContainer.find("a").each(function (key, value) {
                    var link = $(value);
                    link.data("link", link.attr("href"));
                    link.attr("href", "javascript:void(0)");
                });
            }
        }
    }
    contentContainer.slideToggle("fast", function () {
        $this.css("background-position", contentContainer.is(":visible") ? "-288px -120px" : "-313px -119px");
        if ($(".content").is(":visible")) {
            setPopupExpand(true);
        } else {
            setPopupExpand(false);
        }
    });
});

/* Manually feeds update */
$("#FlowReader").on("click", "#update-feeds", function () {
    if ($("#feed").is(":visible")) {
        renderFeeds(true);
    } else {
        renderSavedFeeds(true);
    }
});

/* Save or unsave feed */
$("#popup-content").on("click", ".save-feed", function () {
    var $this = $(this);
    var feed = $this.closest(".item");
    var feedId = feed.data("id");
    var saveItem = !$this.data("saved");
    popupGlobal.backgroundPage.toggleSavedFeed(feedId, saveItem);
    $this.data("saved", saveItem);
    $this.toggleClass("saved");
});

$("#popup-content").on("click", "#website", function(){
    popupGlobal.backgroundPage.openFlowReaderTab();
});

$("#FlowReader").on("click", "#FlowReader-logo", function (event) {
    if (event.ctrlKey) {
        popupGlobal.backgroundPage.appGlobal.options.abilitySaveFeeds = !popupGlobal.backgroundPage.appGlobal.options.abilitySaveFeeds;
        location.reload();
    }
});

function renderFeeds(forceUpdate) {
    showLoader();
    popupGlobal.backgroundPage.getFeeds(forceUpdate, function (feeds, isLoggedIn) {
        popupGlobal.feeds = feeds;
        if (isLoggedIn === false) {
            popupGlobal.backgroundPage.onAuthorizationRequired();
        } else {
            if (feeds.length === 0) {
                showEmptyContent();
            } else {
                var container = $("#feed").show().empty();

                if (popupGlobal.backgroundPage.appGlobal.options.expandFeeds) {
                    var partials = { content: $("#feed-content").html() };
                }

                container.append($("#feedTemplate").mustache({feeds: feeds}, partials));
                container.find(".timeago").timeago();

                if (popupGlobal.backgroundPage.appGlobal.options.expandFeeds) {
                    container.find(".show-content").click();
                }

                showFeeds();
            }
        }
    });
}

function renderSavedFeeds(forceUpdate) {
    showLoader();
    popupGlobal.backgroundPage.getSavedFeeds(forceUpdate, function (feeds, isLoggedIn) {
        popupGlobal.savedFeeds = feeds;
        if (isLoggedIn === false) {
            popupGlobal.backgroundPage.onAuthorizationRequired();
        } else {
            if (feeds.length === 0) {
                showEmptyContent();
            } else {
                var container = $("#feed-saved").empty();

                if (popupGlobal.backgroundPage.appGlobal.options.expandFeeds) {
                    var partials = { content: $("#feed-content").html() };
                }

                container.append($("#feedTemplate").mustache({feeds: feeds}, partials));
                container.find(".timeago").timeago();

                if (popupGlobal.backgroundPage.appGlobal.options.expandFeeds) {
                    container.find(".show-content").click();
                }

                showSavedFeeds();
            }
        }
    });
}

function markAsRead(feedId) {
    var feedItems = $();
    feedItems = feedItems.add(".item[data-id='" + feedId+ "']");

    feedItems.fadeOut("fast", function(){
        $(this).remove();
    });

    feedItems.attr("data-is-read", "true");

    //Show loader if all feeds were read
    if ($("#feed").find(".item[data-is-read!='true']").size() === 0) {
        showLoader();
    }
    chrome.extension.getBackgroundPage().markAsRead(feedId, function () {
        if ($("#feed").find(".item[data-is-read!='true']").size() === 0) {
            renderFeeds();
        }
    });
}

function markAllAsRead() {
    var feedItems = $();
    feedItems.fadeOut("fast", function(){
        $(this).remove();
    });
    chrome.extension.getBackgroundPage().markAllAsRead(function () {
        renderFeeds();
    });
}

function showLoader() {
    $("body").children("div").hide();
    $("#loading").show();
}

function showEmptyContent() {
    $("body").children("div").hide();
    $("#popup-content").show().children("div").hide().filter("#feed-empty").text(chrome.i18n.getMessage("NoUnreadArticles")).show();
    $("#FlowReader").show().find("#popup-actions").hide();
}

function showFeeds() {
    if (popupGlobal.backgroundPage.appGlobal.options.resetCounterOnClick) {
        popupGlobal.backgroundPage.resetCounter();
    }
    $("body").children("div").hide();
    $("#popup-content").show().children("div").hide().filter("#feed").show();
    $("#FlowReader").show().find("#popup-actions").show()   .children().show();
    $(".mark-read").attr("title", chrome.i18n.getMessage("MarkAsRead"));
    $(".show-content").attr("title", chrome.i18n.getMessage("More"));
}

function showSavedFeeds() {
    $("body").children("div").hide();
    $("#popup-content").show().children("div").hide().filter("#feed-saved").show().find(".mark-read").hide();
    $("#feed-saved").find(".show-content").attr("title", chrome.i18n.getMessage("More"));
    $("#FlowReader").show().find("#popup-actions").show().children().hide().filter(".icon-refresh").show();
}

function setPopupExpand(isExpand){
    if (isExpand){
        $("#feed, #feed-saved").width(popupGlobal.backgroundPage.appGlobal.options.expandedPopupWidth);
    } else {
        $("#feed, #feed-saved").width(popupGlobal.backgroundPage.appGlobal.options.popupWidth);
    }
}