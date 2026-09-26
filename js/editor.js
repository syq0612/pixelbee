// ============================================================
// 文件：js/editor.js
// 拼豆图纸转换核心引擎 - 完整修复版
// CIEDE2000 公式修正 + 图片比例保持 + 双冗余安全
// ============================================================

// ============================================================
// 全局错误捕获系统
// ============================================================
const errorLog = [];

function logError(msg, detail) {
    const time = new Date().toLocaleTimeString();
    const entry = { time, msg, detail: detail || '' };
    errorLog.push(entry);
    console.error('[PixelBee Error]', msg, detail);
    const panel = document.getElementById('errorPanel');
    const list = document.getElementById('errorList');
    if (panel && list) {
        panel.classList.add('show');
        const item = document.createElement('div');
        item.className = 'error-item';
        item.innerHTML = `<span class="error-time">${time}</span>${msg}${detail ? '<br><small>' + detail + '</small>' : ''}`;
        list.insertBefore(item, list.firstChild);
        while (list.children.length > 20) {
            list.removeChild(list.lastChild);
        }
    }
}

window.onerror = function(msg, url, line, col, error) {
    logError(msg, `${url}:${line}:${col}`);
    return false;
};

window.onunhandledrejection = function(e) {
    logError('未处理的异步错误', e.reason ? e.reason.message : String(e.reason));
};

// ============================================================
// CIEDE2000 色差公式（完整实现，T 已修正为 0.32）
// ============================================================
function CIEDE2000(L1, a1, b1, L2, a2, b2) {
    const deg2rad = Math.PI / 180;
    const rad2deg = 180 / Math.PI;
    const kL = 1, kC = 1, kH = 1;

    const C1 = Math.sqrt(a1*a1 + b1*b1);
    const C2 = Math.sqrt(a2*a2 + b2*b2);
    const C_bar = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(C_bar, 7) / (Math.pow(C_bar, 7) + Math.pow(25, 7))));
    const a1_prime = (1 + G) * a1;
    const a2_prime = (1 + G) * a2;
    const C1_prime = Math.sqrt(a1_prime*a1_prime + b1*b1);
    const C2_prime = Math.sqrt(a2_prime*a2_prime + b2*b2);
    const h1_prime = (b1 === 0 && a1_prime === 0) ? 0 : Math.atan2(b1, a1_prime) * rad2deg;
    const h2_prime = (b2 === 0 && a2_prime === 0) ? 0 : Math.atan2(b2, a2_prime) * rad2deg;
    const h1_prime_deg = h1_prime < 0 ? h1_prime + 360 : h1_prime;
    const h2_prime_deg = h2_prime < 0 ? h2_prime + 360 : h2_prime;

    const dL_prime = L2 - L1;
    const dC_prime = C2_prime - C1_prime;
    let dh_prime;
    if (C1_prime === 0 || C2_prime === 0) {
        dh_prime = 0;
    } else {
        const diff = h2_prime_deg - h1_prime_deg;
        if (diff > 180) dh_prime = diff - 360;
        else if (diff < -180) dh_prime = diff + 360;
        else dh_prime = diff;
    }
    const dH_prime = 2 * Math.sqrt(C1_prime * C2_prime) * Math.sin(dh_prime * deg2rad / 2);

    const L_bar_prime = (L1 + L2) / 2;
    const C_bar_prime = (C1_prime + C2_prime) / 2;
    let h_bar_prime;
    if (C1_prime === 0 || C2_prime === 0) {
        h_bar_prime = h1_prime_deg + h2_prime_deg;
    } else {
        const diff = Math.abs(h1_prime_deg - h2_prime_deg);
        if (diff > 180) {
            const sum = h1_prime_deg + h2_prime_deg;
            h_bar_prime = (sum < 360) ? (sum + 360) / 2 : (sum - 360) / 2;
        } else {
            h_bar_prime = (h1_prime_deg + h2_prime_deg) / 2;
        }
    }

    // ✅ 正确的 T 公式（第三项系数 0.32）
    const T = 1 -
        0.17 * Math.cos((h_bar_prime - 30) * deg2rad) +
        0.24 * Math.cos((2 * h_bar_prime) * deg2rad) +
        0.32 * Math.cos((3 * h_bar_prime + 6) * deg2rad) -
        0.20 * Math.cos((4 * h_bar_prime - 63) * deg2rad);

    const dTheta = 30 * Math.exp(-Math.pow((h_bar_prime - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(C_bar_prime, 7) / (Math.pow(C_bar_prime, 7) + Math.pow(25, 7)));
    const SL = 1 + (0.015 * Math.pow(L_bar_prime - 50, 2)) / Math.sqrt(20 + Math.pow(L_bar_prime - 50, 2));
    const SC = 1 + 0.045 * C_bar_prime;
    const SH = 1 + 0.015 * C_bar_prime * T;
    const RT = -Math.sin(2 * dTheta * deg2rad) * Rc;

    const dE = Math.sqrt(
        Math.pow(dL_prime / (kL * SL), 2) +
        Math.pow(dC_prime / (kC * SC), 2) +
        Math.pow(dH_prime / (kH * SH), 2) +
        RT * (dC_prime / (kC * SC)) * (dH_prime / (kH * SH))
    );
    return dE;
}

// ============================================================
// RGB <-> Lab 转换
// ============================================================
function rgbToLab(r, g, b) {
    let R = r / 255, G = g / 255, B = b / 255;
    R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
    G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
    B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;
    const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
    const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
    const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
    const refX = 0.95047, refY = 1.0, refZ = 1.08883;
    const fx = X / refX, fy = Y / refY, fz = Z / refZ;
    const f = (t) => t > 0.008856 ? Math.pow(t, 1/3) : (7.787 * t + 16/116);
    const L = 116 * f(fy) - 16;
    const a = 500 * (f(fx) - f(fy));
    const b_lab = 200 * (f(fy) - f(fz));
    return [L, a, b_lab];
}

function hexToLab(hex) {
    const rgb = hexToRgb(hex);
    return rgbToLab(rgb[0], rgb[1], rgb[2]);
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1],16), parseInt(result[2],16), parseInt(result[3],16)] : [0,0,0];
}

