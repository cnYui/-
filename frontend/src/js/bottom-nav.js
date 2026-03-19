// 统一的底部导航栏样式和逻辑

// 导航栏 HTML 模板
function getBottomNavHTML(activePage) {
    return `
        <div class="bottom-nav">
            <a href="/" class="nav-item ${activePage === 'map' ? 'active' : ''}">
                <span class="nav-icon"><i class="ri-map-pin-line"></i></span>
                <span class="nav-text">地图</span>
            </a>
            <a href="/pages/mobile/spark.html" class="nav-item ${activePage === 'spark' ? 'active' : ''}">
                <span class="nav-icon"><i class="ri-sparkling-line"></i></span>
                <span class="nav-text">火花</span>
            </a>
            <div class="center-add-wrapper">
                <div class="center-add-btn" onclick="togglePublishMenu()">
                    <i class="ri-add-line"></i>
                </div>
            </div>
            <a href="/pages/mobile/notes.html" class="nav-item ${activePage === 'notes' ? 'active' : ''}">
                <span class="nav-icon"><i class="ri-mail-line"></i></span>
                <span class="nav-text">收信箱</span>
            </a>
            <a href="/pages/mobile/profile.html" class="nav-item ${activePage === 'profile' ? 'active' : ''}">
                <span class="nav-icon"><i class="ri-user-line"></i></span>
                <span class="nav-text">我的</span>
            </a>
        </div>
    `;
}

// 发布弹窗 HTML 模板
function getPublishModalHTML() {
    return `
        <!-- 发布悬浮窗 -->
        <div class="publish-modal-overlay" id="publishModal">
            <div class="publish-menu">
                <div class="menu-btn btn-photo" onclick="selectFromGallery()">
                    <i class="ri-image-line"></i> 从相册选择
                </div>
                <div class="menu-btn btn-camera" onclick="openCamera()">
                    <i class="ri-camera-line"></i> 相机
                </div>
                <div class="menu-btn btn-text" onclick="openTextEditor()">
                    <i class="ri-edit-box-line"></i> 写文字
                </div>
                <div class="menu-btn btn-cancel" onclick="closePublishModal()">
                    取消
                </div>
            </div>
        </div>

        <!-- 写文字编辑弹窗 -->
        <div class="publish-modal-overlay" id="textEditorModal" style="background-color: rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <div class="text-editor-card">
                <div class="editor-header">
                    <i class="ri-close-line" onclick="closeTextEditor()" style="font-size: 32px; cursor: pointer;"></i>
                    <button class="editor-next-btn" onclick="submitTextNote()">下一步</button>
                </div>
                <div class="editor-content">
                    <div class="quote-icon">"</div>
                    <div class="editor-title">今天想说点什么...</div>
                    <textarea class="editor-textarea" id="textEditorContent" placeholder="记录此刻的心情和想法..."></textarea>
                </div>
            </div>
        </div>

        <input type="file" id="editorImageInput" accept="image/*" multiple style="display: none;" onchange="handleEditorImageSelect(event)">

        <!-- 图片编辑器悬浮卡片 -->
        <div class="publish-modal-overlay" id="imageEditorModal">
            <div class="image-editor-card">
                <div class="editor-header">
                    <i class="ri-close-line" onclick="closeImageEditor()" style="font-size: 32px; cursor: pointer;"></i>
                    <button class="editor-next-btn" onclick="publishImageNote()">发布</button>
                </div>
                
                <div class="editor-preview-section" id="imagePreviewContainer">
                    <!-- 图片预览将在这里显示 -->
                </div>
                
                <div class="editor-input-group">
                    <label class="editor-input-label">添加标题</label>
                    <input type="text" class="editor-input-field" placeholder="给你的笔记起个名字..." id="imageEditorTitle" required>
                </div>
                
                <div class="editor-input-group">
                    <label class="editor-input-label">添加正文</label>
                    <textarea class="editor-textarea-field" placeholder="分享你的故事..." id="imageEditorContent" required></textarea>
                </div>
                
                <div class="editor-input-group">
                    <label class="editor-input-label">访问时间 <span style="color: #ff4444;">*</span></label>
                    <input type="datetime-local" class="editor-input-field" id="imageEditorVisitTime" required>
                </div>
                
                <div class="editor-input-group">
                    <label class="editor-input-label">心情 <span style="color: #ff4444;">*</span></label>
                    <select class="editor-input-field" id="imageEditorMood" required>
                        <option value="">请选择心情...</option>
                        <option value="开心">😊 开心</option>
                        <option value="兴奋">🤩 兴奋</option>
                        <option value="平静">😌 平静</option>
                        <option value="感动">🥺 感动</option>
                        <option value="惊讶">😲 惊讶</option>
                        <option value="悲伤">😢 悲伤</option>
                        <option value="愤怒">😠 愤怒</option>
                        <option value="焦虑">😰 焦虑</option>
                        <option value="疲惫">😫 疲惫</option>
                        <option value="无聊">😑 无聊</option>
                        <option value="恐惧">😨 恐惧</option>
                        <option value="幸福">🥰 幸福</option>
                        <option value="孤独">😔 孤独</option>
                    </select>
                </div>
                
                <div class="editor-input-group">
                    <label class="editor-input-label">地理位置 <span style="color: #ff4444;">*</span></label>
                    <input type="text" class="editor-input-field" placeholder="搜索或输入地点..." id="imageEditorLocation" required>
                </div>
                
                <button class="editor-publish-btn" onclick="publishImageNote()">
                    <i class="ri-send-plane-fill"></i> 发布笔记
                </button>
            </div>
        </div>
    `;
}

