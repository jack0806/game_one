// ============================================================
//  tsc-driver.js — 无 node_modules 环境下的最小 tsc 驱动
// ============================================================
// 本机 npm 私有源不可达、项目未安装 typescript 依赖，直接复用
// VS Code 捆绑的 typescript.js 编译器库完成 `tsc -p <project>`。
// 用法（配合 ZCode 的 Electron 以 Node 模式运行）：
//   set ELECTRON_RUN_AS_NODE=1
//   "E:\zcode\ZCode.exe" D:\yx\.zcode\test-tooling\tsc-driver.js -p tsconfig.test.json
'use strict';
const path = require('path');
const ts = require('E:/Microsoft VS Code/resources/app/extensions/node_modules/typescript/lib/typescript.js');

const args = process.argv.slice(2);
let configPath = 'tsconfig.json';
for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' && args[i + 1]) configPath = args[i + 1];
}
const abs = path.resolve(process.cwd(), configPath);
const readResult = ts.readConfigFile(abs, ts.sys.readFile);
if (readResult.error) {
    console.error(ts.formatDiagnostics([readResult.error], {
        getCanonicalFileName: f => f,
        getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
        getNewLine: () => ts.sys.newLine,
    }));
    process.exit(1);
}
const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, path.dirname(abs));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const emitResult = program.emit();
const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
const host = {
    getCanonicalFileName: f => f,
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getNewLine: () => ts.sys.newLine,
};
const report = ts.formatDiagnosticsWithColorAndContext(diagnostics, host);
if (report) console.error(report);
process.exit(diagnostics.length > 0 || emitResult.emitSkipped ? 1 : 0);
