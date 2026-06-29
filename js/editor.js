// 文件：js/editor.js
// 拼豆图纸转换核心引擎 - 动态品牌 + 前缀分类 + 色系选择

// ============================================================
// 前缀分类配置（根据你的数据调整）
// ============================================================
// 标准色前缀：用户不可取消，始终保留
const STANDARD_PREFIXES = ['M', 'H', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

// ============================================================
// 全局状态
// ============================================================
let uploadedImage = null;
let currentGridCols = 29;
let currentGridRows = 29;
let currentPaletteKey = 'mard_series';
let currentMaxColors = 16;
let showNumber = true;
let showGrid = true;
let gridData = [];
let usedColorsMap = new Map();
let isGenerating = false;
let imageAspectRatio = 1;
let beadSize = 24;
let zoomLevel = 1;
let panX = 0, panY = 0;
let isPanning = false;
let panStartX = 0, panStartY = 0;
let startPanX = 0, startPanY = 0;
let currentTool = 'select';
let selectedCell = null;
let selectedCellX = -1;
let selectedCellY = -1;

// ============================================================
// DOM 引用
// ============================================================
const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d');
const placeholder = document.getElementById('placeholder');
const gridInfo = document.getElementById('gridInfo');
const colorLegend = document.getElementById('colorLegend');
const comparatorList = document.getElementById('comparatorList');
const toast = document.getElementById('toast');
const modeDisplay = document.getElementById('modeDisplay');
const selectedCellDisplay = document.getElementById('selectedCellDisplay');
const changeColorBtn = document.getElementById('changeColorBtn');

const brandSelect = document.getElementById('brandSelect');
const imageInput = document.getElementById('imageInput');
const fileZone = document.getElementById('fileZone');
const boardSizeSelect = document.getElementById('boardSizeSelect');
const customSizeGroup = document.getElementById('customSizeGroup');
const customWidth = document.getElementById('customWidth');
const customHeight = document.getElementById('customHeight');
const lockAspectBtn = document.getElementById('lockAspectBtn');
const beadSizeSlider = document.getElementById('beadSizeSlider');
const beadSizeLabel = document.getElementById('beadSizeLabel');
const maxColorsSelect = document.getElementById('maxColorsSelect');
const customMaxColors = document.getElementById('customMaxColors');
const showNumberCheck = document.getElementById('showNumberCheck');
const showGridCheck = document.getElementById('showGridCheck');
const generateBtn = document.getElementById('generateBtn');
const exportPngBtn = document.getElementById('exportPngBtn');
const exportCszBtn = document.getElementById('exportCszBtn');
const zoomSlider = document.getElementById('zoomSlider');
const zoomLabel = document.getElementById('zoomLabel');
const progressContainer = document.getElementById('progressContainer');
const genProgress = document.getElementById('genProgress');
const progressText = document.getElementById('progressText');
const selectModeBtn = document.getElementById('selectModeBtn');
const handModeBtn = document.getElementById('handModeBtn');

const fileNameInput = document.getElementById('fileNameInput');
const saveFileBtn = document.getElementById('saveFileBtn');
const loadFileBtn = document.getElementById('loadFileBtn');
const deleteFileBtn = document.getElementById('deleteFileBtn');
const fileListSelect = document.getElementById('fileListSelect');

let isAspectLocked = true;

// ============================================================
// 工具函数：分析颜色前缀
// ============================================================
function analyzeColorPrefixes(colors) {
    const prefixMap = new Map();

    colors.forEach(color => {
        const id = color.id;
        const match = id.match(/^[A-Z]+/);
        const prefix = match ? match[0] : id.charAt(0);
        
        if (!prefixMap.has(prefix)) {
            prefixMap.set(prefix, { count: 0, colors: [] });
        }
        prefixMap.get(prefix).count++;
        prefixMap.get(prefix).colors.push(color);
    });

    const standard = [];
    const optional = [];

    prefixMap.forEach((value, prefix) => {
        if (STANDARD_PREFIXES.includes(prefix)) {
            standard.push({ prefix: prefix, count: value.count, colors: value.colors });
        } else {
            optional.push({ prefix: prefix, count: value.count, colors: value.colors });
        }
    });

    // 按前缀字母排序
    standard.sort((a, b) => a.prefix.localeCompare(b.prefix));
    optional.sort((a, b) => a.prefix.localeCompare(b.prefix));

    return { standard, optional };
}

function getAvailableColors(colors, enabledPrefixes) {
    const result = [];
    const optionalColors = [];

    colors.forEach(color => {
        const id = color.id;
        const match = id.match(/^[A-Z]+/);
        const prefix = match ? match[0] : id.charAt(0);
        
        if (STANDARD_PREFIXES.includes(prefix)) {
            result.push(color);
        } else {
            optionalColors.push(color);
        }
    });

    optionalColors.forEach(color => {
        const id = color.id;
        const match = id.match(/^[A-Z]+/);
        const prefix = match ? match[0] : id.charAt(0);
        if (enabledPrefixes.includes(prefix)) {
            result.push(color);
        }
    });

    return result;
}

// ============================================================
// 初始化：可选色系复选框
// ============================================================
function initOptionalPrefixes() {
    const container = document.getElementById('optionalPrefixContainer');
    if (!container) return;

    const palette = PALETTES[currentPaletteKey];
    if (!palette) {
        container.innerHTML = '<div style="font-size:12px;color:#6C6C8A;">暂无数据</div>';
        return;
    }

    const { standard, optional } = analyzeColorPrefixes(palette.colors);
    
    let html = '';

    if (standard.length > 0) {
        const prefixLabels = standard.map(s => s.prefix).join('、');
        const totalCount = standard.reduce((sum, s) => sum + s.count, 0);
        html += `<div style="font-size:12px;color:#6C6C8A;margin-bottom:6px;padding:4px 8px;background:#1A1A2E;border-radius:4px;">
                    📌 标准色（始终保留）：${prefixLabels}（共 ${totalCount} 种）
                </div>`;
    }

    if (optional.length > 0) {
        html += `<div style="font-size:13px;color:#A8A8C8;margin:4px 0 6px;">🎯 可选色系（按需启用）：</div>`;
        optional.forEach(group => {
            const isChecked = true;
            html += `
                <div class="checkbox-group" style="padding:2px 0;">
                    <input type="checkbox" class="optional-prefix-checkbox" id="prefix_${group.prefix}" value="${group.prefix}" checked>
                    <label for="prefix_${group.prefix}" style="font-size:13px;color:#EAEAFF;">
                        ${group.prefix} 系列（${group.count} 种）
                    </label>
                </div>
            `;
        });
        html += `
            <div style="display:flex;gap:8px;margin-top:4px;">
                <button id="selectAllPrefixes" style="background:rgba(255,255,255,0.05);border:1px solid #2A2A4A;color:#A8A8C8;padding:2px 12px;border-radius:4px;cursor:pointer;font-size:12px;">全选</button>
                <button id="deselectAllPrefixes" style="background:rgba(255,255,255,0.05);border:1px solid #2A2A4A;color:#A8A8C8;padding:2px 12px;border-radius:4px;cursor:pointer;font-size:12px;">取消全选</button>
            </div>
        `;
    } else {
        html += `<div style="font-size:12px;color:#6C6C8A;padding:4px 8px;">✅ 所有色号均为标准色，无需选择</div>`;
    }

    container.innerHTML = html;

    // 绑定事件：全选
    const selectAllBtn = document.getElementById('selectAllPrefixes');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            document.querySelectorAll('.optional-prefix-checkbox').forEach(cb => cb.checked = true);
            if (uploadedImage) generateGrid();
        });
    }

    // 绑定事件：取消全选
    const deselectAllBtn = document.getElementById('deselectAllPrefixes');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            document.querySelectorAll('.optional-prefix-checkbox').forEach(cb => cb.checked = false);
            if (uploadedImage) generateGrid();
        });
    }

    // 绑定事件：单个复选框变化
    document.querySelectorAll('.optional-prefix-checkbox').forEach(cb => {
        cb.addEventListener('change', function() {
            if (uploadedImage) generateGrid();
        });
    });
}

