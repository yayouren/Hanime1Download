    /**
     * 提取分类，映射到文件夹名
     * 优先在标题区域的父容器中查找分类链接
     * 2.5D / 3DCG / MMD → "3D"
     * 2D動畫 → "2D"
     * Motion Anime → "Motion Anime"
     */
    function extractCategory() {
        const CATEGORY_MAP = {
            '2.5D': '3D',
            '3DCG': '3D',
            'MMD': '3D',
            '2D動畫': '2D',
            'Motion Anime': 'Motion Anime',
            'AI生成': 'AI生成',
            '裏番': '里番'
        };

        // 优先：从标题附近的容器中查找
        const titleEl = document.getElementById('shareBtn-title');
        let searchRoot = titleEl;
        // 向上找几层，定位到视频详情区域
        while (searchRoot && searchRoot.parentElement && searchRoot.parentElement !== document.body) {
            searchRoot = searchRoot.parentElement;
            // 在该容器内查找分类链接
            const link = searchRoot.querySelector('a[href*="/search?genre="]');
            if (link) {
                const genre = link.textContent.trim();
                if (CATEGORY_MAP[genre]) {
                    console.log('[Hanime1下载器] 分类（标题区域）:', genre, '→', CATEGORY_MAP[genre]);
                    return CATEGORY_MAP[genre];
                }
            }
        }

        // 兜底：全局搜索，取第一个匹配已知分类的
        const allLinks = document.querySelectorAll('a[href*="/search?genre="]');
        for (const a of allLinks) {
            const genre = a.textContent.trim();
            if (CATEGORY_MAP[genre]) {
                console.log('[Hanime1下载器] 分类（全局）:', genre, '→', CATEGORY_MAP[genre]);
                return CATEGORY_MAP[genre];
            }
        }

        console.log('[Hanime1下载器] 分类: 未识别');
        return ''; // 未知分类，不建子文件夹
    }// ==UserScript==
