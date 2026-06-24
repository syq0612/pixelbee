// 文件：js/editor.js
// 拼豆图纸转换核心引擎 - 点击选中 + 按钮换色

// ===== 全局状态 =====
let uploadedImage = null;
let currentGridCols = 29;
let currentGridRows = 29;
let currentPaletteKey = 'h_series';
let currentMaxColors = 16;
let showNumber = true;
let showGrid = true;
let allowSpecialColors = true;
let gridData = [];
let usedColorsMap = new Map();
let isGenerating = false;
let imageAspectRatio = 1;

let beadSize = 24;

// 视图变换
let zoomLevel = 1;
let panX = 0, panY = 0;
let isPanning = false;
let panStartX = 0, panStartY = 0;
let startPanX = 0, startPanY = 0;

// 工具模式
let currentTool = 'select';

// 选中的格子坐标 (行, 列)
let selectedCell = null; // {x, y}

// ===== DOM 引用 =====
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
const allowSpecialCheck = document.getElementById('allowSpecialCheck');
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

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
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
    allowSpecialCheck.checked = true;
    showNumber = true;
    showGrid = true;
    allowSpecialColors = true;
    updateFileList();
    setTool('select');
    showToast('🧩 欢迎使用 PixelBee 拼豆工坊');

    // 换色按钮事件
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
});

// ===== 工具模式切换 =====
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

// ===== 豆子大小滑块 =====
beadSizeSlider.addEventListener('input', function() {
    beadSize = parseInt(this.value);
    beadSizeLabel.textContent = beadSize;
    if (gridData.length) {
        redrawCanvas();
    }
});

// ===== 品牌切换 =====
brandSelect.addEventListener('change', function() {
    currentPaletteKey = this.value;
    showToast(`已切换到 ${this.options[this.selectedIndex].text}`);
    if (uploadedImage) generateGrid();
});

// ===== 上传图片 =====
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

// ===== 图纸尺寸 =====
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

// ===== 最大颜色数 =====
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

// ===== 显示选项 =====
showNumberCheck.addEventListener('change', function() {
    showNumber = this.checked;
    if (uploadedImage) generateGrid();
});
showGridCheck.addEventListener('change', function() {
    showGrid = this.checked;
    if (uploadedImage) generateGrid();
});
allowSpecialCheck.addEventListener('change', function() {
    allowSpecialColors = this.checked;
    showToast(allowSpecialColors ? '✅ 已允许使用特殊色' : '⛔ 已禁用特殊色');
    if (uploadedImage) generateGrid();
});

// ===== 缩放 =====
zoomSlider.addEventListener('input', function() {
    zoomLevel = parseInt(this.value) / 100;
    zoomLabel.textContent = this.value + '%';
    applyTransform();
});

function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
    canvas.style.transformOrigin = 'top left';
}

// ===== 生成按钮 =====
generateBtn.addEventListener('click', function() {
    if (!uploadedImage) {
        showToast('⚠️ 请先上传图片！');
        return;
    }
    generateGrid();
});