// ============================================================
// 工具模式切换
// ============================================================
function setTool(mode) {
    currentTool = mode;
    if (mode === 'select') {
        selectModeBtn.classList.add('active');
        handModeBtn.classList.remove('active');
        modeDisplay.textContent = '选色';
        canvas.style.cursor = 'pointer';
    } else {
        handModeBtn.classList.add('active');
        selectModeBtn.classList.remove('active');
        modeDisplay.textContent = '抓手';
        canvas.style.cursor = 'grab';
    }
}

selectModeBtn.addEventListener('click', () => setTool('select'));
handModeBtn.addEventListener('click', () => setTool('hand'));

// ============================================================
// 豆子大小滑块
// ============================================================
beadSizeSlider.addEventListener('input', function() {
    beadSize = parseInt(this.value);
    beadSizeLabel.textContent = beadSize;
    if (gridData.length) { redrawCanvas(); }
});

// ============================================================
// 上传图片
// ============================================================
fileZone.addEventListener('click', () => imageInput.click());
fileZone.addEventListener('dragover', (e) => { e.preventDefault(); fileZone.style.borderColor = '#A29BFE'; });
fileZone.addEventListener('dragleave', () => { fileZone.style.borderColor = '#2A2A4A'; });
fileZone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileZone.style.borderColor = '#2A2A4A';
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
imageInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('⚠️ 请上传图片文件！');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            uploadedImage = img;
            imageAspectRatio = img.width / img.height;
            if (boardSizeSelect.value === 'custom') {
                const w = parseInt(customWidth.value) || 29;
                const h = Math.round(w / imageAspectRatio);
                customHeight.value = h;
                currentGridCols = w;
                currentGridRows = h;
            }
            placeholder.style.display = 'none';
            canvas.style.display = 'block';
            generateBtn.disabled = false;
            generateGrid();
            showToast('✅ 图片上传成功！');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ============================================================
