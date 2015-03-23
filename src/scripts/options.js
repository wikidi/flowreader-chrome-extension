"use strict";

var optionsGlobal = {
    backgroundPermission: {
        permissions: ["background"]
    }
};

$(document).ready(function () {
    loadOptions();
});

$("body").on("click", "#save", function (e) {
    var form = document.getElementById("options");
    if (form.checkValidity()) {
        e.preventDefault();
        saveOptions();
    }
});

$("body").on("click", "#logout", function () {
    chrome.extension.getBackgroundPage().appGlobal.options.accessToken = "";
    chrome.extension.getBackgroundPage().appGlobal.options.refreshToken = "";
    chrome.storage.sync.remove(["accessToken", "refreshToken"], function () {});
    $("#userInfo, #filters-settings").hide();
});

$("#options").on("change", "input", function () {
    $("[data-disable-parent]").each(function(key, value){
        var child = $(value);
        var parent = $("input[data-option-name='" + child.data("disable-parent") + "']");
        parent.is(":checked") ? child.attr("disabled", "disable") : child.removeAttr("disabled");
    });

    $("[data-enable-parent]").each(function(key, value){
        var child = $(value);
        var parent = $("input[data-option-name='" + child.data("enable-parent") + "']");
        !parent.is(":checked") ? child.attr("disabled", "disable") : child.removeAttr("disabled");
    });
});

/* Save all option in the chrome storage */
function saveOptions() {
    var options = {};
    $("#options").find("input[data-option-name]").each(function (optionName, value) {
        var optionControl = $(value);
        var optionValue;
        if (optionControl.attr("type") === "checkbox") {
            optionValue = optionControl.is(":checked");
        } else if (optionControl.attr("type") === "number") {
            optionValue = Number(optionControl.val());
        } else {
            optionValue = optionControl.val();
        }
        options[optionControl.data("option-name")] = optionValue;
    });

    setBackgroundMode($("#enable-background-mode").is(":checked"));

    chrome.storage.sync.set(options, function () {
        alert(chrome.i18n.getMessage("OptionsSaved"));
    });
}

function loadOptions() {
    chrome.permissions.contains(optionsGlobal.backgroundPermission, function (enabled){
        $("#enable-background-mode").prop("checked", enabled);
    });

    chrome.storage.sync.get(null, function (items) {
        var optionsForm = $("#options");
        for (var option in items) {
            var optionControl = optionsForm.find("input[data-option-name='" + option + "']");
            if (optionControl.attr("type") === "checkbox") {
                optionControl.attr("checked", items[option]);
            } else {
                optionControl.val(items[option]);
            }
        }
        optionsForm.find("input").trigger("change");
    });
    $("#header").text(chrome.i18n.getMessage("FlowReaderNotifierOptions"));
    $("#options").find("[data-locale-value]").each(function () {
        var textBox = $(this);
        var localValue = textBox.data("locale-value");
        textBox.text(chrome.i18n.getMessage(localValue));
    });
}

function setBackgroundMode(enable) {
    if (enable) {
        chrome.permissions.request(optionsGlobal.backgroundPermission, function () {
        });
    } else {
        chrome.permissions.remove(optionsGlobal.backgroundPermission, function () {
        });
    }
}