function rgbToHex(r, g, b) {
    return '#' + [r,g,b].map(c => Math.round(c).toString(16).padStart(2,'0')).join('');
}

// 备用匹配算法（加权欧几里得）
function weightedEuclideanDist(L1, a1, b1, L2, a2, b2) {
    const dL = L1 - L2, da = a1 - a2, db = b1 - b2;
    return Math.sqrt(dL*dL * 1.2 + da*da + db*db);
}

// ============================================================
// 全局状态
// ============================================================
let uploadedImage = null;
let currentGridCols = 29;
let currentGridRows = 29;
let currentPaletteKey = '';
let currentSet = 'all';
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

let excludedColors = [];

// 冗余备份
let lastSuccessData = null;
let lastSuccessConfig = null;
let backupGridData = [];
let backupUsedColors = new Map();

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
const setSelect = document.getElementById('setSelect');
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

const excludeColorInput = document.getElementById('excludeColorInput');
const addExcludeBtn = document.getElementById('addExcludeBtn');
const excludedColorList = document.getElementById('excludedColorList');

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const fileNameInput = document.getElementById('fileNameInput');
const saveFileBtn = document.getElementById('saveFileBtn');
const loadFileBtn = document.getElementById('loadFileBtn');
const deleteFileBtn = document.getElementById('deleteFileBtn');
const fileListSelect = document.getElementById('fileListSelect');

let isAspectLocked = true;

// ============================================================
// 状态指示器
// ============================================================
function setStatus(state, msg) {
    if (!statusDot || !statusText) return;
    const colors = {
        'idle': '#4CAF50',
        'loading': '#FFC107',
        'processing': '#FF9800',
        'error': '#F44336',
        'success': '#4CAF50',
        'warning': '#FFC107'
    };
    statusDot.style.background = colors[state] || '#6C6C8A';
    statusText.textContent = msg || '就绪';
}

// ============================================================
// 颜色工具
// ============================================================
function getColorsForSet(palette, setKey) {
    try {
        if (!palette || !palette.sets) return [];
        const setKeys = Object.keys(palette.sets);
        if (setKeys.length === 0) return [];

        if (setKey === 'all') {
            const allColors = [];
            setKeys.forEach(key => {
                const arr = palette.sets[key];
                if (Array.isArray(arr)) {
                    arr.forEach(color => {
                        if (!allColors.some(c => c.id === color.id)) {
                            allColors.push(color);
                        }
                    });
                }
            });
            return allColors;
        }

        const targetIndex = setKeys.indexOf(setKey);
        if (targetIndex === -1) return [];

        const result = [];
        for (let i = 0; i <= targetIndex; i++) {
            const key = setKeys[i];
            const arr = palette.sets[key];
            if (Array.isArray(arr)) {
                arr.forEach(color => {
                    if (!result.some(c => c.id === color.id)) {
                        result.push(color);
                    }
                });
            }
        }
        return result;
    } catch (e) {
        console.error('getColorsForSet 出错:', e);
        return [];
    }
}

function getAvailableColors(palette, setKey) {
    let colors = getColorsForSet(palette, setKey);
    if (excludedColors.length > 0) {
        colors = colors.filter(c => !excludedColors.includes(c.id));
    }
    return colors;
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
// 豆子大小滑块（不自动生成）
// ============================================================
beadSizeSlider.addEventListener('input', function() {
    beadSize = parseInt(this.value);
    beadSizeLabel.textContent = beadSize;
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
            setStatus('idle', '图片已上传，点击生成');
            showToast('✅ 图片上传成功！请点击“生成”按钮');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ============================================================
// 图纸尺寸（不自动生成）
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
});

lockAspectBtn.addEventListener('click', function() {
    isAspectLocked = !isAspectLocked;
    this.textContent = isAspectLocked ? '🔒' : '🔓';
    if (isAspectLocked && uploadedImage) {
        const w = parseInt(customWidth.value) || 29;
        const h = Math.round(w / imageAspectRatio);
        customHeight.value = h;
        currentGridRows = h;
    }
});

// ============================================================
// 套装选择（不自动生成）
// ============================================================
setSelect.addEventListener('change', function() {
    currentSet = this.value;
});

// ============================================================
// 最大颜色数（不自动生成）
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
});
customMaxColors.addEventListener('change', function() {
    currentMaxColors = parseInt(this.value) || 0;
});

// ============================================================
// 显示选项
// ============================================================
showNumberCheck.addEventListener('change', function() {
    showNumber = this.checked;
    if (gridData.length) redrawCanvas();
});
showGridCheck.addEventListener('change', function() {
    showGrid = this.checked;
    if (gridData.length) redrawCanvas();
});