// ===== 核心生成函数 =====
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
            // 重置视图
            panX = 0; panY = 0;
            zoomLevel = 1;
            zoomSlider.value = 100;
            zoomLabel.textContent = '100%';
            applyTransform();
            // 清除选中
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

    let colorData = palette.colors;
    if (!allowSpecialColors) {
        colorData = colorData.filter(c => !c.special);
        if (colorData.length === 0) {
            showToast('⚠️ 禁用特殊色后没有可用颜色！请重新开启');
            return;
        }
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

    const grid = [];
    const rawColors = [];
    const colorCount = new Map();

    for (let y = 0; y < rows; y++) {
        const row = [];
        for (let x = 0; x < cols; x++) {
            const idx = (y * cols + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
            if (a < 128) { r = 255; g = 255; b = 255; }
            const rgb = [r, g, b];
            rawColors.push(rgb);
            const matched = findClosestColor(r, g, b, colorData);
            row.push(matched);
            const key = matched.id;
            colorCount.set(key, (colorCount.get(key) || 0) + 1);
        }
        grid.push(row);
    }

    genProgress.style.width = '60%';
    progressText.textContent = '正在应用颜色限制...';

    let finalGrid = grid;
    let finalUsedColors = new Map();

    if (maxColors > 0 && colorCount.size > maxColors) {
        const sorted = Array.from(colorCount.entries()).sort((a, b) => b[1] - a[1]);
        const keepIds = new Set(sorted.slice(0, maxColors).map(item => item[0]));
        const keepColors = colorData.filter(c => keepIds.has(c.id));
        finalGrid = grid.map(row => row.map(cell => {
            if (keepIds.has(cell.id)) return cell;
            const [r, g, b] = hexToRgb(cell.hex);
            return findClosestColor(r, g, b, keepColors);
        }));
        const newCount = new Map();
        finalGrid.forEach(row => row.forEach(cell => {
            newCount.set(cell.id, (newCount.get(cell.id) || 0) + 1);
        }));
        finalUsedColors = newCount;
    } else {
        finalUsedColors = colorCount;
    }

    gridData = finalGrid;
    usedColorsMap = finalUsedColors;

    genProgress.style.width = '80%';
    progressText.textContent = '正在绘制图纸...';

    const cellSize = beadSize;
    const totalW = cellSize * cols;
    const totalH = cellSize * rows;
    if (totalW > 10000 || totalH > 10000) {
        showToast('⚠️ 图纸尺寸过大，请减小网格数或豆子大小');
        return;
    }

    canvas.width = totalW;
    canvas.height = totalH;
    ctx.clearRect(0, 0, totalW, totalH);

    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(0, 0, totalW, totalH);

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const cell = finalGrid[y][x];
            ctx.fillStyle = cell.hex;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            if (showGrid) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
            if (showNumber && cellSize >= 12) {
                const fontSize = Math.min(12, cellSize * 0.45);
                ctx.font = `bold ${fontSize}px "Courier New", monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const [r, g, b] = hexToRgb(cell.hex);
                const brightness = (r*299 + g*587 + b*114) / 1000;
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

    const usedCount = finalUsedColors.size;
    gridInfo.textContent = `网格: ${cols} x ${rows} | 豆子大小: ${cellSize}px | 使用 ${usedCount} 种色号`;
    updateLegend(finalUsedColors);
    updateComparator(finalGrid, rawColors, cols, rows, colorData);
    exportPngBtn.disabled = false;
    exportCszBtn.disabled = false;

    genProgress.style.width = '100%';
    progressText.textContent = '✅ 完成！';
    showToast(`✅ 生成完成！共使用 ${usedCount} 种颜色`);

    autoSaveToLocal();
}

// ===== 颜色匹配 =====
function findClosestColor(r, g, b, colorArray) {
    let minDist = Infinity;
    let best = colorArray[0];
    for (let color of colorArray) {
        const [cr, cg, cb] = hexToRgb(color.hex);
        const dist = (r-cr)**2 + (g-cg)**2 + (b-cb)**2;
        if (dist < minDist) {
            minDist = dist;
            best = color;
        }
    }
    return best;
}

// ===== 工具函数 =====
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1],16), parseInt(result[2],16), parseInt(result[3],16)] : [0,0,0];
}

function rgbToHex(r, g, b) {
    return '#' + [r,g,b].map(c => Math.round(c).toString(16).padStart(2,'0')).join('');
}

function colorDistance(c1, c2) {
    const [r1,g1,b1] = c1;
    const [r2,g2,b2] = c2;
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

// ===== 更新图例 =====
function updateLegend(colorsMap) {
    const arr = Array.from(colorsMap.keys());
    if (arr.length === 0) {
        colorLegend.innerHTML = '<span style="color:#3A3A5A; font-size:12px;">暂无数据</span>';
        return;
    }
    const sorted = Array.from(colorsMap.entries()).sort((a,b) => b[1]-a[1]);
    let html = '';
    sorted.forEach(([id, count]) => {
        const palette = PALETTES[currentPaletteKey];
        const color = palette.colors.find(c => c.id === id);
        if (color) {
            const isSpecial = color.special ? true : false;
            const star = isSpecial ? ' ⭐' : '';
            html += `<div class="legend-item">
                        <span class="legend-color" style="background:${color.hex};"></span>
                        <span class="legend-id">${id} (${count})${star}</span>
                    </div>`;
        }
    });
    colorLegend.innerHTML = html;
}

// ===== 颜色比较器 =====
function updateComparator(grid, rawColors, cols, rows, colorData) {
    const usageMap = new Map();
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const idx = y * cols + x;
            const cell = grid[y][x];
            const rgb = rawColors[idx];
            if (!usageMap.has(cell.id)) {
                usageMap.set(cell.id, { sumR: 0, sumG: 0, sumB: 0, count: 0, hex: cell.hex });
            }
            const stat = usageMap.get(cell.id);
            stat.sumR += rgb[0];
            stat.sumG += rgb[1];
            stat.sumB += rgb[2];
            stat.count++;
        }
    }

    let html = '';
    const sorted = Array.from(usageMap.entries()).sort((a,b) => b[1].count - a[1].count);
    sorted.forEach(([id, stat]) => {
        const avgR = stat.sumR / stat.count;
        const avgG = stat.sumG / stat.count;
        const avgB = stat.sumB / stat.count;
        const avgHex = rgbToHex(avgR, avgG, avgB);
        const [cr, cg, cb] = hexToRgb(stat.hex);
        const dist = colorDistance([avgR, avgG, avgB], [cr, cg, cb]);
        const maxDist = Math.sqrt(255**2 * 3);
        const similarity = Math.max(0, 100 - (dist / maxDist) * 100);
        const simPercent = similarity.toFixed(1);

        const palette = PALETTES[currentPaletteKey];
        const color = palette.colors.find(c => c.id === id);
        const isSpecial = color && color.special ? true : false;
        const star = isSpecial ? ' ⭐' : '';

        html += `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px solid #1A1A2E;">
                    <span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:${avgHex};border:1px solid #3A3A5A;"></span>
                    <span style="font-weight:600;color:#EAEAFF;">${id}${star}</span>
                    <span style="color:#6C6C8A;font-size:11px;">→</span>
                    <span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:${stat.hex};border:1px solid #3A3A5A;"></span>
                    <span style="font-size:11px;color:#A8A8C8;margin-left:auto;">相似度 ${simPercent}%</span>
                </div>`;
    });
    comparatorList.innerHTML = html || '暂无数据';
}

// ===== 画布交互：选中格子 =====
canvas.addEventListener('click', function(e) {
    if (currentTool === 'hand') return;
    if (!gridData.length) {
        showToast('⚠️ 请先生成图纸');
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let mouseX = (e.clientX - rect.left) * scaleX;
    let mouseY = (e.clientY - rect.top) * scaleY;

    mouseX = Math.max(0, Math.min(canvas.width, mouseX));
    mouseY = Math.max(0, Math.min(canvas.height, mouseY));

    const cols = gridData[0] ? gridData[0].length : currentGridCols;
    const rows = gridData.length;
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;
    const x = Math.floor(mouseX / cellW);
    const y = Math.floor(mouseY / cellH);

    if (x >= 0 && x < cols && y >= 0 && y < rows) {
        selectedCell = { x, y };
        selectedCellDisplay.textContent = `(${x+1}, ${y+1})`;
        showToast(`✅ 已选中格子 (${x+1}, ${y+1})，色号：${gridData[y][x].id}`);
        redrawCanvas();
    } else {
        showToast('⚠️ 点击位置超出图纸范围');
    }
});

// ===== 颜色选择器（按钮确认版） =====
function showColorPicker(x, y, colors) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;justify-content:center;align-items:center;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#14142A;padding:20px;border-radius:16px;border:1px solid #2A2A4A;max-width:420px;max-height:80vh;overflow-y:auto;';
    modal.innerHTML = `<div style="font-weight:600;margin-bottom:12px;color:#EAEAFF;">选择新色号 (格子 ${x+1}, ${y+1})</div><div style="display:flex;flex-wrap:wrap;gap:6px;" id="colorGrid"></div>`;
    const colorGrid = modal.querySelector('#colorGrid');
    let selectedColor = null;
    let selectedBtn = null;

    // 添加颜色块
    colors.forEach(c => {
        const btn = document.createElement('button');
        const contrast = getContrastColor(c.hex);
        let borderStyle = '2px solid transparent';
        if (c.special) {
            borderStyle = '2px solid #FFD700';
        }
        btn.style.cssText = `width:40px;height:40px;border-radius:8px;border:${borderStyle};background:${c.hex};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:${contrast};font-weight:bold;`;
        btn.textContent = c.id;
        btn.title = c.id + (c.special ? ' ⭐特殊色' : '');
        btn.addEventListener('click', function(e) {
            // 清除之前的高亮
            if (selectedBtn) {
                selectedBtn.style.outline = 'none';
            }
            this.style.outline = '3px solid #FFFFFF';
            selectedBtn = this;
            selectedColor = c;
            document.getElementById('selectedColorPreview').style.background = c.hex;
            document.getElementById('selectedColorId').textContent = c.id;
        });
        colorGrid.appendChild(btn);
    });

    // 底部操作栏
    const bottomDiv = document.createElement('div');
    bottomDiv.style.cssText = 'margin-top:14px;display:flex;align-items:center;justify-content:space-between;';
    bottomDiv.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:#A8A8C8;">已选：</span>
            <span id="selectedColorPreview" style="display:inline-block;width:28px;height:28px;border-radius:4px;background:transparent;border:1px solid #3A3A5A;"></span>
            <span id="selectedColorId" style="color:#EAEAFF;font-weight:600;">无</span>
        </div>
        <div>
            <button id="confirmColorBtn" style="background:#6C5CE7;color:#fff;border:none;padding:6px 22px;border-radius:30px;cursor:pointer;margin-right:8px;font-weight:bold;">确认</button>
            <button id="cancelColorBtn" style="background:#E74C3C;color:#fff;border:none;padding:6px 22px;border-radius:30px;cursor:pointer;font-weight:bold;">取消</button>
        </div>
    `;
    modal.appendChild(bottomDiv);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 确认按钮
    document.getElementById('confirmColorBtn').addEventListener('click', function() {
        if (!selectedColor) {
            showToast('⚠️ 请先点击选择一个颜色');
            return;
        }
        // 应用颜色
        gridData[y][x] = selectedColor;
        redrawCanvas();
        // 更新统计
        const newCount = new Map();
        gridData.forEach(row => row.forEach(cell => {
            newCount.set(cell.id, (newCount.get(cell.id) || 0) + 1);
        }));
        usedColorsMap = newCount;
        updateLegend(usedColorsMap);
        // 更新比较器
        let html = '';
        const sorted = Array.from(usedColorsMap.entries()).sort((a,b) => b[1]-a[1]);
        sorted.forEach(([id, count]) => {
            const palette = PALETTES[currentPaletteKey];
            const color = palette.colors.find(c => c.id === id);
            if (color) {
                const isSpecial = color.special ? true : false;
                const star = isSpecial ? ' ⭐' : '';
                html += `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
                            <span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:${color.hex};border:1px solid #3A3A5A;"></span>
                            <span style="font-weight:600;color:#EAEAFF;">${id}${star}</span>
                            <span style="font-size:11px;color:#6C6C8A;margin-left:auto;">×${count}</span>
                        </div>`;
            }
        });
        comparatorList.innerHTML = html || '暂无数据';
        showToast(`已将 (${x+1},${y+1}) 改为 ${selectedColor.id}`);
        document.body.removeChild(overlay);
        // 清除选中
        selectedCell = null;
        selectedCellDisplay.textContent = '无';
        redrawCanvas();
    });

    // 取消按钮
    document.getElementById('cancelColorBtn').addEventListener('click', function() {
        document.body.removeChild(overlay);
    });
}

// ===== 重绘画布（含高亮选中） =====
function redrawCanvas() {
    const cols = gridData[0] ? gridData[0].length : currentGridCols;
    const rows = gridData.length;
    const cellSize = beadSize;
    const totalW = cellSize * cols;
    const totalH = cellSize * rows;
    if (totalW > 10000 || totalH > 10000) {
        showToast('⚠️ 图纸尺寸过大，无法显示');
        return;
    }
    canvas.width = totalW;
    canvas.height = totalH;
    ctx.clearRect(0, 0, totalW, totalH);
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(0, 0, totalW, totalH);

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const cell = gridData[y][x];
            ctx.fillStyle = cell.hex;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            if (showGrid) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
            if (showNumber && cellSize >= 12) {
                const fontSize = Math.min(12, cellSize * 0.45);
                ctx.font = `bold ${fontSize}px "Courier New", monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const [r, g, b] = hexToRgb(cell.hex);
                const brightness = (r*299 + g*587 + b*114) / 1000;
                ctx.fillStyle = brightness > 128 ? '#000000' : '#FFFFFF';
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 3;
                ctx.fillText(cell.id, x * cellSize + cellSize/2, y * cellSize + cellSize/2 + 1);
                ctx.shadowBlur = 0;
            }
        }
    }

    // 高亮选中的格子
    if (selectedCell) {
        const {x, y} = selectedCell;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,215,0,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x * cellSize - 2, y * cellSize - 2, cellSize + 4, cellSize + 4);
    }

    applyTransform();
}

// ===== 抓手拖拽 =====
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
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
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

canvas.addEventListener('dragstart', (e) => e.preventDefault());

function getContrastColor(hex) {
    const [r,g,b] = hexToRgb(hex);
    const brightness = (r*299 + g*587 + b*114) / 1000;
    return brightness > 128 ? '#000000' : '#FFFFFF';
}

// ===== 导出 PNG =====
exportPngBtn.addEventListener('click', function() {
    const link = document.createElement('a');
    link.download = `拼豆图纸_${currentGridCols}x${currentGridRows}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('📷 PNG 导出成功！');
});

// ===== 导出 CSZ =====
exportCszBtn.addEventListener('click', function() {
    if (!gridData.length) {
        showToast('⚠️ 请先生成图纸！');
        return;
    }
    let csv = 'PixelBee 拼豆图纸导出文件 (.csz)\n';
    csv += `品牌: ${PALETTES[currentPaletteKey].name}\n`;
    csv += `尺寸: ${currentGridCols} x ${currentGridRows}\n`;
    csv += `色号总数: ${usedColorsMap.size}\n`;
    const now = new Date();
    csv += `导出时间: ${now.toLocaleString()}\n`;
    csv += '--- 色号列表 ---\n';
    const sortedColors = Array.from(usedColorsMap.entries()).sort((a,b) => b[1]-a[1]);
    sortedColors.forEach(([id, count]) => {
        const palette = PALETTES[currentPaletteKey];
        const color = palette.colors.find(c => c.id === id);
        csv += `${id},${color ? color.hex : ''},${count}\n`;
    });
    csv += '--- 网格数据 ---\n';
    for (let y = 0; y < currentGridRows; y++) {
        const row = gridData[y];
        csv += row.map(cell => cell.id).join(',') + '\n';
    }
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = `图纸_${currentGridCols}x${currentGridRows}.csz`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('📊 CSZ 导出成功！可用Excel打开');
});

// ===== 文件管理 =====
function getStorageKey() { return 'pixelbee_saved_files'; }
function getSavedFiles() {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : {};
}
function saveFileList(files) {
    localStorage.setItem(getStorageKey(), JSON.stringify(files));
}
function updateFileList() {
    const files = getSavedFiles();
    const select = fileListSelect;
    select.innerHTML = '<option value="">-- 已保存的图纸 --</option>';
    Object.keys(files).forEach(name => {
        const opt = document.createElement('option');
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
    let name = fileNameInput.value.trim();
    if (!name) {
        name = prompt('请输入图纸名称：', '我的拼豆图纸');
        if (!name) return;
        fileNameInput.value = name;
    }
    const files = getSavedFiles();
    const data = {
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
    showToast(`✅ 图纸 "${name}" 已保存`);
});

loadFileBtn.addEventListener('click', function() {
    const select = fileListSelect;
    const name = select.value;
    if (!name) {
        showToast('⚠️ 请从列表中选择一个图纸');
        return;
    }
    const files = getSavedFiles();
    const data = files[name];
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
    // 重置视图
    panX = 0; panY = 0;
    zoomLevel = 1;
    zoomSlider.value = 100;
    zoomLabel.textContent = '100%';
    selectedCell = null;
    selectedCellDisplay.textContent = '无';
    redrawCanvas();
    updateLegend(usedColorsMap);
    let html = '';
    const sorted = Array.from(usedColorsMap.entries()).sort((a,b) => b[1]-a[1]);
    sorted.forEach(([id, count]) => {
        const palette = PALETTES[currentPaletteKey];
        const color = palette.colors.find(c => c.id === id);
        if (color) {
            const isSpecial = color.special ? true : false;
            const star = isSpecial ? ' ⭐' : '';
            html += `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
                        <span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:${color.hex};border:1px solid #3A3A5A;"></span>
                        <span style="font-weight:600;color:#EAEAFF;">${id}${star}</span>
                        <span style="font-size:11px;color:#6C6C8A;margin-left:auto;">×${count}</span>
                    </div>`;
        }
    });
    comparatorList.innerHTML = html || '暂无数据';
    exportPngBtn.disabled = false;
    exportCszBtn.disabled = false;
    fileNameInput.value = name;
    showToast(`📂 已加载 "${name}"`);
});

deleteFileBtn.addEventListener('click', function() {
    const select = fileListSelect;
    const name = select.value;
    if (!name) {
        showToast('⚠️ 请从列表中选择一个图纸');
        return;
    }
    if (!confirm(`确定要删除 "${name}" 吗？`)) return;
    const files = getSavedFiles();
    delete files[name];
    saveFileList(files);
    updateFileList();
    select.value = '';
    showToast(`🗑️ 已删除 "${name}"`);
});

function autoSaveToLocal() {
    if (!gridData.length) return;
    const files = getSavedFiles();
    const name = '_autosave';
    const data = {
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

// ===== Toast =====
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== 窗口大小变化 =====
window.addEventListener('resize', function() {
    // 不需要重绘，canvas保持原始尺寸
});