// 统一的 CSS 样式
function getBottomNavCSS() {
    return `
        .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 70px;
            background-color: #fff;
            border-top: var(--border-width) solid var(--border-color);
            display: flex;
            justify-content: space-around;
            align-items: center;
            z-index: 1000;
        }

        .nav-item {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-decoration: none;
            color: var(--text-color);
            font-weight: bold;
            font-size: 12px;
            height: 100%;
            transition: all 0.2s ease;
        }

        .nav-icon {
            font-size: 22px;
            margin-bottom: 2px;
        }

        .nav-item:hover, .nav-item.active {
            color: var(--accent-blue);
        }

        .center-add-wrapper {
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100%;
        }

        .center-add-btn {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background-color: var(--accent-yellow);
            border: 4px solid var(--border-color);
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 30px;
            font-weight: bold;
            color: var(--text-color);
            text-decoration: none;
            box-shadow: 3px 3px 0 rgba(0,0,0,1);
            transition: all 0.2s ease;
            cursor: pointer;
            margin-bottom: 5px;
        }

        .center-add-btn:active {
            transform: translate(2px, 2px);
            box-shadow: 1px 1px 0 rgba(0,0,0,1);
        }

        /* 悬浮发布菜单 - Neo Brutalism */
        .publish-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 2000;
            display: none;
            opacity: 0;
            transition: opacity 0.3s ease;
            backdrop-filter: blur(2px);
        }

        .publish-modal-overlay.show {
            display: block;
            opacity: 1;
        }

        .publish-menu {
            position: absolute;
            bottom: -100%;
            left: 0;
            width: 100%;
            background-color: var(--primary-bg);
            border-top: 6px solid var(--border-color);
            padding: 20px;
            transition: bottom 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .publish-modal-overlay.show .publish-menu {
            bottom: 0;
        }

        .menu-btn {
            width: 100%;
            padding: 16px;
            background-color: #fff;
            border: 4px solid var(--border-color);
            box-shadow: 4px 4px 0 rgba(0,0,0,1);
            font-size: 18px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.1s ease;
        }

        .menu-btn:active {
            transform: translate(2px, 2px);
            box-shadow: 2px 2px 0 rgba(0,0,0,1);
        }

        .menu-btn.btn-photo { background-color: #FF69B4; color: white; }
        .menu-btn.btn-camera { background-color: var(--accent-blue); color: white; }
        .menu-btn.btn-text { background-color: var(--accent-yellow); color: black; }
        .menu-btn.btn-cancel { 
            background-color: #e0e0e0; 
            margin-top: 10px;
            border: 4px dashed var(--border-color);
            box-shadow: none;
        }
        
        .menu-btn.btn-cancel:active {
            transform: scale(0.98);
        }

        /* 写文字编辑弹窗样式 */
        .text-editor-card {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.8);
            width: 90%;
            max-width: 500px;
            background-color: #f5f5f0;
            border: 6px solid var(--border-color);
            border-radius: 20px;
            padding: 20px;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            opacity: 0;
        }

        .publish-modal-overlay.show .text-editor-card {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
        }

        .editor-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .editor-next-btn {
            background-color: #ff6b9d;
            color: #fff;
            border: none;
            padding: 8px 24px;
            border-radius: 20px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
        }

        .editor-content {
            position: relative;
        }

        .quote-icon {
            font-size: 80px;
            color: #e0e0e0;
            position: absolute;
            top: -20px;
            left: 10px;
            font-family: Georgia, serif;
        }

        .editor-title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 15px;
            margin-top: 40px;
            color: #333;
        }

        .editor-textarea {
            width: 100%;
            min-height: 200px;
            border: none;
            background-color: transparent;
            font-size: 16px;
            color: #666;
            resize: none;
            outline: none;
            font-family: 'AlibabaPuHuiTi', sans-serif;
        }

        .editor-textarea::placeholder {
            color: #ccc;
        }
    `;
}

// 切换发布菜单
function togglePublishMenu() {
    const modal = document.getElementById('publishModal');
    if (modal) {
        if (modal.classList.contains('show')) {
            closePublishModal();
        } else {
            modal.classList.add('show');
        }
    }
}

// 关闭发布菜单
function closePublishModal() {
    const modal = document.getElementById('publishModal');
    if (modal) {
        modal.classList.remove('show');
    }
}
