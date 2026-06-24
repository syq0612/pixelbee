// 文件：js/main.js
// 官网首页交互 + 启动闪屏

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
            const html = document.documentElement.outerHTML;
            const blob = new Blob(['<!DOCTYPE html>\n' + html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'PixelBee_拼豆大师_离线版.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('✅ 离线版下载成功！双击HTML文件即可离线使用。');
        });
    }
});