// ============================================================
// 排除色号管理
// ============================================================
function updateExcludedListUI() {
    excludedColorList.innerHTML = '';
    if (excludedColors.length === 0) {
        excludedColorList.innerHTML = '<span style="color:#8aa8bc;">暂无排除色号</span>';
        return;
    }
    excludedColors.forEach(id => {
        const span = document.createElement('span');
        span.style.cssText = 'background:rgba(200,220,235,0.5);padding:2px 8px;border-radius:12px;display:inline-flex;align-items:center;gap:4px;';
        span.innerHTML = id + ' <button data-id="' + id + '" class="remove-exclude-btn" style="background:none;border:none;color:#c86070;cursor:pointer;font-size:12px;">✕</button>';
        excludedColorList.appendChild(span);
    });
    document.querySelectorAll('.remove-exclude-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.dataset.id;
            excludedColors = excludedColors.filter(c => c !== id);
            updateExcludedListUI();
        });
    });
}

addExcludeBtn.addEventListener('click', function() {
    const id = excludeColorInput.value.trim().toUpperCase();
    if (!id) {
        showToast('⚠️ 请输入色号');
        return;
    }
    const palette = PALETTES[currentPaletteKey];
    if (!palette) {
        showToast('⚠️ 请先选择品牌');
        return;
    }
    const allColors = getColorsForSet(palette, 'all');
    const exists = allColors.some(c => c.id === id);
    if (!exists) {
        showToast('⚠️ 色号 ' + id + ' 不存在');
        return;
    }
    if (excludedColors.includes(id)) {
        showToast('⚠️ 色号 ' + id + ' 已在排除列表');
        return;
    }
    excludedColors.push(id);
    updateExcludedListUI();
    excludeColorInput.value = '';
    showToast('✅ 已排除 ' + id);
});

updateExcludedListUI();

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
// 生成按钮 - 唯一触发生成的地方
// ============================================================
generateBtn.addEventListener('click', function() {
    if (!uploadedImage) {
        showToast('⚠️ 请先上传图片！');
        return;
    }
    if (isGenerating) {
        showToast('⏳ 正在生成中，请稍候...');
        return;
    }
    generateGrid();
});

// ============================================================
// 核心生成函数（双冗余安全版）
// ============================================================
function generateGrid() {
    if (!uploadedImage || isGenerating) return;

    isGenerating = true;
    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ 生成中...';
    setStatus('processing', '正在生成...');

    const controls = [brandSelect, setSelect, boardSizeSelect, beadSizeSlider, maxColorsSelect, showNumberCheck, showGridCheck];
    controls.forEach(ctrl => { if (ctrl) ctrl.disabled = true; });

    progressContainer.style.display = 'block';
    genProgress.style.width = '0%';
    progressText.textContent = '正在准备...';

    exportPngBtn.disabled = true;
    exportCszBtn.disabled = true;

    const currentConfig = {
        cols: currentGridCols,
        rows: currentGridRows,
        palette: currentPaletteKey,
        set: currentSet,
        maxColors: currentMaxColors,
        beadSize: beadSize,
        excluded: [...excludedColors]
    };

    const timeoutId = setTimeout(() => {
        if (isGenerating) {
            console.warn('⚠️ 生成超时，强制终止');
            showToast('⚠️ 生成超时，请重试');
            finishGeneration(false);
        }
    }, 60000);

    setTimeout(() => {
        try {
            const result = doGenerateCIEDE2000(currentConfig);
            if (result.success) {
                lastSuccessData = {
                    gridData: gridData,
                    usedColorsMap: usedColorsMap,
                    timestamp: Date.now()
                };
                lastSuccessConfig = currentConfig;
                setStatus('success', '生成成功');
                finishGeneration(true);
                clearTimeout(timeoutId);
                return;
            } else {
                console.warn('主方案失败:', result.error);
                setStatus('warning', '主方案失败，切换备用方案...');
                showToast('⚠️ 主方案遇到问题，正在切换备用方案...');
            }
        } catch (e) {
            console.error('主方案异常:', e);
            setStatus('error', '主方案异常，尝试备用...');
        }

        try {
            const result = doGenerateFallback(currentConfig);
            if (result.success) {
                lastSuccessData = {
                    gridData: gridData,
                    usedColorsMap: usedColorsMap,
                    timestamp: Date.now()
                };
                lastSuccessConfig = currentConfig;
                setStatus('warning', '备用方案完成（部分精度降低）');
                showToast('✅ 备用方案生成完成（颜色精度略有降低）');
                finishGeneration(true);
                clearTimeout(timeoutId);
                return;
            } else {
                console.error('备用方案也失败:', result.error);
                setStatus('error', '所有方案失败');
                showToast('❌ 生成失败：' + result.error);
                finishGeneration(false);
                clearTimeout(timeoutId);
                return;
            }
        } catch (e) {
            console.error('备用方案异常:', e);
            setStatus('error', '生成异常');
            showToast('❌ 生成异常：' + e.message);
            finishGeneration(false);
            clearTimeout(timeoutId);
        }
    }, 50);
}