// @name         Hanime1 视频下载器
// @namespace    https://github.com/akibaren
// @version      3.1
// @description  在 hanime1.me 视频页中添加下载按钮，自动提取标题并下载MP4
// @author       akibaren & 真寻
// @match        https://hanime1.me/watch?v=*
// @icon         https://hanime1.me/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    /**
     * 提取视频标题，去掉 [作者名] 部分
     * 例如: "[GS_mel] Cyno" -> "Cyno"
     */
    function extractTitle() {
        const titleEl = document.getElementById('shareBtn-title');
        if (titleEl) {
            let raw = titleEl.textContent.trim();
            raw = raw.replace(/^\[.*?\]\s*/, '');
            raw = raw.replace(/[\\/:*?"<>|]/g, '_');
            return raw;
        }
        let pageTitle = document.title.trim();
        pageTitle = pageTitle.replace(/^\[.*?\]\s*/, '');
        pageTitle = pageTitle.replace(/[\\/:*?"<>|]/g, '_');
        return pageTitle || 'video';
    }

    /**
     * 提取作者名（从标题 [xxx] 中）
     * 例如: "[GS_mel] Cyno" -> "GS_mel"
     */
    function extractAuthor() {
        const titleEl = document.getElementById('shareBtn-title');
        if (titleEl) {
            const raw = titleEl.textContent.trim();
            const match = raw.match(/^\[(.*?)\]/);
            if (match) return match[1].replace(/[\\/:*?"<>|]/g, '_');
        }
        let pageTitle = document.title.trim();
        const match = pageTitle.match(/^\[(.*?)\]/);
        if (match) return match[1].replace(/[\\/:*?"<>|]/g, '_');
        return 'Unknown';
    }

    /**
     * 从页面中查找 *.hembed.com 的视频链接（支持 vdownload / vdownload-8 等子域名）
     */
    function findVideoUrl() {
        // 1) <video> 标签
        const videoEl = document.querySelector('video[src]');
        if (videoEl && videoEl.src.includes('.hembed.com')) return videoEl.src;

        // 2) <video> 内的 <source>
        const sourceEl = document.querySelector('video source[src]');
        if (sourceEl && sourceEl.src.includes('.hembed.com')) return sourceEl.src;

        // 3) <a> 标签
        const links = document.querySelectorAll('a[href*=".hembed.com"]');
        for (const a of links) if (a.href) return a.href;

        // 4) iframe
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const src = iframe.src || iframe.getAttribute('data-src') || '';
                if (src.includes('.hembed.com')) return src;
            } catch (e) {}
        }

        // 5) 内嵌 script 内容
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
            const match = (s.textContent || '').match(/https?:\/\/[^\/]*hembed\.com\/[^\s"'<>]+/);
            if (match) return match[0];
        }

        // 6) window.playerConfig
        if (typeof window.playerConfig !== 'undefined' && window.playerConfig.url) {
            return window.playerConfig.url;
        }

        return null;
    }

    // ─── UI 元素 ───────────────────────────────────

    function createProgressBar() {
        const container = document.createElement('div');
        container.id = 'hm1-progress-container';
        container.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            z-index: 99998;
            width: 260px;
            background: rgba(20, 20, 30, 0.92);
            border-radius: 16px;
            padding: 12px 16px;
            box-shadow: 0 4px 18px rgba(0,0,0,0.5);
            display: none;
        `;

        const label = document.createElement('div');
        label.id = 'hm1-progress-label';
        label.style.cssText = 'color:#ccc; font-size:12px; margin-bottom:6px;';

        const barOuter = document.createElement('div');
        barOuter.style.cssText = 'width:100%; height:8px; background:rgba(255,255,255,0.12); border-radius:4px; overflow:hidden;';

        const barInner = document.createElement('div');
        barInner.id = 'hm1-progress-bar';
        barInner.style.cssText = 'width:0%; height:100%; background:linear-gradient(90deg,#ff6b9d,#c44dff); border-radius:4px; transition:width 0.15s;';

        barOuter.appendChild(barInner);
        container.appendChild(label);
        container.appendChild(barOuter);
        document.body.appendChild(container);
        return { container, label, barInner };
    }

    function createDownloadButton(videoUrl, title, author, category) {
        if (document.getElementById('hm1-dl-btn')) return null;

        const btn = document.createElement('button');
        btn.id = 'hm1-dl-btn';
        btn.textContent = '⬇ 下载 MP4';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            padding: 12px 22px;
            background: linear-gradient(135deg, #ff6b9d, #c44dff);
            color: white;
            border: none;
            border-radius: 28px;
            font-size: 15px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 18px rgba(200, 50, 150, 0.45);
            transition: transform 0.2s, box-shadow 0.2s;
            letter-spacing: 1px;
        `;
        btn.addEventListener('mouseenter', () => {
            if (btn.style.pointerEvents !== 'none') {
                btn.style.transform = 'scale(1.08)';
                btn.style.boxShadow = '0 6px 24px rgba(200, 50, 150, 0.6)';
            }
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 4px 18px rgba(200, 50, 150, 0.45)';
        });

        const progressUI = createProgressBar();

        btn.addEventListener('click', () => downloadVideo(videoUrl, title, author, category, btn, progressUI));
        document.body.appendChild(btn);
        return btn;
    }

    // ─── 核心下载逻辑 ─────────────────────────────

    function downloadVideo(url, title, author, category, btn, progressUI) {
        const filename = title + '.mp4';
        const savePath = category
            ? getRootPath() + '/' + category + '/' + author + '/' + filename
            : getRootPath() + '/' + author + '/' + filename;
        const { container, label, barInner } = progressUI;
        const THREADS = 4; // 分片数
        const MIN_CHUNK = 5 * 1048576; // 小于 5MB 不用多线程

        // 锁定按钮 + 显示进度条
        btn.textContent = '⏳ 0%';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.75';
        container.style.display = 'block';
        label.textContent = '正在连接...';
        barInner.style.width = '0%';

        console.log('[Hanime1下载器] 开始请求:', url);

        const BASE_HEADERS = {
            'Referer': 'https://hanime1.me/',
            'Origin': 'https://hanime1.me'
        };

        // 步骤 1: 探测文件大小 & Range 支持
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            headers: Object.assign({ 'Range': 'bytes=0-0' }, BASE_HEADERS),
            onload: function (probeResp) {
                const isRangeSupported = (probeResp.status === 206);
                let totalSize = 0;

                if (isRangeSupported) {
                    const cr = probeResp.responseHeaders;
                    const match = cr.match(/content-range:\s*bytes\s+\d+-\d+\/(\d+)/i);
                    if (match) totalSize = parseInt(match[1], 10);
                }

                if (!totalSize || !isRangeSupported || totalSize < MIN_CHUNK) {
                    // 不支持 Range 或文件太小 → 单线程
                    console.log('[Hanime1下载器] 单线程模式, totalSize:', totalSize);
                    singleThreadDownload(url, totalSize);
                    return;
                }

                console.log('[Hanime1下载器] 多线程模式, totalSize:', (totalSize / 1048576).toFixed(1), 'MB, threads:', THREADS);
                multiThreadDownload(url, totalSize);
            },
            onerror: function () {
                singleThreadDownload(url, 0);
            }
        });

        // ─── 单线程下载 ───────────────────────────
        function singleThreadDownload(dlUrl, totalSize) {
            let lastLoaded = 0, lastTime = Date.now();

            GM_xmlhttpRequest({
                method: 'GET',
                url: dlUrl,
                responseType: 'blob',
                headers: BASE_HEADERS,
                onprogress: function (resp) {
                    updateProgress(resp.loaded, totalSize || resp.total, lastLoaded, lastTime, function (obj) {
                        lastLoaded = obj.lastLoaded;
                        lastTime = obj.lastTime;
                    });
                },
                onload: function (resp) {
                    if (resp.status >= 200 && resp.status < 400 && resp.response && resp.response.size > 0) {
                        saveBlob(resp.response);
                    } else {
                        const detail = '状态码 ' + resp.status;
                        console.error('[Hanime1下载器] 异常响应:', detail);
                        showError(btn, container, label, detail, dlUrl, filename);
                    }
                },
                onerror: function (err) {
                    console.error('[Hanime1下载器] 请求错误:', JSON.stringify(err));
                    showError(btn, container, label, '网络请求失败', dlUrl, filename);
                }
            });
        }

        // ─── 多线程分片下载 ───────────────────────
        function multiThreadDownload(dlUrl, totalSize) {
            const chunkSize = Math.ceil(totalSize / THREADS);
            const chunks = new Array(THREADS).fill(null);
            const loadedPerThread = new Array(THREADS).fill(0);
            let completed = 0;
            let lastSpeedTime = Date.now();
            let lastSpeedBytes = 0;

            for (let i = 0; i < THREADS; i++) {
                const start = i * chunkSize;
                const end = (i === THREADS - 1) ? totalSize - 1 : (i + 1) * chunkSize - 1;
                const idx = i;

                (function (threadIndex, rangeStart, rangeEnd) {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: dlUrl,
                        responseType: 'blob',
                        headers: Object.assign({
                            'Range': 'bytes=' + rangeStart + '-' + rangeEnd
                        }, BASE_HEADERS),
                        onprogress: function (resp) {
                            loadedPerThread[threadIndex] = resp.loaded;
                            const totalLoaded = loadedPerThread.reduce(function (a, b) { return a + b; }, 0);
                            const now = Date.now();
                            const deltaTime = (now - lastSpeedTime) / 1000;
                            const deltaBytes = totalLoaded - lastSpeedBytes;
                            const speed = deltaTime > 0 ? deltaBytes / deltaTime : 0;
                            if (deltaTime >= 0.5) {
                                lastSpeedTime = now;
                                lastSpeedBytes = totalLoaded;
                            }
                            const pct = Math.round((totalLoaded / totalSize) * 100);
                            barInner.style.width = pct + '%';
                            btn.textContent = '⏳ ' + pct + '%';
                            const loadedMB = (totalLoaded / 1048576).toFixed(1);
                            const totalMB = (totalSize / 1048576).toFixed(1);
                            const speedMB = (speed / 1048576).toFixed(1);
                            label.textContent = loadedMB + ' / ' + totalMB + ' MB  |  ' + speedMB + ' MB/s  [' + (completed + 1) + '/' + THREADS + ']';
                        },
                        onload: function (resp) {
                            if (resp.status === 206 && resp.response) {
                                chunks[threadIndex] = resp.response;
                            }
                            completed++;
                            if (completed === THREADS) {
                                // 所有分片完成，合并
                                const validChunks = chunks.filter(function (c) { return c !== null; });
                                if (validChunks.length === THREADS) {
                                    label.textContent = '正在合并分片...';
                                    btn.textContent = '🔗 合并中';
                                    const merged = new Blob(validChunks, { type: 'video/mp4' });
                                    saveBlob(merged);
                                } else {
                                    showError(btn, container, label, '部分分片下载失败 (' + validChunks.length + '/' + THREADS + ')', dlUrl, filename);
                                }
                            }
                        },
                        onerror: function () {
                            completed++;
                            loadedPerThread[threadIndex] = 0;
                            if (completed === THREADS) {
                                const validChunks = chunks.filter(function (c) { return c !== null; });
                                if (validChunks.length > 0) {
                                    const merged = new Blob(validChunks, { type: 'video/mp4' });
                                    saveBlob(merged);
                                } else {
                                    showError(btn, container, label, '所有分片均下载失败', dlUrl, filename);
                                }
                            }
                        }
                    });
                })(i, start, end);
            }
        }

        // ─── 更新进度条 ───────────────────────────
        function updateProgress(loaded, total, lastLoadedRef, lastTimeRef, updateFn) {
            const useTotal = total || loaded;
            if (useTotal > 0) {
                const pct = Math.round((loaded / useTotal) * 100);
                barInner.style.width = pct + '%';
                btn.textContent = '⏳ ' + pct + '%';

                const now = Date.now();
                const deltaTime = (now - lastTimeRef) / 1000;
                const deltaBytes = loaded - lastLoadedRef;
                const speed = deltaTime > 0 ? deltaBytes / deltaTime : 0;
                updateFn({ lastLoaded: loaded, lastTime: now });

                const loadedMB = (loaded / 1048576).toFixed(1);
                const totalMB = (useTotal / 1048576).toFixed(1);
                const speedMB = (speed / 1048576).toFixed(1);
                label.textContent = loadedMB + ' / ' + totalMB + ' MB  |  ' + speedMB + ' MB/s';
            } else if (loaded > 0) {
                const loadedMB = (loaded / 1048576).toFixed(1);
                barInner.style.width = '50%';
                btn.textContent = '⏳ ' + loadedMB + 'MB';
                label.textContent = '已下载 ' + loadedMB + ' MB（总大小未知）';
            }
        }

        // ─── 保存 Blob ────────────────────────────
        function saveBlob(blob) {
            label.textContent = '正在保存...';
            barInner.style.width = '100%';
            btn.textContent = '💾 保存中...';

            const blobUrl = URL.createObjectURL(blob);
            if (typeof GM_download === 'function') {
                GM_download({
                    url: blobUrl,
                    name: savePath,
                    saveAs: false,
                    onload: function () {
                        console.log('[Hanime1下载器] 完成:', savePath);
                        URL.revokeObjectURL(blobUrl);
                        window._hm1_tryCloseTab();
                    },
                    onerror: function (e) {
                        console.warn('[Hanime1下载器] GM_download 失败:', e);
                        URL.revokeObjectURL(blobUrl);
                        fallbackSave(blob, filename);
                    }
                });
            } else {
                fallbackSave(blob, filename);
            }

            btn.textContent = '✅ 完成!';
            label.textContent = '已保存到 ' + savePath;
            setTimeout(function () {
                btn.textContent = '⬇ 再次下载';
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
            }, 2000);
        }
    }

    function showError(btn, container, label, msg, fallbackUrl, filename) {
        label.innerHTML = '❌ ' + msg +
            ' <a href="' + fallbackUrl + '" target="_blank" style="color:#ff6b9d;text-decoration:underline;">[直接打开]</a>';
        btn.textContent = '❌ 重试';
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
    }

    function fallbackSave(blob, filename) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        // 降级保存也触发自动关闭
        setTimeout(() => {
            if (typeof isAutoCloseEnabled === 'function' && isAutoCloseEnabled()) {
                window.close();
            }
        }, 3000);
    }

    // ─── 主流程 ───────────────────────────────────

    function init() {
        let attempts = 0;
        const maxAttempts = 30;

        function tryFind() {
            const videoUrl = findVideoUrl();
            const title = extractTitle();
            const author = extractAuthor();
            const category = extractCategory();

            if (videoUrl) {
                console.log('[Hanime1下载器] 找到视频:', videoUrl);
                console.log('[Hanime1下载器] 标题:', title, '作者:', author, '分类:', category || '无');
                createDownloadButton(videoUrl, title, author, category);
                return;
            }

            if (++attempts < maxAttempts) {
                setTimeout(tryFind, 800);
            } else {
                console.warn('[Hanime1下载器] 超时，未找到视频链接');
            }
        }

        tryFind();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ─── 自动关闭配置 ─────────────────────────────

    const AUTO_CLOSE_KEY = 'hm1_auto_close';
    if (typeof GM_getValue === 'function' && GM_getValue(AUTO_CLOSE_KEY, false) === undefined) {
        GM_setValue(AUTO_CLOSE_KEY, false);
    }

    function isAutoCloseEnabled() {
        return typeof GM_getValue === 'function' && GM_getValue(AUTO_CLOSE_KEY, false) === true;
    }

    function toggleAutoClose() {
        const current = GM_getValue(AUTO_CLOSE_KEY, false);
        GM_setValue(AUTO_CLOSE_KEY, !current);
        alert('自动关闭标签页：' + (!current ? '✅ 已开启' : '❌ 已关闭'));
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙ 下载后自动关闭标签页', toggleAutoClose);
    }

    // ─── 下载根目录配置 ─────────────────────────

    const ROOT_PATH_KEY = 'hm1_root_path';

    function getRootPath() {
        if (typeof GM_getValue === 'function') {
            const custom = GM_getValue(ROOT_PATH_KEY, '');
            return custom || 'Hanime';
        }
        return 'Hanime';
    }

    function setRootPath() {
        if (typeof GM_setValue !== 'function') return;
        const current = GM_getValue(ROOT_PATH_KEY, 'Hanime');
        const input = prompt('请输入下载根目录（相对于浏览器下载目录，如 Videos 或留空恢复 Hanime）：', current);
        if (input === null) return; // 取消
        let newPath = input.trim();
        // 去掉 Windows 绝对路径的盘符（如 F:\视频 → 视频）
        newPath = newPath.replace(/^[A-Za-z]:[\\\/]+/, '');
        // 去掉开头的反斜杠
        newPath = newPath.replace(/^[\\\/]+/, '');
        // 清理非法字符
        newPath = newPath.replace(/[\\/:*?"<>|]/g, '_');
        newPath = newPath || 'Hanime';
        GM_setValue(ROOT_PATH_KEY, newPath);
        alert('下载根目录已设为：' + newPath + '\n（保存在浏览器下载目录下）');
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('📁 设置下载根目录', setRootPath);
    }

    // 暴露给 downloadVideo 的回调
    window._hm1_tryCloseTab = function () {
        if (isAutoCloseEnabled()) {
            setTimeout(() => {
                console.log('[Hanime1下载器] 自动关闭标签页...');
                window.close();
            }, 1500);
        }
    };

})();
