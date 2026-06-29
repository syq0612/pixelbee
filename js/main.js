// 文件：js/main.js
// 官网首页交互 + 启动闪屏 + 下载预打包的 ZIP

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

    // ---------- 下载完整项目（预打包的 ZIP） ----------
    const downloadBtn = document.getElementById('downloadOfflineBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            // 直接下载预生成的 PixelBee_完整源码.zip
            // 请确保该文件存在于项目根目录
            const link = document.createElement('a');
            link.href = 'PixelBee_完整源码.zip';
            link.download = 'PixelBee_完整源码.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
});