// ============================================================
// 主生成方案（CIEDE2000）
// ============================================================
function doGenerateCIEDE2000(config) {
    try {
        const cols = config.cols;
        const rows = config.rows;

        const palette = PALETTES[config.palette];
        if (!palette) return { success: false, error: '未找到品牌色板' };

        let colorData = getAvailableColors(palette, config.set);
        if (!colorData || colorData.length === 0) {
            return { success: false, error: '没有可用颜色' };
        }

        // ===== 采样图片：保持原图比例，居中留白 =====
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = cols;
        tempCanvas.height = rows;

        const imgAspect = uploadedImage.width / uploadedImage.height;
        const gridAspect = cols / rows;

        let drawW, drawH, offsetX = 0, offsetY = 0;

        if (imgAspect > gridAspect) {
            drawW = cols;
            drawH = cols / imgAspect;
            offsetY = (rows - drawH) / 2;
        } else {
            drawH = rows;
            drawW = rows * imgAspect;
            offsetX = (cols - drawW) / 2;
        }

        tempCtx.fillStyle = '#FFFFFF';
        tempCtx.fillRect(0, 0, cols, rows);
        tempCtx.drawImage(uploadedImage, offsetX, offsetY, drawW, drawH);

        const imageData = tempCtx.getImageData(0, 0, cols, rows);
        const data = imageData.data;

        // 统计像素颜色
        const pixelMap = new Map();
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const idx = (y * cols + x) * 4;
                let r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
                if (a < 128) { r = 255; g = 255; b = 255; }
                const key = r + ',' + g + ',' + b;
                pixelMap.set(key, (pixelMap.get(key) || 0) + 1);
            }
        }
        const pixelEntries = Array.from(pixelMap.entries());

        const pixelLabs = pixelEntries.map(([key, count]) => {
            const [r, g, b] = key.split(',').map(Number);
            const lab = rgbToLab(r, g, b);
            return { L: lab[0], a: lab[1], b: lab[2], count, r, g, b };
        });
        pixelLabs.sort((a, b) => b.count - a.count);

        const colorLabs = colorData.map(c => {
            const lab = hexToLab(c.hex);
            return { id: c.id, hex: c.hex, L: lab[0], a: lab[1], b: lab[2] };
        });

        let selectedColors = colorLabs;
        if (config.maxColors > 0 && config.maxColors < colorLabs.length) {
            const topPixels = pixelLabs.slice(0, 50);
            const scored = colorLabs.map(cl => {
                let totalDist = 0;
                let totalWeight = 0;
                for (const p of topPixels) {
                    const dE = CIEDE2000(cl.L, cl.a, cl.b, p.L, p.a, p.b);
                    totalDist += dE * dE * p.count;
                    totalWeight += p.count;
                }
                const avgDist = totalWeight > 0 ? Math.sqrt(totalDist / totalWeight) : Infinity;
                return { color: cl, score: avgDist };
            });
            scored.sort((a, b) => a.score - b.score);
            selectedColors = scored.slice(0, config.maxColors).map(item => item.color);
        }

        const grid = [];
        const rawColors = [];
        const colorCount = new Map();
        const THRESHOLD = 20;

        for (let y = 0; y < rows; y++) {
            const row = [];
            for (let x = 0; x < cols; x++) {
                const idx = (y * cols + x) * 4;
                const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
                const pixelLab = rgbToLab(
                    a < 128 ? 255 : r,
                    a < 128 ? 255 : g,
                    a < 128 ? 255 : b
                );
                rawColors.push([r, g, b]);

                let bestColor = null;
                let bestDist = Infinity;
                for (const cl of selectedColors) {
                    const dE = CIEDE2000(pixelLab[0], pixelLab[1], pixelLab[2], cl.L, cl.a, cl.b);
                    if (dE < bestDist) {
                        bestDist = dE;
                        bestColor = cl;
                    }
                }

                if (bestDist > THRESHOLD) {
                    let secondBest = null;
                    let secondDist = Infinity;
                    for (const cl of selectedColors) {
                        if (cl.id === bestColor.id) continue;
                        const dE = CIEDE2000(pixelLab[0], pixelLab[1], pixelLab[2], cl.L, cl.a, cl.b);
                        if (dE < secondDist) {
                            secondDist = dE;
                            secondBest = cl;
                        }
                    }
                    if (secondBest && secondDist < bestDist * 1.2) {
                        bestColor = secondBest;
                        bestDist = secondDist;
                    }
                }

                row.push({ id: bestColor.id, hex: bestColor.hex });
                colorCount.set(bestColor.id, (colorCount.get(bestColor.id) || 0) + 1);
            }
            grid.push(row);
        }

        gridData = grid;
        usedColorsMap = colorCount;

        const cellSize = config.beadSize;
        const totalW = cellSize * cols;
        const totalH = cellSize * rows;
        if (totalW > 10000 || totalH > 10000) {
            return { success: false, error: '图纸尺寸过大' };
        }

        canvas.width = totalW;
        canvas.height = totalH;
        canvas.style.width = totalW + 'px';
        canvas.style.height = totalH + 'px';
        ctx.clearRect(0, 0, totalW, totalH);
        ctx.fillStyle = '#1A1A2E';
        ctx.fillRect(0, 0, totalW, totalH);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const cell = grid[y][x];
                ctx.fillStyle = cell.hex;
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                if (showGrid) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
                }
                if (showNumber && cellSize >= 12) {
                    const fontSize = Math.min(12, cellSize * 0.45);
                    ctx.font = 'bold ' + fontSize + 'px "Courier New", monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const rgb3 = hexToRgb(cell.hex);
                    const brightness = (rgb3[0]*299 + rgb3[1]*587 + rgb3[2]*114) / 1000;
                    ctx.fillStyle = brightness > 128 ? '#000000' : '#FFFFFF';
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 3;
                    ctx.fillText(cell.id, x * cellSize + cellSize/2, y * cellSize + cellSize/2 + 1);
                    ctx.shadowBlur = 0;
                }
            }
        }

        gridInfo.textContent = '网格: ' + cols + ' x ' + rows + ' | 豆子大小: ' + cellSize + 'px | 使用 ' + colorCount.size + ' 种色号';
        updateLegend(colorCount);
        updateComparator(grid, rawColors, cols, rows, selectedColors);

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// 备用生成方案（加权欧几里得）
// ============================================================
function doGenerateFallback(config) {
    try {
        const cols = config.cols;
        const rows = config.rows;

        const palette = PALETTES[config.palette];
        if (!palette) return { success: false, error: '未找到品牌色板' };

        let colorData = getAvailableColors(palette, config.set);
        if (!colorData || colorData.length === 0) {
            return { success: false, error: '没有可用颜色' };
        }

        // ===== 采样图片：保持原图比例，居中留白 =====
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = cols;
        tempCanvas.height = rows;

        const imgAspect = uploadedImage.width / uploadedImage.height;
        const gridAspect = cols / rows;

        let drawW, drawH, offsetX = 0, offsetY = 0;

        if (imgAspect > gridAspect) {
            drawW = cols;
            drawH = cols / imgAspect;
            offsetY = (rows - drawH) / 2;
        } else {
            drawH = rows;
            drawW = rows * imgAspect;
            offsetX = (cols - drawW) / 2;
        }

        tempCtx.fillStyle = '#FFFFFF';
        tempCtx.fillRect(0, 0, cols, rows);
        tempCtx.drawImage(uploadedImage, offsetX, offsetY, drawW, drawH);

        const imageData = tempCtx.getImageData(0, 0, cols, rows);
        const data = imageData.data;

        const pixelMap = new Map();
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const idx = (y * cols + x) * 4;
                let r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
                if (a < 128) { r = 255; g = 255; b = 255; }
                const key = r + ',' + g + ',' + b;
                pixelMap.set(key, (pixelMap.get(key) || 0) + 1);
            }
        }
        const pixelEntries = Array.from(pixelMap.entries());
        const pixelLabs = pixelEntries.map(([key, count]) => {
            const [r, g, b] = key.split(',').map(Number);
            const lab = rgbToLab(r, g, b);
            return { L: lab[0], a: lab[1], b: lab[2], count };
        });
        pixelLabs.sort((a, b) => b.count - a.count);

        const colorLabs = colorData.map(c => {
            const lab = hexToLab(c.hex);
            return { id: c.id, hex: c.hex, L: lab[0], a: lab[1], b: lab[2] };
        });

        let selectedColors = colorLabs;
        if (config.maxColors > 0 && config.maxColors < colorLabs.length) {
            const topPixels = pixelLabs.slice(0, 50);
            const scored = colorLabs.map(cl => {
                let totalDist = 0;
                let totalWeight = 0;
                for (const p of topPixels) {
                    const d = weightedEuclideanDist(cl.L, cl.a, cl.b, p.L, p.a, p.b);
                    totalDist += d * d * p.count;
                    totalWeight += p.count;
                }
                const avgDist = totalWeight > 0 ? Math.sqrt(totalDist / totalWeight) : Infinity;
                return { color: cl, score: avgDist };
            });
            scored.sort((a, b) => a.score - b.score);
            selectedColors = scored.slice(0, config.maxColors).map(item => item.color);
        }

        const grid = [];
        const rawColors = [];
        const colorCount = new Map();
        const cellSize = config.beadSize;
        const totalW = cellSize * cols;
        const totalH = cellSize * rows;
        if (totalW > 10000 || totalH > 10000) {
            return { success: false, error: '图纸尺寸过大' };
        }

        for (let y = 0; y < rows; y++) {
            const row = [];
            for (let x = 0; x < cols; x++) {
                const idx = (y * cols + x) * 4;
                const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
                const pixelLab = rgbToLab(
                    a < 128 ? 255 : r,
                    a < 128 ? 255 : g,
                    a < 128 ? 255 : b
                );
                rawColors.push([r, g, b]);

                let bestColor = null;
                let bestDist = Infinity;
                for (const cl of selectedColors) {
                    const d = weightedEuclideanDist(pixelLab[0], pixelLab[1], pixelLab[2], cl.L, cl.a, cl.b);
                    if (d < bestDist) {
                        bestDist = d;
                        bestColor = cl;
                    }
                }
                row.push({ id: bestColor.id, hex: bestColor.hex });
                colorCount.set(bestColor.id, (colorCount.get(bestColor.id) || 0) + 1);
            }
            grid.push(row);
        }

        gridData = grid;
        usedColorsMap = colorCount;

        canvas.width = totalW;
        canvas.height = totalH;
        canvas.style.width = totalW + 'px';
        canvas.style.height = totalH + 'px';
        ctx.clearRect(0, 0, totalW, totalH);
        ctx.fillStyle = '#1A1A2E';
        ctx.fillRect(0, 0, totalW, totalH);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const cell = grid[y][x];
                ctx.fillStyle = cell.hex;
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                if (showGrid) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
                }
                if (showNumber && cellSize >= 12) {
                    const fontSize = Math.min(12, cellSize * 0.45);
                    ctx.font = 'bold ' + fontSize + 'px "Courier New", monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const rgb3 = hexToRgb(cell.hex);
                    const brightness = (rgb3[0]*299 + rgb3[1]*587 + rgb3[2]*114) / 1000;
                    ctx.fillStyle = brightness > 128 ? '#000000' : '#FFFFFF';
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 3;
                    ctx.fillText(cell.id, x * cellSize + cellSize/2, y * cellSize + cellSize/2 + 1);
                    ctx.shadowBlur = 0;
                }
            }
        }

        gridInfo.textContent = '网格: ' + cols + ' x ' + rows + ' | 豆子大小: ' + cellSize + 'px | 使用 ' + colorCount.size + ' 种色号 (备用模式)';
        updateLegend(colorCount);
        updateComparator(grid, rawColors, cols, rows, selectedColors);

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// 结束生成
// ============================================================
function finishGeneration(success) {
    isGenerating = false;
    generateBtn.disabled = false;
    generateBtn.textContent = '⚡ 生成拼豆图纸';

    const controls = [brandSelect, setSelect, boardSizeSelect, beadSizeSlider, maxColorsSelect, showNumberCheck, showGridCheck];
    controls.forEach(ctrl => { if (ctrl) ctrl.disabled = false; });

    if (success) {
        exportPngBtn.disabled = false;
        exportCszBtn.disabled = false;
        setStatus('success', '生成成功');
    } else {
        exportPngBtn.disabled = true;
        exportCszBtn.disabled = true;
        if (backupGridData.length > 0) {
            gridData = backupGridData;
            usedColorsMap = backupUsedColors;
            redrawCanvas();
            setStatus('warning', '已恢复上次有效数据');
            showToast('⚠️ 已回退到上次成功生成的图纸');
        }
    }
}

