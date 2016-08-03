/**
 * @file index.js
 * @author leeight
 */

var path = require('path');
var fs = require('fs');

var through = require('through2');
var gutil = require('gulp-util');
var assign = require('object-assign');
var edp = require('edp-core');
var Compiler = require('edp-module-compiler');

var PLUGIN_NAME = 'gulp-edp-module-compiler';

module.exports = function (options) {
    var cwd = process.cwd();

    var bundleOptions = assign({
        configFile: path.join(cwd, 'module.conf')
    }, options);

    var configFile = bundleOptions.configFile;
    var moduleConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

    var compiler = new Compiler(moduleConfig);

    // 是否应该 自动的加载 baseUrl 和 packages 里面配置的内容？
    function transform(file, enc, callback) {
        if (file.isNull()) {
            return callback(null, file);
        }

        if (file.isStream()) {
            return callback(new Error(PLUGIN_NAME + '-pre: Streaming not supported'));
        }

        var moduleIds = edp.amd.getModuleId(file.path, configFile);

        if (!moduleIds.length) {
            var fpath = path.relative(cwd, file.path);
            gutil.log('  [!AMD] %s', gutil.colors.red(fpath));
            return callback(null, file);
        }

        compiler.registerModuleIds(moduleIds, file);

        if (compiler.shouldCombine(moduleIds)) {
            // 如果当前的模块需要进行合并的操作，那么就不要执行 this.push
            // 而是简单的记录一下，等到 flush 的时候再追加这个文件
            return callback();
        }

        file.contents = new Buffer(compiler.toSingle(moduleIds[0]));

        return callback(null, file);
    }

    function flush(callback) {
        // 获取在 module.conf 配置过的，需要合并的模块列表
        var moduleIds = compiler.getCombinedModules();

        for (var i = 0; i < moduleIds.length; i++) {
            var moduleId = moduleIds[i];
            var file = compiler.getFileByModuleId(moduleId);
            if (!file) {
                throw new gutil.PluginError(PLUGIN_NAME + '-concat',
                    'Can not found ' + moduleId + ' contents.');
            }

            this.push(new gutil.File({
                base: cwd,
                contents: new Buffer(compiler.toBundle(moduleId)),
                path: file.path
            }));
        }

        callback();
    }

    return through.obj(transform, flush);
};