// 图纸尺寸
// ============================================================
boardSizeSelect.addEventListener('change', function() {
    if (this.value === 'custom') {
        customSizeGroup.style.display = 'block';
        if (uploadedImage) {
            const base = parseInt(customWidth.value) || 29;
            const h = Math.round(base / imageAspectRatio);
            customWidth.value = base;
            customHeight.value = h;
            currentGridCols = base;
            currentGridRows = h;
        } else {
            customWidth.value = 29;
            customHeight.value = 29;
            currentGridCols = 29;
            currentGridRows = 29;
        }
    } else {
        customSizeGroup.style.display = 'none';
        const size = parseInt(this.value);
        currentGridCols = size;
        currentGridRows = size;
        if (uploadedImage) generateGrid();
    }
});

customWidth.addEventListener('input', function() {
    let val = parseInt(this.value) || 4;
    if (isAspectLocked && uploadedImage) {
        const newH = Math.round(val / imageAspectRatio);
        customHeight.value = newH;
        currentGridRows = newH;
    } else if (isAspectLocked && !uploadedImage) {
        customHeight.value = val;
        currentGridRows = val;
    }
    currentGridCols = parseInt(this.value) || 4;
    if (uploadedImage) generateGrid();
});

customHeight.addEventListener('input', function() {
    let val = parseInt(this.value) || 4;
    if (isAspectLocked && uploadedImage) {
        const newW = Math.round(val * imageAspectRatio);
        customWidth.value = newW;
        currentGridCols = newW;
    } else if (isAspectLocked && !uploadedImage) {
        customWidth.value = val;
        currentGridCols = val;
    }
    currentGridRows = parseInt(this.value) || 4;
    if (uploadedImage) generateGrid();
});

lockAspectBtn.addEventListener('click', function() {
    isAspectLocked = !isAspectLocked;
    this.textContent = isAspectLocked ? '🔒' : '🔓';
    if (isAspectLocked && uploadedImage) {
        const w = parseInt(customWidth.value) || 29;
        const h = Math.round(w / imageAspectRatio);
        customHeight.value = h;
        currentGridRows = h;
        if (uploadedImage) generateGrid();
    }
});

// ============================================================
// 最大颜色数
// ============================================================
maxColorsSelect.addEventListener('change', function() {
    if (this.value === 'custom') {
        customMaxColors.style.display = 'block';
        customMaxColors.value = 10;
        currentMaxColors = 10;
    } else {
        customMaxColors.style.display = 'none';
        currentMaxColors = parseInt(this.value) || 0;
    }
    if (uploadedImage) generateGrid();
});
customMaxColors.addEventListener('change', function() {
    currentMaxColors = parseInt(this.value) || 0;
    if (uploadedImage) generateGrid();
});

// ============================================================
// 显示选项
// ============================================================
showNumberCheck.addEventListener('change', function() {
    showNumber = this.checked;
    if (uploadedImage) generateGrid();
});
showGridCheck.addEventListener('change', function() {
    showGrid = this.checked;
    if (uploadedImage) generateGrid();
});

// ============================================================
// 缩放
// ============================================================
zoomSlider.addEventListener('input', function() {
    zoomLevel = parseInt(this.value) / 100;
    zoomLabel.textContent = this.value + '%';
    applyTransform();
});

function applyTransform() {
    canvas.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoomLevel + ')';
    canvas.style.transformOrigin = 'top left';
}

// ============================================================
// 生成按钮
// ============================================================
generateBtn.addEventListener('click', function() {
    if (!uploadedImage) {
        showToast('⚠️ 请先上传图片！');
        return;
    }
    generateGrid();
});

// ============================================================
// 核心生成函数
// ============================================================
function generateGrid() {
    if (!uploadedImage || isGenerating) return;
    isGenerating = true;
    generateBtn.disabled = true;
    progressContainer.style.display = 'block';
    genProgress.style.width = '0%';
    progressText.textContent = '正在采样图片...';

    setTimeout(() => {
        try {
            doGenerate();
        } catch (e) {
            console.error(e);
            showToast('⚠️ 生成出错：' + e.message);
        } finally {
            isGenerating = false;
            generateBtn.disabled = false;
            progressContainer.style.display = 'none';
            panX = 0; panY = 0;
            zoomLevel = 1;
            zoomSlider.value = 100;
            zoomLabel.textContent = '100%';
            applyTransform();
            selectedCell = null;
            selectedCellDisplay.textContent = '无';
        }
    }, 50);
}

