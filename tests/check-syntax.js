const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const ignoredDirs = new Set(['.git', 'node_modules']);

function collectJsFiles(dir) {
    const files = [];

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (ignoredDirs.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }

    return files;
}

const files = collectJsFiles(rootDir);

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
        cwd: rootDir,
        stdio: 'inherit'
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

console.log(`Syntax check passed for ${files.length} JavaScript files`);
