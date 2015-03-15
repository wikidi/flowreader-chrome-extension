"use strict";

var FlowReaderApiClient = function (accessToken) {

    this.accessToken = accessToken;

    var apiUrl =  "http://flow.local/api/";
    var secureApiUrl = "https://flow.local/api/";
    var extensionVersion = chrome.runtime.getManifest().version;

    this.getMethodUrl = function (methodName, parameters, useSecureConnection) {
        if (methodName === undefined) {
            return "";
        }
        var methodUrl = (useSecureConnection ? secureApiUrl : apiUrl) + methodName;

        var queryString = "?";
        for (var parameterName in parameters) {
            queryString += parameterName + "=" + parameters[parameterName] + "&";
        }

        methodUrl += queryString;

        return methodUrl;
    };

    this.request = function (methodName, settings) {
        var url = this.getMethodUrl(methodName, settings.parameters, settings.useSecureConnection);
        var verb = settings.verb || "GET";

        if (this.accessToken) {
            url += ((/\?/).test(url) ? "&" : "?") + "accessToken=" + this.accessToken;
        }

        var body;
        if (settings.body) {
            body = JSON.stringify(settings.body);
        }

        $.ajax({
            url: url,
            type: verb,
            data: body,
            async: true,
            contentType: 'application/json',
            dataType: 'json',
            timeout: settings.timeout,
            error: function (err) {
                if (typeof settings.onError === "function"){
                    settings.onError(err);
                }
            },
            success: function (e) {
                if (e.exitCode == 3000) {
                    console.log('Not logged in');
                    if (typeof settings.onAuthorizationRequired === "function") {
                        settings.onAuthorizationRequired(settings.accessToken);
                    }
                    return;
                }
                if (typeof settings.onSuccess === "function"){
                    console.log(e);
                    settings.onSuccess(e);
                }
            }

        });

        console.log(url);
        console.log(verb);
        console.log(body);
    };
};