function doGenerate() {
    const cols = currentGridCols;
    const rows = currentGridRows;
    const palette = PALETTES[currentPaletteKey];
    if (!palette) {
        showToast('⚠️ 未找到该品牌色板！');
        return;
    }

    // ---- 获取用户选中的可选前缀 ----
    const enabledPrefixes = [];
    document.querySelectorAll('.optional-prefix-checkbox:checked').forEach(cb => {
        enabledPrefixes.push(cb.value);
    });

    // ---- 过滤颜色 ----
    let colorData = getAvailableColors(palette.colors, enabledPrefixes);
    if (colorData.length === 0) {
        showToast('⚠️ 没有可用的颜色！请至少保留一个色系');
        return;
    }

    const maxColors = currentMaxColors;

    genProgress.style.width = '10%';
    progressText.textContent = '正在缩放图片...';

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = cols;
    tempCanvas.height = rows;
    tempCtx.drawImage(uploadedImage, 0, 0, cols, rows);
    const imageData = tempCtx.getImageData(0, 0, cols, rows);
    const data = imageData.data;

    genProgress.style.width = '30%';
    progressText.textContent = '正在匹配色号...';

    var grid = [];
    var rawColors = [];
    var colorCount = new Map();

    for (var y = 0; y < rows; y++) {
        var row = [];
        for (var x = 0; x < cols; x++) {
            var idx = (y * cols + x) * 4;
            var r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
            if (a < 128) { r = 255; g = 255; b = 255; }
            var rgb = [r, g, b];
            rawColors.push(rgb);
            var matched = findClosestColor(r, g, b, colorData);
            row.push(matched);
            var key = matched.id;
            colorCount.set(key, (colorCount.get(key) || 0) + 1);
        }
        grid.push(row);
    }

    genProgress.style.width = '60%';
    progressText.textContent = '正在应用颜色限制...';

    var finalGrid = grid;
    var finalUsedColors = new Map();

    if (maxColors > 0 && colorCount.size > maxColors) {
        var sorted = Array.from(colorCount.entries()).sort(function(a, b) { return b[1] - a[1]; });
        var keepIds = new Set(sorted.slice(0, maxColors).map(function(item) { return item[0]; }));
        var keepColors = colorData.filter(function(c) { return keepIds.has(c.id); });
        finalGrid = grid.map(function(row) {
            return row.map(function(cell) {
                if (keepIds.has(cell.id)) return cell;
                var rgb2 = hexToRgb(cell.hex);
                return findClosestColor(rgb2[0], rgb2[1], rgb2[2], keepColors);
            });
        });
        var newCount = new Map();
        finalGrid.forEach(function(row) {
            row.forEach(function(cell) {
                newCount.set(cell.id, (newCount.get(cell.id) || 0) + 1);
            });
        });
        finalUsedColors = newCount;
    } else {
        finalUsedColors = colorCount;
    }

    gridData = finalGrid;
    usedColorsMap = finalUsedColors;

    genProgress.style.width = '80%';
    progressText.textContent = '正在绘制图纸...';

    var cellSize = beadSize;
    var totalW = cellSize * cols;
    var totalH = cellSize * rows;
    if (totalW > 10000 || totalH > 10000) {
        showToast('⚠️ 图纸尺寸过大，请减小网格数或豆子大小');
        return;
    }

    canvas.width = totalW;
    canvas.height = totalH;
    ctx.clearRect(0, 0, totalW, totalH);
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(0, 0, totalW, totalH);

    for (y = 0; y < rows; y++) {
        for (x = 0; x < cols; x++) {
            var cell = finalGrid[y][x];
            ctx.fillStyle = cell.hex;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            if (showGrid) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
            if (showNumber && cellSize >= 12) {
                var fontSize = Math.min(12, cellSize * 0.45);
                ctx.font = 'bold ' + fontSize + 'px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                var rgb3 = hexToRgb(cell.hex);
                var brightness = (rgb3[0]*299 + rgb3[1]*587 + rgb3[2]*114) / 1000;
                ctx.fillStyle = brightness > 128 ? '#000000' : '#FFFFFF';
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 3;
                ctx.fillText(cell.id, x * cellSize + cellSize/2, y * cellSize + cellSize/2 + 1);
                ctx.shadowBlur = 0;
            }
        }
    }

    genProgress.style.width = '95%';
    progressText.textContent = '更新信息...';

    var usedCount = finalUsedColors.size;
    gridInfo.textContent = '网格: ' + cols + ' x ' + rows + ' | 豆子大小: ' + cellSize + 'px | 使用 ' + usedCount + ' 种色号';
    updateLegend(finalUsedColors);
    updateComparator(finalGrid, rawColors, cols, rows, colorData);
    exportPngBtn.disabled = false;
    exportCszBtn.disabled = false;

    genProgress.style.width = '100%';
    progressText.textContent = '✅ 完成！';
    showToast('✅ 生成完成！共使用 ' + usedCount + ' 种颜色');

    autoSaveToLocal();
}

// ============================================================
// 颜色匹配
// ============================================================
function findClosestColor(r, g, b, colorArray) {
    var minDist = Infinity;
    var best = colorArray[0];
    for (var i = 0; i < colorArray.length; i++) {
        var color = colorArray[i];
        var rgb = hexToRgb(color.hex);
        var dist = (r-rgb[0])*(r-rgb[0]) + (g-rgb[1])*(g-rgb[1]) + (b-rgb[2])*(b-rgb[2]);
        if (dist < minDist) {
            minDist = dist;
            best = color;
        }
    }
    return best;
}

// ============================================================
// 工具函数
// ============================================================
function hexToRgb(hex) {
    var result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1],16), parseInt(result[2],16), parseInt(result[3],16)] : [0,0,0];
}

function rgbToHex(r, g, b) {
    return '#' + [r,g,b].map(function(c) { return Math.round(c).toString(16).padStart(2,'0'); }).join('');
}

