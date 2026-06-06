# Hanime1 视频下载器

一键下载 [Hanime1](https://hanime1.me) 视频，自动提取标题、作者、分类，保存到对应文件夹。

## 功能

- 🔍 自动识别页面视频链接（兼容 `vdownload` / `vdownload-7` / `vdownload-8` 等多子域名）
- 📝 自动提取标题，去掉 `[作者名]` 前缀
- 👤 自动识别作者
- 📂 按分类自动分流保存：

| 分类 | 保存路径 |
|------|----------|
| 2D動畫 | `Hanime/2D/作者名/标题.mp4` |
| 2.5D / 3DCG / MMD | `Hanime/3D/作者名/标题.mp4` |
| Motion Anime | `Hanime/Motion Anime/作者名/标题.mp4` |
| 其他 | `Hanime/作者名/标题.mp4` |

- 📊 实时进度条（百分比 + 网速 + 文件大小）
- ⚙ 可选：下载完成后自动关闭标签页
- 🔄 下载完可再次下载（切换不同清晰度）

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 [hanime1-video-downloader.user.js](https://github.com/yayouren/Hanime1Download/raw/main/hanime1-video-downloader.user.js)
3. 在弹出的 Tampermonkey 页面中点击「安装」

## 使用方法

1. 打开任意 Hanime1 视频页面（`https://hanime1.me/watch?v=*`）
2. 页面右下角会出现 **⬇ 下载 MP4** 按钮
3. 点击按钮开始下载，进度条实时显示下载状态
4. 下载完成后按钮变为 **⬇ 再次下载**，可切换清晰度重复下载

### 自动关闭标签页

点击 Tampermonkey 扩展图标 → 菜单中勾选「⚙ 下载后自动关闭标签页」

## 兼容性

- 支持 Tampermonkey（Chrome / Edge / Firefox）
- 需要授予 `GM_xmlhttpRequest` 跨域权限

## License

MIT