// ============================================================
// 更新图例
// ============================================================
function updateLegend(colorsMap) {
    const arr = Array.from(colorsMap.keys());
    if (arr.length === 0) {
        colorLegend.innerHTML = '<span style="color:#a8bcc8; font-size:12px;">暂无数据</span>';
        return;
    }
    const sorted = Array.from(colorsMap.entries()).sort((a,b) => b[1]-a[1]);
    let html = '';
    const palette = PALETTES[currentPaletteKey];
    const allColors = getColorsForSet(palette, 'all');
    sorted.forEach(([id, count]) => {
        const color = allColors.find(c => c.id === id);
        if (color) {
            html += `<div class="legend-item">
                        <span class="legend-color" style="background:${color.hex};"></span>
                        <span class="legend-id">${id} (${count})</span>
                    </div>`;
        }
    });
    colorLegend.innerHTML = html;
}

// ============================================================
// 颜色比较器
// ============================================================
function updateComparator(grid, rawColors, cols, rows, selectedColors) {
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
    const palette = PALETTES[currentPaletteKey];
    const allColors = getColorsForSet(palette, 'all');
    sorted.forEach(([id, stat]) => {
        const avgR = stat.sumR / stat.count;
        const avgG = stat.sumG / stat.count;
        const avgB = stat.sumB / stat.count;
        const avgHex = rgbToHex(avgR, avgG, avgB);
        const color = allColors.find(c => c.id === id);
        if (color) {
            const dist = CIEDE2000(
                ...rgbToLab(avgR, avgG, avgB),
                ...hexToLab(color.hex)
            );
            const maxDist = 100;
            const similarity = Math.max(0, 100 - (dist / maxDist) * 100);
            const simPercent = similarity.toFixed(1);
            html += `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px solid rgba(200,220,235,0.3);">
                        <span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:${avgHex};border:1px solid rgba(255,255,255,0.8);"></span>
                        <span style="font-weight:600;color:#4a6a80;">${id}</span>
                        <span style="color:#8aa8bc;font-size:11px;">→</span>
                        <span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:${color.hex};border:1px solid rgba(255,255,255,0.8);"></span>
                        <span style="font-size:11px;color:#7a9aac;margin-left:auto;">相似度 ${simPercent}%</span>
                    </div>`;
        }
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

// ============================================================
// 换色按钮
// ============================================================
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
    let colors = getAvailableColors(palette, currentSet);
    if (!colors || colors.length === 0) {
        colors = getColorsForSet(palette, 'all');
    }
    if (!colors || colors.length === 0) {
        showToast('⚠️ 没有可用的颜色');
        return;
    }
    showColorPicker(selectedCell.x, selectedCell.y, colors);
});

// ============================================================
// 颜色选择器
// ============================================================
// ============================================================
// 颜色选择器（三段式布局，色块再多也不会挤走按钮）
// ============================================================
function showColorPicker(x, y, colors) {
    try {
        // 关闭已存在的选择器
        const existing = document.getElementById('pixelbeeColorPicker');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'pixelbeeColorPicker';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;justify-content:center;align-items:center;padding:20px;box-sizing:border-box;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(145deg,#f5fafd,#eaf3f9);border-radius:20px;border:1px solid rgba(255,255,255,0.9);width:100%;max-width:520px;height:100%;max-height:620px;display:flex;flex-direction:column;box-shadow:0 16px 48px rgba(0,0,0,0.35);overflow:hidden;';

        // ===== 标题区 =====
        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px;font-weight:600;color:#4a6a80;font-size:16px;border-bottom:1px solid rgba(200,220,235,0.5);flex-shrink:0;';
        header.textContent = `选择新色号（格子 ${x + 1}, ${y + 1}）`;

        // ===== 色块区（独立滚动） =====
        const body = document.createElement('div');
        body.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start;background:rgba(255,255,255,0.3);';

        let selectedColor = null;
        let selectedBtn = null;

        colors.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const contrast = getContrastColor(c.hex);
            btn.style.cssText = `width:44px;height:44px;border-radius:10px;border:2px solid rgba(255,255,255,0.8);background:${c.hex};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:${contrast};font-weight:bold;padding:0;flex-shrink:0;box-shadow:0 2px 6px rgba(160,200,225,0.2);transition:transform 0.15s,outline 0.15s;`;
            btn.textContent = c.id;
            btn.title = c.id;

            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                if (selectedBtn) {
                    selectedBtn.style.outline = 'none';
                    selectedBtn.style.transform = 'scale(1)';
                }
                this.style.outline = '3px solid #7fb8d4';
                this.style.transform = 'scale(1.1)';
                selectedBtn = this;
                selectedColor = c;

                const preview = document.getElementById('pbPreview');
                const idEl = document.getElementById('pbSelectedId');
                if (preview) preview.style.background = c.hex;
                if (idEl) idEl.textContent = c.id;
            });

            body.appendChild(btn);
        });

        // ===== 底部按钮区（固定，不会被挤走） =====
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid rgba(200,220,235,0.5);flex-shrink:0;background:rgba(255,255,255,0.6);';
        footer.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="color:#7a9aac;font-size:13px;">已选：</span>
                <span id="pbPreview" style="display:inline-block;width:28px;height:28px;border-radius:6px;background:transparent;border:1px solid rgba(150,180,200,0.5);"></span>
                <span id="pbSelectedId" style="color:#4a6a80;font-weight:600;font-size:14px;">无</span>
            </div>
            <div style="display:flex;gap:8px;">
                <button type="button" id="pbConfirmBtn" style="background:linear-gradient(135deg,#a8d4e8,#7fb8d4);color:#fff;border:none;padding:8px 22px;border-radius:30px;cursor:pointer;font-weight:bold;font-size:13px;box-shadow:0 4px 12px rgba(127,184,212,0.3);">确认</button>
                <button type="button" id="pbCancelBtn" style="background:linear-gradient(135deg,#f0a8b0,#e88898);color:#fff;border:none;padding:8px 22px;border-radius:30px;cursor:pointer;font-weight:bold;font-size:13px;box-shadow:0 4px 12px rgba(232,136,152,0.3);">取消</button>
            </div>
        `;

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // ===== 确认按钮 =====
        document.getElementById('pbConfirmBtn').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (!selectedColor) {
                showToast('⚠️ 请先点击选择一个颜色');
                return;
            }

            // 严格边界检查
            if (!gridData[y] || !gridData[y][x]) {
                showToast('⚠️ 格子数据异常，请重新生成图纸');
                overlay.remove();
                return;
            }

            // 替换颜色
            gridData[y][x] = { id: selectedColor.id, hex: selectedColor.hex };

            // 重新统计
            const newCount = new Map();
            gridData.forEach(row => row.forEach(cell => {
                newCount.set(cell.id, (newCount.get(cell.id) || 0) + 1);
            }));
            usedColorsMap = newCount;

            // 刷新界面
            updateLegend(usedColorsMap);
            redrawCanvas();

            // 更新比较器（容错）
            try {
                const rawColors = [];
                for (let yy = 0; yy < gridData.length; yy++) {
                    for (let xx = 0; xx < gridData[0].length; xx++) {
                        rawColors.push([0, 0, 0]);
                    }
                }
                updateComparator(gridData, rawColors, gridData[0].length, gridData.length, colors);
            } catch (e) {
                // 比较器失败不影响主功能
            }

            showToast(`✅ 已将 (${x + 1}, ${y + 1}) 改为 ${selectedColor.id}`);
            overlay.remove();
            selectedCell = null;
            selectedCellDisplay.textContent = '无';
            redrawCanvas();
        });

        // ===== 取消按钮 =====
        document.getElementById('pbCancelBtn').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            overlay.remove();
        });

        // ===== 点击遮罩关闭 =====
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });

    } catch (err) {
        logError('显示换色器失败', err.message);
    }
}

// ============================================================
// 重绘画布
// ============================================================
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
                const rgb = hexToRgb(cell.hex);
                const brightness = (rgb[0]*299 + rgb[1]*587 + rgb[2]*114) / 1000;
                ctx.fillStyle = brightness > 128 ? '#000000' : '#FFFFFF';
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 3;
                ctx.fillText(cell.id, x * cellSize + cellSize/2, y * cellSize + cellSize/2 + 1);
                ctx.shadowBlur = 0;
            }
        }
    }

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

function getContrastColor(hex) {
    const rgb = hexToRgb(hex);
    const brightness = (rgb[0]*299 + rgb[1]*587 + rgb[2]*114) / 1000;
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
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        panX = startPanX + dx;
        panY = startPanY + dy;
        applyTransform();
        e.preventDefault();
    }
});

canvas.addEventListener('mouseup', function() {
    if (isPanning) {
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

// ============================================================
// 导出 PNG
// ============================================================
exportPngBtn.addEventListener('click', function() {
    if (!gridData.length) {
        showToast('⚠️ 请先生成图纸再导出');
        return;
    }
    const link = document.createElement('a');
    link.download = `拼豆图纸_${currentGridCols}x${currentGridRows}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('📷 PNG 导出成功！');
});