function colorDistance(c1, c2) {
    return Math.sqrt((c1[0]-c2[0])*(c1[0]-c2[0]) + (c1[1]-c2[1])*(c1[1]-c2[1]) + (c1[2]-c2[2])*(c1[2]-c2[2]));
}

// ============================================================
// 更新图例
// ============================================================
function updateLegend(colorsMap) {
    var arr = Array.from(colorsMap.keys());
    if (arr.length === 0) {
        colorLegend.innerHTML = '<span style="color:#3A3A5A; font-size:12px;">暂无数据</span>';
        return;
    }
    var sorted = Array.from(colorsMap.entries()).sort(function(a,b) { return b[1]-a[1]; });
    var html = '';
    sorted.forEach(function(item) {
        var id = item[0];
        var count = item[1];
        var palette = PALETTES[currentPaletteKey];
        var color = null;
        for (var i = 0; i < palette.colors.length; i++) {
            if (palette.colors[i].id === id) { color = palette.colors[i]; break; }
        }
        if (color) {
            html += '<div class="legend-item"><span class="legend-color" style="background:' + color.hex + ';"></span><span class="legend-id">' + id + ' (' + count + ')</span></div>';
        }
    });
    colorLegend.innerHTML = html;
}

// ============================================================
// 颜色比较器
// ============================================================
function updateComparator(grid, rawColors, cols, rows, colorData) {
    var usageMap = new Map();
    for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
            var idx = y * cols + x;
            var cell = grid[y][x];
            var rgb = rawColors[idx];
            if (!usageMap.has(cell.id)) {
                usageMap.set(cell.id, { sumR: 0, sumG: 0, sumB: 0, count: 0, hex: cell.hex });
            }
            var stat = usageMap.get(cell.id);
            stat.sumR += rgb[0];
            stat.sumG += rgb[1];
            stat.sumB += rgb[2];
            stat.count++;
        }
    }

    var html = '';
    var sorted = Array.from(usageMap.entries()).sort(function(a,b) { return b[1].count - a[1].count; });
    sorted.forEach(function(item) {
        var id = item[0];
        var stat = item[1];
        var avgR = stat.sumR / stat.count;
        var avgG = stat.sumG / stat.count;
        var avgB = stat.sumB / stat.count;
        var avgHex = rgbToHex(avgR, avgG, avgB);
        var crgb = hexToRgb(stat.hex);
        var dist = colorDistance([avgR, avgG, avgB], crgb);
        var maxDist = Math.sqrt(255*255 * 3);
        var similarity = Math.max(0, 100 - (dist / maxDist) * 100);
        var simPercent = similarity.toFixed(1);

        html += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px solid #1A1A2E;">';
        html += '<span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:' + avgHex + ';border:1px solid #3A3A5A;"></span>';
        html += '<span style="font-weight:600;color:#EAEAFF;">' + id + '</span>';
        html += '<span style="color:#6C6C8A;font-size:11px;">→</span>';
        html += '<span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:' + stat.hex + ';border:1px solid #3A3A5A;"></span>';
        html += '<span style="font-size:11px;color:#A8A8C8;margin-left:auto;">相似度 ' + simPercent + '%</span>';
        html += '</div>';
    });
    comparatorList.innerHTML = html || '暂无数据';
}

// ============================================================
// 画布交互：选中格子
// ============================================================
canvas.addEventListener('click', function(e) {
    if (currentTool === 'hand') return;
    if (!gridData.length) {
        showToast('⚠️ 请先生成图纸');
        return;
    }

    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var mouseX = (e.clientX - rect.left) * scaleX;
    var mouseY = (e.clientY - rect.top) * scaleY;
    mouseX = Math.max(0, Math.min(canvas.width, mouseX));
    mouseY = Math.max(0, Math.min(canvas.height, mouseY));

    var cols = gridData[0] ? gridData[0].length : currentGridCols;
    var rows = gridData.length;
    var cellW = canvas.width / cols;
    var cellH = canvas.height / rows;
    var x = Math.floor(mouseX / cellW);
    var y = Math.floor(mouseY / cellH);

    if (x >= 0 && x < cols && y >= 0 && y < rows) {
        selectedCell = { x: x, y: y };
        selectedCellDisplay.textContent = '(' + (x+1) + ', ' + (y+1) + ')';
        showToast('✅ 已选中格子 (' + (x+1) + ', ' + (y+1) + ')，色号：' + gridData[y][x].id);
        redrawCanvas();
    } else {
        showToast('⚠️ 点击位置超出图纸范围');
    }
});

