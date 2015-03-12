module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        copy: {
            main: {
                files: [
                    {expand: true, cwd: '<%= pkg.sourcePath %>/', src: ['**'], dest: '<%= pkg.buildPath %>/'}
                ]
            }
        },
        "string-replace": {
            keys: {
                files: {
                    "<%= pkg.buildPath %>/scripts/core.js": "<%= pkg.buildPath %>/scripts/core.js"
                },
                options: {
                    replacements: [
                        {
                            pattern: 'clientSecret: ""',
                            replacement: 'clientSecret: "' + grunt.option("clientSecret") + '"'
                        },
                        {
                            pattern: 'clientId: ""',
                            replacement: 'clientId: "' + grunt.option("clientId") + '"'
                        }
                    ]
                }
            },
            sandboxApi: {
                files: {
                    "<%= pkg.buildPath %>/scripts/FlowReader.api.js": "<%= pkg.buildPath %>/scripts/flowreader.api.js"
                },
                options: {
                    replacements: [
                        {
                            pattern: /http(?:s)?:\/\/(?:www\.)?cloud\.FlowReader\.com/gi,
                            replacement: "http://sandbox.FlowReader.com"
                        }
                    ]
                }
            },
            sandboxLink: {
                files: {
                    "<%= pkg.buildPath %>/scripts/core.js": "<%= pkg.buildPath %>/scripts/core.js"
                },
                options: {
                    replacements: [
                        {
                            pattern: /http(?:s)?:\/\/(?:www\.)?FlowReader\.com/gi,
                            replacement: "http://sandbox.FlowReader.com"
                        }
                    ]
                }
            }
        },
        uglify: {
            dist: {
                files: {
                    "<%= pkg.buildPath %>/scripts/core.js": ["<%= pkg.buildPath %>/scripts/core.js"],
                    "<%= pkg.buildPath %>/scripts/FlowReader.api.js": ["<%= pkg.buildPath %>/scripts/flowreader.api.js"],
                    "<%= pkg.buildPath %>/scripts/options.js": ["<%= pkg.buildPath %>/scripts/options.js"],
                    "<%= pkg.buildPath %>/scripts/popup.js": ["<%= pkg.buildPath %>/scripts/popup.js"]
                }
            }
        },
        zip: {
            build: {
                cwd: "<%= pkg.buildPath %>/",
                src: ["<%= pkg.buildPath %>/**"],
                dest: '<%= pkg.buildPath %>/FlowReader-notifier.zip',
                compression: 'DEFLATE'
            }
        },
        clean: {
            "pre-build": ["<%= pkg.buildPath %>"],
            build: {
                files: [
                    {expand: true, cwd: "<%= pkg.buildPath %>", src: ["*", "!*.zip"]}
                ]
            }
        }
    });

    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks('grunt-string-replace');
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks('grunt-zip');
    grunt.loadNpmTasks('grunt-contrib-clean');

    grunt.registerTask("build", ["clean:pre-build", "copy", "string-replace:keys", "uglify", "zip", "clean:build"]);
    grunt.registerTask("sandbox", ["copy", "string-replace"]);
    grunt.registerTask("default", ["copy", "string-replace:keys"]);
};