// ============================================================
// 导出 CSZ
// ============================================================
exportCszBtn.addEventListener('click', function() {
    if (!gridData.length) {
        showToast('⚠️ 请先生成图纸再导出');
        return;
    }
    let csv = 'PixelBee 拼豆图纸导出文件 (.csz)\n';
    csv += `品牌: ${PALETTES[currentPaletteKey].name}\n`;
    csv += `套装: ${currentSet === 'all' ? '不限' : currentSet + '色套装'}\n`;
    csv += `尺寸: ${currentGridCols} x ${currentGridRows}\n`;
    csv += `色号总数: ${usedColorsMap.size}\n`;
    csv += `排除色号: ${excludedColors.join(', ') || '无'}\n`;
    const now = new Date();
    csv += `导出时间: ${now.toLocaleString()}\n`;
    csv += '--- 色号列表 ---\n';
    const sortedColors = Array.from(usedColorsMap.entries()).sort((a,b) => b[1]-a[1]);
    const palette = PALETTES[currentPaletteKey];
    const allColors = getColorsForSet(palette, 'all');
    sortedColors.forEach(([id, count]) => {
        const color = allColors.find(c => c.id === id);
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

// ============================================================
// 文件管理
// ============================================================
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
        set: currentSet,
        grid: gridData,
        usedColors: Array.from(usedColorsMap.entries()),
        beadSize: beadSize,
        excluded: excludedColors,
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
    if (!data.grid || !data.usedColors) {
        showToast('⚠️ 图纸数据损坏，无法加载');
        return;
    }
    currentGridCols = data.cols;
    currentGridRows = data.rows;
    currentPaletteKey = data.palette;
    currentSet = data.set || 'all';
    gridData = data.grid;
    usedColorsMap = new Map(data.usedColors);
    if (data.beadSize) {
        beadSize = data.beadSize;
        beadSizeSlider.value = beadSize;
        beadSizeLabel.textContent = beadSize;
    }
    if (data.excluded) {
        excludedColors = data.excluded.slice();
        updateExcludedListUI();
    }
    brandSelect.value = currentPaletteKey;
    boardSizeSelect.value = 'custom';
    customSizeGroup.style.display = 'block';
    customWidth.value = currentGridCols;
    customHeight.value = currentGridRows;
    if (setSelect) {
        setSelect.value = currentSet;
    }
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
    const palette = PALETTES[currentPaletteKey];
    const allColors = getColorsForSet(palette, 'all');
    sorted.forEach(([id, count]) => {
        const color = allColors.find(c => c.id === id);
        if (color) {
            html += `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
                        <span style="display:inline-block;width:20px;height:20px;border-radius:3px;background:${color.hex};border:1px solid rgba(255,255,255,0.8);"></span>
                        <span style="font-weight:600;color:#4a6a80;">${id}</span>
                        <span style="font-size:11px;color:#7a9aac;margin-left:auto;">×${count}</span>
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
        set: currentSet,
        grid: gridData,
        usedColors: Array.from(usedColorsMap.entries()),
        beadSize: beadSize,
        excluded: excludedColors,
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
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', function() {

    // 品牌下拉
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

    // 套装下拉
    if (setSelect) {
        setSelect.innerHTML = '';
        const palette = PALETTES[currentPaletteKey];
        if (palette && palette.setNames) {
            const setKeys = Object.keys(palette.setNames);
            setKeys.forEach(key => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = palette.setNames[key];
                setSelect.appendChild(option);
            });
        }
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = '不限（所有色号）';
        allOption.selected = true;
        setSelect.appendChild(allOption);
        currentSet = 'all';
    }

    // 默认值
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
    setStatus('idle', '就绪');
    showToast('🧩 欢迎使用 PixelBee 拼豆工坊');

    // 品牌切换
    brandSelect.addEventListener('change', function() {
        currentPaletteKey = this.value;
        if (setSelect) {
            setSelect.innerHTML = '';
            const palette = PALETTES[currentPaletteKey];
            if (palette && palette.setNames) {
                const setKeys = Object.keys(palette.setNames);
                setKeys.forEach(key => {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = palette.setNames[key];
                    setSelect.appendChild(option);
                });
            }
            const allOption2 = document.createElement('option');
            allOption2.value = 'all';
            allOption2.textContent = '不限（所有色号）';
            allOption2.selected = true;
            setSelect.appendChild(allOption2);
            currentSet = 'all';
        }
        showToast('已切换到 ' + this.options[this.selectedIndex].text);
    });

    // 套装切换
    setSelect.addEventListener('change', function() {
        currentSet = this.value;
    });

    // 换色按钮
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
        let colors = getAvailableColors(palette, currentSet);
        if (!colors || colors.length === 0) {
            colors = getColorsForSet(palette, 'all');
        }
        if (!colors || colors.length === 0) {
            showToast('⚠️ 没有可用的颜色');
            return;
        }
        showColorPicker(selectedCell.x, selectedCell.y, colors);
    });

    // 豆子大小变化
    beadSizeSlider.addEventListener('input', function() {
        beadSize = parseInt(this.value);
        beadSizeLabel.textContent = beadSize;
    });

    // 键盘快捷键 Ctrl+Enter
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (uploadedImage && !isGenerating) {
                generateBtn.click();
            }
        }
    });
});

window.addEventListener('resize', function() {});