// ============================================================
// 颜色选择器
// ============================================================
function showColorPicker(x, y, colors) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;justify-content:center;align-items:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:#14142A;padding:20px;border-radius:16px;border:1px solid #2A2A4A;max-width:420px;max-height:80vh;overflow-y:auto;';
    modal.innerHTML = '<div style="font-weight:600;margin-bottom:12px;color:#EAEAFF;">选择新色号 (格子 ' + (x+1) + ', ' + (y+1) + ')</div><div style="display:flex;flex-wrap:wrap;gap:6px;" id="colorGrid"></div>';
    var colorGrid = modal.querySelector('#colorGrid');
    var selectedColor = null;
    var selectedBtn = null;

    colors.forEach(function(c) {
        var btn = document.createElement('button');
        var contrast = getContrastColor(c.hex);
        btn.style.cssText = 'width:40px;height:40px;border-radius:8px;border:2px solid transparent;background:' + c.hex + ';cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:' + contrast + ';font-weight:bold;';
        btn.textContent = c.id;
        btn.addEventListener('click', function() {
            if (selectedBtn) { selectedBtn.style.outline = 'none'; }
            this.style.outline = '3px solid #FFFFFF';
            selectedBtn = this;
            selectedColor = c;
            var preview = document.getElementById('selectedColorPreview');
            var idDisplay = document.getElementById('selectedColorId');
            if (preview) { preview.style.background = c.hex; }
            if (idDisplay) { idDisplay.textContent = c.id; }
        });
        colorGrid.appendChild(btn);
    });

    var bottomDiv = document.createElement('div');
    bottomDiv.style.cssText = 'margin-top:14px;display:flex;align-items:center;justify-content:space-between;';
    bottomDiv.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><span style="color:#A8A8C8;">已选：</span><span id="selectedColorPreview" style="display:inline-block;width:28px;height:28px;border-radius:4px;background:transparent;border:1px solid #3A3A5A;"></span><span id="selectedColorId" style="color:#EAEAFF;font-weight:600;">无</span></div><div><button id="confirmColorBtn" style="background:#6C5CE7;color:#fff;border:none;padding:6px 22px;border-radius:30px;cursor:pointer;margin-right:8px;font-weight:bold;">确认</button><button id="cancelColorBtn" style="background:#E74C3C;color:#fff;border:none;padding:6px 22px;border-radius:30px;cursor:pointer;font-weight:bold;">取消</button></div>';
    modal.appendChild(bottomDiv);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('confirmColorBtn').addEventListener('click', function() {
        if (!selectedColor) {
            showToast('⚠️ 请先点击选择一个颜色');
            return;
        }
        gridData[y][x] = selectedColor;
        redrawCanvas();
        var newCount = new Map();
        gridData.forEach(function(row) {
            row.forEach(function(cell) {
                newCount.set(cell.id, (newCount.get(cell.id) || 0) + 1);
            });
        });
        usedColorsMap = newCount;
        updateLegend(usedColorsMap);
        var html = '';
        var sorted2 = Array.from(usedColorsMap.entries()).sort(function(a,b) { return b[1]-a[1]; });
        sorted2.forEach(function(item) {
            var id2 = item[0];
            var count2 = item[1];
            var palette3 = PALETTES[currentPaletteKey];
            var color3 = null;
            for (var i = 0; i < palette3.colors.length; i++) {
                if (palette3.colors[i].id === id2) { color3 = palette3.colors[i]; break; }
            }
            if (color3) {
                html += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;"><span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:' + color3.hex + ';border:1px solid #3A3A5A;"></span><span style="font-weight:600;color:#EAEAFF;">' + id2 + '</span><span style="font-size:11px;color:#6C6C8A;margin-left:auto;">×' + count2 + '</span></div>';
            }
        });
        comparatorList.innerHTML = html || '暂无数据';
        showToast('已将 (' + (x+1) + ',' + (y+1) + ') 改为 ' + selectedColor.id);
        document.body.removeChild(overlay);
        selectedCell = null;
        selectedCellDisplay.textContent = '无';
        redrawCanvas();
    });

    document.getElementById('cancelColorBtn').addEventListener('click', function() {
        document.body.removeChild(overlay);
    });
}

// ============================================================
// 重绘画布
// ============================================================
function redrawCanvas() {
    var cols = gridData[0] ? gridData[0].length : currentGridCols;
    var rows = gridData.length;
    var cellSize = beadSize;
    var totalW = cellSize * cols;
    var totalH = cellSize * rows;
    if (totalW > 10000 || totalH > 10000) {
        showToast('⚠️ 图纸尺寸过大，无法显示');
        return;
    }
    canvas.width = totalW;
    canvas.height = totalH;
    ctx.clearRect(0, 0, totalW, totalH);
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(0, 0, totalW, totalH);

    for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
            var cell = gridData[y][x];
            ctx.fillStyle = cell.hex;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            if (showGrid) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
            if (showNumber && cellSize >= 12) {
                var fontSize = Math.min(12, cellSize * 0.45);
                ctx.font = 'bold ' + fontSize + 'px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                var rgb4 = hexToRgb(cell.hex);
                var brightness2 = (rgb4[0]*299 + rgb4[1]*587 + rgb4[2]*114) / 1000;
                ctx.fillStyle = brightness2 > 128 ? '#000000' : '#FFFFFF';
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 3;
                ctx.fillText(cell.id, x * cellSize + cellSize/2, y * cellSize + cellSize/2 + 1);
                ctx.shadowBlur = 0;
            }
        }
    }

    if (selectedCell) {
        var sx = selectedCell.x;
        var sy = selectedCell.y;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        ctx.strokeRect(sx * cellSize, sy * cellSize, cellSize, cellSize);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,215,0,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx * cellSize - 2, sy * cellSize - 2, cellSize + 4, cellSize + 4);
    }

    applyTransform();
}

