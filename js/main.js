// 文件：js/main.js
// 官网首页交互 + 启动闪屏 + 下载离线版（直接下载 offline.html）

document.addEventListener('DOMContentLoaded', function() {

    // ---------- 启动闪屏 ----------
    const splash = document.getElementById('splashScreen');
    const progress = document.getElementById('splashProgress');
    const text = document.getElementById('splashText');
    const homePage = document.getElementById('homePage');

    let p = 0;
    const messages = ['正在加载引擎...', '初始化色板...', '准备就绪！'];
    let msgIdx = 0;

    const timer = setInterval(() => {
        p += Math.random() * 8 + 4;
        if (p >= 100) {
            p = 100;
            clearInterval(timer);
            setTimeout(() => {
                splash.classList.add('hide');
                homePage.style.display = 'block';
                setTimeout(() => {
                    splash.style.display = 'none';
                }, 800);
            }, 300);
        }
        progress.style.width = Math.min(p, 100) + '%';
        if (p > 30 && msgIdx === 0) { msgIdx = 1; text.textContent = messages[1]; }
        if (p > 70 && msgIdx === 1) { msgIdx = 2; text.textContent = messages[2]; }
    }, 120);

    // ---------- 下载离线版 ----------
    const downloadBtn = document.getElementById('downloadOfflineBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            // 直接下载预先准备好的 offline.html
            const link = document.createElement('a');
            link.href = 'offline.html';
            link.download = 'PixelBee_拼豆大师_离线版.html';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
});
