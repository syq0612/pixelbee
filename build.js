// build.js - 自动打包项目源码为 ZIP
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// ===== 配置 =====
const PROJECT_ROOT = __dirname;
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const ZIP_NAME = 'PixelBee_拼豆大师_完整源码.zip';
const ZIP_PATH = path.join(DIST_DIR, ZIP_NAME);

// 要打包的文件/文件夹列表（相对于项目根目录）
const FILE_LIST = [
    'index.html',
    'tool.html',
    'offline.html',
    'css/style.css',
    'js/main.js',
    'js/palettes.js',
    'js/editor.js',
    'README.md',
    'README.txt'
];

// 要排除的文件（可选）
const EXCLUDE_LIST = [
    'node_modules',
    'dist',
    'build.js',
    'package.json',
    'package-lock.json',
    '.git'
];

// ===== 创建 dist 目录 =====
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR);
    console.log('📁 创建 dist 目录');
}

// ===== 创建 ZIP =====
const output = fs.createWriteStream(ZIP_PATH);
const archive = archiver('zip', {
    zlib: { level: 9 } // 最高压缩比
});

output.on('close', function() {
    const sizeKB = (archive.pointer() / 1024).toFixed(2);
    console.log('✅ 打包完成！');
    console.log(`📦 文件大小：${sizeKB} KB`);
    console.log(`📁 输出路径：${ZIP_PATH}`);
});

archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
        console.warn('⚠️ 警告：' + err.message);
    } else {
        throw err;
    }
});

archive.on('error', function(err) {
    throw err;
});

archive.pipe(output);

// ===== 添加文件 =====
let addedCount = 0;
let missingCount = 0;

FILE_LIST.forEach(file => {
    const filePath = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
        console.log(`📄 已添加：${file}`);
        addedCount++;
    } else {
        console.warn(`⚠️ 文件不存在：${file}`);
        missingCount++;
    }
});

// ===== 完成打包 =====
archive.finalize();

// ===== 在打包完成后自动复制到项目根目录（方便网页下载） =====
output.on('close', function() {
    // 复制一份到项目根目录，命名为 PixelBee_离线版.zip
    const rootZipPath = path.join(PROJECT_ROOT, 'PixelBee_离线版.zip');
    try {
        fs.copyFileSync(ZIP_PATH, rootZipPath);
        console.log(`📋 已复制到：${rootZipPath}`);
    } catch (e) {
        console.warn('⚠️ 复制失败：' + e.message);
    }

    console.log('\n📊 统计：');
    console.log(`   ✅ 已添加 ${addedCount} 个文件`);
    if (missingCount > 0) {
        console.log(`   ⚠️ ${missingCount} 个文件不存在`);
    }
    console.log('\n🎉 构建完成！');
});