function getContrastColor(hex) {
    var rgb = hexToRgb(hex);
    var brightness = (rgb[0]*299 + rgb[1]*587 + rgb[2]*114) / 1000;
    return brightness > 128 ? '#000000' : '#FFFFFF';
}

// ============================================================
// 抓手拖拽
// ============================================================
canvas.addEventListener('mousedown', function(e) {
    if (currentTool === 'hand') {
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        startPanX = panX;
        startPanY = panY;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
    }
});

canvas.addEventListener('mousemove', function(e) {
    if (currentTool === 'hand' && isPanning) {
        var dx = e.clientX - panStartX;
        var dy = e.clientY - panStartY;
        panX = startPanX + dx;
        panY = startPanY + dy;
        applyTransform();
        e.preventDefault();
    }
});

canvas.addEventListener('mouseup', function(e) {
    if (currentTool === 'hand' && isPanning) {
        isPanning = false;
        canvas.style.cursor = 'grab';
    }
});

canvas.addEventListener('mouseleave', function() {
    if (isPanning) {
        isPanning = false;
        canvas.style.cursor = 'grab';
    }
});

canvas.addEventListener('dragstart', function(e) { e.preventDefault(); });

// ============================================================
// 导出 PNG
// ============================================================
exportPngBtn.addEventListener('click', function() {
    var link = document.createElement('a');
    link.download = '拼豆图纸_' + currentGridCols + 'x' + currentGridRows + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('📷 PNG 导出成功！');
});

// ============================================================
// 导出 CSZ
// ============================================================
exportCszBtn.addEventListener('click', function() {
    if (!gridData.length) {
        showToast('⚠️ 请先生成图纸！');
        return;
    }
    var csv = 'PixelBee 拼豆图纸导出文件 (.csz)\n';
    csv += '品牌: ' + PALETTES[currentPaletteKey].name + '\n';
    csv += '尺寸: ' + currentGridCols + ' x ' + currentGridRows + '\n';
    csv += '色号总数: ' + usedColorsMap.size + '\n';
    var now = new Date();
    csv += '导出时间: ' + now.toLocaleString() + '\n';
    csv += '--- 色号列表 ---\n';
    var sortedColors = Array.from(usedColorsMap.entries()).sort(function(a,b) { return b[1]-a[1]; });
    sortedColors.forEach(function(item) {
        var id3 = item[0];
        var count3 = item[1];
        var palette4 = PALETTES[currentPaletteKey];
        var color4 = null;
        for (var i = 0; i < palette4.colors.length; i++) {
            if (palette4.colors[i].id === id3) { color4 = palette4.colors[i]; break; }
        }
        csv += id3 + ',' + (color4 ? color4.hex : '') + ',' + count3 + '\n';
    });
    csv += '--- 网格数据 ---\n';
    for (var y2 = 0; y2 < currentGridRows; y2++) {
        var row2 = gridData[y2];
        csv += row2.map(function(cell) { return cell.id; }).join(',') + '\n';
    }
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var link2 = document.createElement('a');
    link2.download = '图纸_' + currentGridCols + 'x' + currentGridRows + '.csz';
    link2.href = URL.createObjectURL(blob);
    link2.click();
    URL.revokeObjectURL(link2.href);
    showToast('📊 CSZ 导出成功！可用Excel打开');
});

// ============================================================
// 文件管理
// ============================================================
function getStorageKey() { return 'pixelbee_saved_files'; }
function getSavedFiles() {
    var raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : {};
}
function saveFileList(files) {
    localStorage.setItem(getStorageKey(), JSON.stringify(files));
}
function updateFileList() {
    var files = getSavedFiles();
    var select = fileListSelect;
    select.innerHTML = '<option value="">-- 已保存的图纸 --</option>';
    Object.keys(files).forEach(function(name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
}

saveFileBtn.addEventListener('click', function() {
    if (!gridData.length) {
        showToast('⚠️ 请先生成图纸！');
        return;
    }
    var name = fileNameInput.value.trim();
    if (!name) {
        name = prompt('请输入图纸名称：', '我的拼豆图纸');
        if (!name) return;
        fileNameInput.value = name;
    }
    var files = getSavedFiles();
    var data = {
        cols: currentGridCols,
        rows: currentGridRows,
        palette: currentPaletteKey,
        grid: gridData,
        usedColors: Array.from(usedColorsMap.entries()),
        beadSize: beadSize,
        timestamp: Date.now()
    };
    files[name] = data;
    saveFileList(files);
    updateFileList();
    showToast('✅ 图纸 "' + name + '" 已保存');
});

loadFileBtn.addEventListener('click', function() {
    var select = fileListSelect;
    var name = select.value;
    if (!name) {
        showToast('⚠️ 请从列表中选择一个图纸');
        return;
    }
    var files = getSavedFiles();
    var data = files[name];
    if (!data) {
        showToast('⚠️ 图纸不存在');
        return;
    }
    currentGridCols = data.cols;
    currentGridRows = data.rows;
    currentPaletteKey = data.palette;
    gridData = data.grid;
    usedColorsMap = new Map(data.usedColors);
    if (data.beadSize) {
        beadSize = data.beadSize;
        beadSizeSlider.value = beadSize;
        beadSizeLabel.textContent = beadSize;
    }
    brandSelect.value = currentPaletteKey;
    boardSizeSelect.value = 'custom';
    customSizeGroup.style.display = 'block';
    customWidth.value = currentGridCols;
    customHeight.value = currentGridRows;
    panX = 0; panY = 0;
    zoomLevel = 1;
    zoomSlider.value = 100;
    zoomLabel.textContent = '100%';
    selectedCell = null;
    selectedCellDisplay.textContent = '无';
    redrawCanvas();
    updateLegend(usedColorsMap);
    var html2 = '';
    var sorted3 = Array.from(usedColorsMap.entries()).sort(function(a,b) { return b[1]-a[1]; });
    sorted3.forEach(function(item) {
        var id4 = item[0];
        var count4 = item[1];
        var palette5 = PALETTES[currentPaletteKey];
        var color5 = null;
        for (var i = 0; i < palette5.colors.length; i++) {
            if (palette5.colors[i].id === id4) { color5 = palette5.colors[i]; break; }
        }
        if (color5) {
            html2 += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;"><span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:' + color5.hex + ';border:1px solid #3A3A5A;"></span><span style="font-weight:600;color:#EAEAFF;">' + id4 + '</span><span style="font-size:11px;color:#6C6C8A;margin-left:auto;">×' + count4 + '</span></div>';
        }
    });
    comparatorList.innerHTML = html2 || '暂无数据';
    exportPngBtn.disabled = false;
    exportCszBtn.disabled = false;
    fileNameInput.value = name;
    showToast('📂 已加载 "' + name + '"');
});

deleteFileBtn.addEventListener('click', function() {
    var select = fileListSelect;
    var name = select.value;
    if (!name) {
        showToast('⚠️ 请从列表中选择一个图纸');
        return;
    }
    if (!confirm('确定要删除 "' + name + '" 吗？')) return;
    var files = getSavedFiles();
    delete files[name];
    saveFileList(files);
    updateFileList();
    select.value = '';
    showToast('🗑️ 已删除 "' + name + '"');
});

function autoSaveToLocal() {
    if (!gridData.length) return;
    var files = getSavedFiles();
    var name = '_autosave';
    var data = {
        cols: currentGridCols,
        rows: currentGridRows,
        palette: currentPaletteKey,
        grid: gridData,
        usedColors: Array.from(usedColorsMap.entries()),
        beadSize: beadSize,
        timestamp: Date.now()
    };
    files[name] = data;
    saveFileList(files);
}

// ============================================================
// Toast
// ============================================================
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.classList.remove('show'); }, 3000);
}

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', function() {

    // ---- 1. 动态生成品牌下拉菜单 ----
    if (brandSelect) {
        brandSelect.innerHTML = '';
        const brandKeys = Object.keys(PALETTES);
        if (brandKeys.length === 0) {
            brandSelect.innerHTML = '<option value="">暂无品牌</option>';
        } else {
            brandKeys.forEach((key, index) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = PALETTES[key].name || key;
                if (index === 0) {
                    option.selected = true;
                    currentPaletteKey = key;
                }
                brandSelect.appendChild(option);
            });
        }
    }

    // ---- 2. 设置默认值 ----
    boardSizeSelect.value = '29';
    currentGridCols = 29;
    currentGridRows = 29;
    beadSizeSlider.value = 24;
    beadSize = 24;
    beadSizeLabel.textContent = '24';
    maxColorsSelect.value = '16';
    currentMaxColors = 16;
    showNumberCheck.checked = true;
    showGridCheck.checked = true;
    showNumber = true;
    showGrid = true;
    updateFileList();
    setTool('select');

    // ---- 3. 初始化可选色系 ----
    initOptionalPrefixes();
    showToast('🧩 欢迎使用 PixelBee 拼豆工坊');

    // ---- 4. 换色按钮事件 ----
    changeColorBtn.addEventListener('click', function() {
        if (!selectedCell) {
            showToast('⚠️ 请先在画布上点击选中一个格子');
            return;
        }
        const palette = PALETTES[currentPaletteKey];
        if (!palette) {
            showToast('⚠️ 未找到色板');
            return;
        }
        showColorPicker(selectedCell.x, selectedCell.y, palette.colors);
    });

    // ---- 5. 品牌切换事件 ----
    brandSelect.addEventListener('change', function() {
        currentPaletteKey = this.value;
        showToast('已切换到 ' + this.options[this.selectedIndex].text);
        initOptionalPrefixes();
        if (uploadedImage) generateGrid();
    });

    // ---- 6. 豆子大小变化时重绘 ----
    beadSizeSlider.addEventListener('input', function() {
        beadSize = parseInt(this.value);
        beadSizeLabel.textContent = beadSize;
        if (gridData.length) { redrawCanvas(); }
    });
});

window.addEventListener('resize', function() {});