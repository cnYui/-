// 发布悬浮窗控制
import { apiFormRequest, apiJsonRequest } from './utils/api.js';
import { getAuthUserId } from './utils/auth.js';
import { showToast } from './utils/helpers.js';

let currentLocation = null; // 当前位置信息
const AMAP_WEB_KEY = 'eff8ab024dd806b392d1216eb0f7abdb';
const AMAP_SECURITY_CODE = 'a096728c5e8eadaf7b4c2d88b2ea9f26';
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

let amapSdkPromise = null;
let placeSearch = null;
let locationSearchBound = false;
let selectedLocation = null;
let activeMoodInfoWindow = null;
let activeMoodMarkerId = null;

const STANDARD_PUBLISH_MENU_HTML = `
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
`;

const STANDARD_TEXT_EDITOR_HTML = `
    <div class="text-editor-card">
        <div class="editor-header">
            <i class="ri-close-line" onclick="closeTextEditor()" style="font-size: 32px; cursor: pointer;"></i>
            <button class="editor-next-btn" onclick="submitTextNote()">下一步</button>
        </div>
        <div class="editor-content">
            <div class="quote-icon">"</div>
            <div class="editor-title">写想法</div>
            <textarea class="editor-textarea" id="textEditorInput" placeholder="说点什么或提个问题..."></textarea>
        </div>
    </div>
`;

const STANDARD_IMAGE_EDITOR_HTML = `
    <div class="image-editor-card">
        <div class="editor-header">
            <i class="ri-close-line" onclick="closeImageEditor()" style="font-size: 32px; cursor: pointer;"></i>
        </div>

        <div class="editor-images-section" id="editorImagesSection">
            <!-- 图片将动态添加在这里 -->
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
            <div style="position: relative;">
                <input type="text" class="editor-input-field" placeholder="搜索或输入地点..." id="imageEditorLocation" required autocomplete="off">
                <div id="imageLocationResults" style="display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:3px solid #000; border-top:none; max-height:220px; overflow-y:auto; z-index:3000;"></div>
            </div>
        </div>

        <button class="editor-publish-btn" onclick="publishImageNote()">
            <i class="ri-send-plane-fill"></i> 发布笔记
        </button>
    </div>
`;

function ensureHiddenFileInput(id, attrs) {
    let input = document.getElementById(id);
    if (!input) {
        input = document.createElement('input');
        input.id = id;
        input.type = 'file';
        document.body.appendChild(input);
    }

    Object.entries(attrs).forEach(([key, value]) => {
        if (value === true) {
            input.setAttribute(key, key);
        } else if (value !== false && value != null) {
            input.setAttribute(key, value);
        }
    });

    input.style.display = 'none';
}

function ensurePublishModalTemplate() {
    if (window.__publishModalTemplateReady) return;

    let publishModal = document.getElementById('publishModal');
    if (!publishModal) {
        publishModal = document.createElement('div');
        publishModal.id = 'publishModal';
        publishModal.className = 'publish-modal-overlay';
        document.body.appendChild(publishModal);
    }
    publishModal.className = 'publish-modal-overlay';
    publishModal.innerHTML = STANDARD_PUBLISH_MENU_HTML;

    let textEditorModal = document.getElementById('textEditorModal');
    if (!textEditorModal) {
        textEditorModal = document.createElement('div');
        textEditorModal.id = 'textEditorModal';
        document.body.appendChild(textEditorModal);
    }
    textEditorModal.className = 'publish-modal-overlay';
    textEditorModal.style.cssText = 'background-color: rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);';
    textEditorModal.innerHTML = STANDARD_TEXT_EDITOR_HTML;

    ensureHiddenFileInput('galleryInput', {
        accept: 'image/*',
        onchange: 'handleGallerySelect(event)'
    });
    ensureHiddenFileInput('cameraInput', {
        accept: 'image/*',
        capture: 'environment',
        onchange: 'handleCameraCapture(event)'
    });
    ensureHiddenFileInput('editorImageInput', {
        accept: 'image/*',
        multiple: true,
        onchange: 'handleEditorImageSelect(event)'
    });

    let imageEditorModal = document.getElementById('imageEditorModal');
    if (!imageEditorModal) {
        imageEditorModal = document.createElement('div');
        imageEditorModal.id = 'imageEditorModal';
        imageEditorModal.className = 'publish-modal-overlay';
        document.body.appendChild(imageEditorModal);
    }
    imageEditorModal.className = 'publish-modal-overlay';
    imageEditorModal.innerHTML = STANDARD_IMAGE_EDITOR_HTML;

    window.__publishModalTemplateReady = true;
}

function ensurePublishModalVisualStyle() {
    if (document.getElementById('publishModalRoundedStyle')) return;

    const style = document.createElement('style');
    style.id = 'publishModalRoundedStyle';
    style.textContent = `
        .publish-modal-overlay .publish-menu {
            left: 16px;
            width: calc(100% - 32px);
            border: 4px solid var(--border-color, #000);
            border-radius: 18px;
            box-shadow: 6px 6px 0 rgba(0,0,0,1);
            bottom: -120%;
            padding: 14px;
        }

        .publish-modal-overlay.show .publish-menu {
            bottom: 16px;
        }
    `;

    document.head.appendChild(style);
}

function ensureAmapSdkLoaded() {
    if (typeof AMap !== 'undefined') {
        return Promise.resolve();
    }

    if (amapSdkPromise) {
        return amapSdkPromise;
    }

    amapSdkPromise = new Promise((resolve, reject) => {
        window._AMapSecurityConfig = window._AMapSecurityConfig || {
            securityJsCode: AMAP_SECURITY_CODE
        };

        const existing = document.querySelector('script[data-amap-sdk="true"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('高德 SDK 加载失败')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.setAttribute('data-amap-sdk', 'true');
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_WEB_KEY}&plugin=AMap.PlaceSearch,AMap.Geocoder`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('高德 SDK 加载失败'));
        document.head.appendChild(script);
    });

    return amapSdkPromise;
}

async function ensurePlaceSearchReady() {
    await ensureAmapSdkLoaded();

    if (placeSearch) return;

    await new Promise((resolve) => {
        AMap.plugin(['AMap.PlaceSearch'], () => {
            placeSearch = new AMap.PlaceSearch({
                pageSize: 10,
                city: '全国'
            });
            resolve();
        });
    });
}

function renderLocationSuggestions(pois) {
    const resultsEl = document.getElementById('imageLocationResults');
    if (!resultsEl) return;

    resultsEl.innerHTML = '';

    if (!pois || pois.length === 0) {
        resultsEl.style.display = 'none';
        return;
    }

    pois.forEach((poi) => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:10px 12px; border-bottom:1px solid #ddd; cursor:pointer;';
        item.innerHTML = `
            <div style="font-weight:700; font-size:14px;">${poi.name || ''}</div>
            <div style="font-size:12px; color:#666; margin-top:2px;">${poi.address || ''}</div>
        `;

        item.addEventListener('click', () => {
            const input = document.getElementById('imageEditorLocation');
            if (input) {
                input.value = poi.name || '';
            }

            if (poi.location) {
                selectedLocation = {
                    lat: poi.location.lat,
                    lng: poi.location.lng,
                    city: poi.cityname || currentLocation?.city || '未知城市',
                    district: poi.adname || currentLocation?.district || '',
                    locationName: poi.name || ''
                };
            }

            resultsEl.style.display = 'none';
        });

        item.addEventListener('mouseenter', () => {
            item.style.background = '#f5f5f5';
        });

        item.addEventListener('mouseleave', () => {
            item.style.background = '#fff';
        });

        resultsEl.appendChild(item);
    });

    resultsEl.style.display = 'block';
}

function bindLocationSearch() {
    if (locationSearchBound) return;

    const input = document.getElementById('imageEditorLocation');
    const resultsEl = document.getElementById('imageLocationResults');
    if (!input || !resultsEl) return;

    let timer = null;

    input.addEventListener('input', async (event) => {
        const keyword = event.target.value.trim();
        selectedLocation = null;

        clearTimeout(timer);
        if (!keyword || keyword.length < 2) {
            resultsEl.style.display = 'none';
            return;
        }

        timer = setTimeout(async () => {
            try {
                await ensurePlaceSearchReady();
                placeSearch.search(keyword, (status, result) => {
                    if (status === 'complete' && result?.poiList?.pois?.length) {
                        renderLocationSuggestions(result.poiList.pois);
                    } else {
                        resultsEl.style.display = 'none';
                    }
                });
            } catch (error) {
                console.warn('地点联想不可用:', error.message);
                resultsEl.style.display = 'none';
            }
        }, 260);
    });

    document.addEventListener('click', (event) => {
        if (!input.contains(event.target) && !resultsEl.contains(event.target)) {
            resultsEl.style.display = 'none';
        }
    });

    locationSearchBound = true;
}

// 获取当前用户ID
function getPostUserId() {
    return getAuthUserId();
}

// 获取当前位置
async function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持定位'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                // 使用高德逆地理编码获取地址信息
                try {
                    const geocoder = new AMap.Geocoder();
                    geocoder.getAddress([lng, lat], (status, result) => {
                        if (status === 'complete' && result.info === 'OK') {
                            const addressComponent = result.regeocode.addressComponent;
                            currentLocation = {
                                lat,
                                lng,
                                city: addressComponent.city || addressComponent.province,
                                district: addressComponent.district,
                                locationName: result.regeocode.formattedAddress
                            };
                            resolve(currentLocation);
                        } else {
                            currentLocation = { lat, lng, city: '未知城市', district: '', locationName: '' };
                            resolve(currentLocation);
                        }
                    });
                } catch (error) {
                    currentLocation = { lat, lng, city: '未知城市', district: '', locationName: '' };
                    resolve(currentLocation);
                }
            },
            (error) => {
                console.error('获取位置失败:', error);
                // 使用默认位置（南京）
                currentLocation = {
                    lat: 32.0603,
                    lng: 118.7969,
                    city: '南京市',
                    district: '玄武区',
                    locationName: '南京市玄武区'
                };
                resolve(currentLocation);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

// 切换发布菜单（新的统一函数）
function togglePublishMenu() {
    const modal = document.getElementById('publishModal');
    if (!modal) return;
    
    if (modal.classList.contains('show')) {
        closePublishModal();
    } else {
        modal.style.display = 'block';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }
}

// 保留旧函数以兼容
function openPublishModal(e) {
    if (e) e.preventDefault();
    togglePublishMenu();
}

function closePublishModal() {
    const modal = document.getElementById('publishModal');
    if (!modal) return;
    
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

// 从相册选择图片
function selectFromGallery() {
    closePublishModal();
    document.getElementById('galleryInput').click();
}

// 打开相机拍照
function openCamera() {
    closePublishModal();
    document.getElementById('cameraInput').click();
}

// 全局变量存储选中的图片
let selectedImages = [];
let selectedImageFiles = [];
let activePublishMode = 'image';

function openPublishEditor(mode = 'image') {
    activePublishMode = mode;

    if (mode === 'text') {
        selectedImages = [];
        selectedImageFiles = [];
    }

    const modal = document.getElementById('imageEditorModal');
    if (!modal) return;

    const imagesSection = document.getElementById('editorImagesSection');
    if (imagesSection) {
        imagesSection.style.display = mode === 'text' ? 'none' : '';
    }

    if (mode === 'image') {
        renderEditorImages();
    }

    modal.style.display = 'block';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);

    bindLocationSearch();
    ensurePlaceSearchReady().catch((error) => {
        console.warn('地点搜索初始化失败:', error.message);
    });

}

async function resolvePublishLocation(locationInputValue) {
    if (selectedLocation && selectedLocation.locationName === locationInputValue) {
        return selectedLocation;
    }

    await ensurePlaceSearchReady();
    return new Promise((resolve, reject) => {
        placeSearch.search(locationInputValue, (status, result) => {
            const pois = result?.poiList?.pois || [];
            const poi = pois.find((item) => item?.location) || null;

            if (status !== 'complete' || !poi) {
                reject(new Error('请填写可识别的地理位置，或从联想列表中选择'));
                return;
            }

            resolve({
                lat: poi.location.lat,
                lng: poi.location.lng,
                city: poi.cityname || '未知城市',
                district: poi.adname || '',
                locationName: poi.name || locationInputValue
            });
        });
    });
}

async function uploadImageFile(file) {
    if (!file) return null;

    const uploadFile = await ensureUploadFileWithinLimit(file);

    const formData = new FormData();
    formData.append('image', uploadFile);

    const result = await apiFormRequest('/upload/image', {
        method: 'POST',
        formData
    });
    if (!result?.success || !result?.data?.url) {
        throw new Error(result?.error || '图片上传失败');
    }

    return result.data.url;
}

// 处理相册图片选择
function handleGallerySelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    ensureUploadFileWithinLimit(file)
        .then((compressedFile) => {
            selectedImageFiles = [compressedFile];
            const reader = new FileReader();
            reader.onload = function(e) {
                addImageToEditor(e.target.result);
                openImageEditor();
            };
            reader.readAsDataURL(compressedFile);
        })
        .catch((error) => {
            showToast(error.message || '图片处理失败，请重试', 'error');
        });
}

// 处理相机拍照
function handleCameraCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    ensureUploadFileWithinLimit(file)
        .then((compressedFile) => {
            selectedImageFiles = [compressedFile];
            const reader = new FileReader();
            reader.onload = function(e) {
                addImageToEditor(e.target.result);
                openImageEditor();
            };
            reader.readAsDataURL(compressedFile);
        })
        .catch((error) => {
            showToast(error.message || '图片处理失败，请重试', 'error');
        });
}

function loadImageElement(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片解码失败'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
    });
}

function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('图片压缩失败'));
                return;
            }
            resolve(blob);
        }, 'image/jpeg', quality);
    });
}

async function compressImageFileToLimit(file, maxBytes = MAX_UPLOAD_SIZE_BYTES) {
    if (file.size <= maxBytes) {
        return file;
    }

    const image = await loadImageElement(file);
    let scale = 1;
    let quality = 0.9;
    let compressedBlob = null;

    for (let i = 0; i < 12; i += 1) {
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);

        compressedBlob = await canvasToBlob(canvas, quality);
        if (compressedBlob.size <= maxBytes) {
            break;
        }

        if (quality > 0.45) {
            quality -= 0.1;
        } else {
            scale *= 0.85;
        }
    }

    if (!compressedBlob || compressedBlob.size > maxBytes) {
        throw new Error('图片压缩后仍超过 5MB，请更换图片');
    }

    const compressedName = file.name.replace(/\.[^.]+$/, '') + '-compressed.jpg';
    return new File([compressedBlob], compressedName, {
        type: 'image/jpeg',
        lastModified: Date.now()
    });
}

async function ensureUploadFileWithinLimit(file) {
    if (!file || !file.type.startsWith('image/')) {
        throw new Error('请选择图片文件');
    }

    if (file.size <= MAX_UPLOAD_SIZE_BYTES) {
        return file;
    }

    return compressImageFileToLimit(file, MAX_UPLOAD_SIZE_BYTES);
}

// 添加图片到编辑器
function addImageToEditor(imageData) {
    selectedImages = [imageData]; // 暂时只支持单张图片
    renderEditorImages();
}

// 渲染编辑器中的图片
function renderEditorImages() {
    const imagesSection = document.getElementById('editorImagesSection');
    if (!imagesSection) return;
    
    imagesSection.innerHTML = '';
    
    selectedImages.forEach((imgData, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'editor-image-item';
        imageItem.innerHTML = `
            <img src="${imgData}" alt="选中的图片">
            <div class="editor-image-number">${index + 1}</div>
        `;
        imagesSection.appendChild(imageItem);
    });
    
    // 添加"添加"按钮
    const addBtn = document.createElement('div');
    addBtn.className = 'editor-add-image-btn';
    addBtn.onclick = selectMoreImages;
    addBtn.innerHTML = '<i class="ri-add-line"></i>';
    imagesSection.appendChild(addBtn);
}

// 选择更多图片
function selectMoreImages() {
    document.getElementById('editorImageInput').click();
}

// 处理编辑器中的图片选择
function handleEditorImageSelect(event) {
    const files = event.target.files;
    const tasks = Array.from(files).map(async (file) => {
        const compressedFile = await ensureUploadFileWithinLimit(file);
        selectedImageFiles.push(compressedFile);
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                selectedImages.push(e.target.result);
                resolve();
            };
            reader.readAsDataURL(compressedFile);
        });
    });

    Promise.all(tasks)
        .then(() => {
            renderEditorImages();
        })
        .catch((error) => {
            showToast(error.message || '图片处理失败，请重试', 'error');
        });
}

// 打开图片编辑器
function openImageEditor() {
    openPublishEditor('image');
}

// 关闭图片编辑器
function closeImageEditor() {
    const modal = document.getElementById('imageEditorModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            // 清空数据
            selectedImages = [];
            selectedImageFiles = [];
            const titleInput = document.getElementById('imageEditorTitle');
            const contentInput = document.getElementById('imageEditorContent');
            if (titleInput) titleInput.value = '';
            if (contentInput) contentInput.value = '';
        }, 300);
    }
}

// 发布图片笔记
async function publishImageNote() {
    const title = document.getElementById('imageEditorTitle')?.value || '';
    const content = document.getElementById('imageEditorContent')?.value || '';
    const visitTime = document.getElementById('imageEditorVisitTime')?.value || '';
    const mood = document.getElementById('imageEditorMood')?.value || '';
    const locationInputValue = document.getElementById('imageEditorLocation')?.value?.trim() || '';

    if (!title.trim()) {
        showToast('请填写帖子标题', 'error');
        return;
    }

    if (!content.trim()) {
        showToast('请填写帖子内容', 'error');
        return;
    }

    if (!visitTime) {
        showToast('请选择发布时间', 'error');
        return;
    }

    if (!mood) {
        showToast('请选择发布表情', 'error');
        return;
    }

    if (!locationInputValue) {
        showToast('请填写发布地点', 'error');
        return;
    }

    if (activePublishMode === 'image' && selectedImageFiles.length === 0) {
        showToast('请先选择至少一张图片', 'error');
        return;
    }
    
    const userId = getPostUserId();
    if (!userId) {
        showToast('请先登录', 'error');
        window.location.href = '/pages/mobile/login.html';
        return;
    }
    
    const targetLocation = await resolvePublishLocation(locationInputValue);
    
    try {
        let imageUrl = null;
        if (selectedImageFiles.length > 0) {
            imageUrl = await uploadImageFile(selectedImageFiles[0]);
        }

        // 1. 发布贴文
        const postResult = await apiJsonRequest('/posts', {
            method: 'POST',
            body: {
                content: `${title}\n\n${content}`,
                imageUrl,
                mood,
                city: targetLocation.city,
                district: targetLocation.district,
                locationName: locationInputValue || targetLocation.locationName,
                lat: targetLocation.lat,
                lng: targetLocation.lng,
                visitTime
            }
        });
        
        if (!postResult.success) {
            throw new Error(postResult.error || '发布失败');
        }
        
        console.log('✅ 贴文发布成功:', postResult.data);
        renderPostMarkerOnMap(postResult.data);
        
        // 2. 创建聊天室
        const chatroomResult = await apiJsonRequest('/chatrooms/create-by-location', {
            method: 'POST',
            body: {
                postId: postResult.data.id,
                city: targetLocation.city,
                district: targetLocation.district,
                lat: targetLocation.lat,
                lng: targetLocation.lng,
                radius: 1000
            }
        });
        
        if (chatroomResult.success) {
            console.log('✅ 聊天室创建成功:', chatroomResult.data);
            const matchCount = chatroomResult.data.matchedUsers?.length || 0;
            if (matchCount > 0) {
                showToast(`发布成功！发现 ${matchCount} 位附近的旅行者，快去火花页面看看吧！`, 'success');
            } else {
                showToast('发布成功！你是第一个在这里发帖的人~', 'success');
            }
        }
        
        closeImageEditor();
        // 跳转到火花页面
        window.location.href = '/pages/mobile/spark.html';
        
    } catch (error) {
        console.error('❌ 发布失败:', error);
        showToast('发布失败: ' + error.message, 'error');
    }
}

function getMoodEmoji(mood) {
    const moodEmojiMap = {
        '开心': '😊',
        '兴奋': '🤩',
        '平静': '😌',
        '感动': '🥺',
        '惊讶': '😲',
        '悲伤': '😢',
        '愤怒': '😠',
        '焦虑': '😰',
        '疲惫': '😫',
        '无聊': '😑',
        '恐惧': '😨',
        '幸福': '🥰',
        '孤独': '😔'
    };

    return moodEmojiMap[mood] || '😊';
}

function createMoodMarkerIcon(emoji) {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFD600';
    ctx.beginPath();
    ctx.arc(40, 40, 34, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 40, 41);

    return canvas.toDataURL('image/png');
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createMoodInfoCard(post, emoji) {
    const title = (post.locationName || post.city || '旅途记录').trim();
    const content = (post.content || '').trim();
    const moodText = post.mood || '未设置';
    const imageHtml = post.imageUrl
        ? `<img src="${escapeHtml(post.imageUrl)}" style="width:100%; max-height:160px; object-fit:cover; border:2px solid #000; border-radius:8px; margin-top:8px;" alt="贴文图片">`
        : '';

    return `
        <div style="background:#fff;border:3px solid #000;border-radius:12px;padding:10px 12px;box-shadow:4px 4px 0 #000;max-width:220px;">
            <div style="display:flex;align-items:center;gap:6px;font-weight:800;font-size:13px;margin-bottom:6px;">
                <span>${emoji}</span>
                <span>${escapeHtml(title)}</span>
            </div>
            <div style="font-size:12px;color:#333;line-height:1.4;white-space:normal;word-break:break-word;">${escapeHtml(content || '（无内容）')}</div>
            <div style="margin-top:6px;font-size:11px;color:#666;">心情：${escapeHtml(moodText)}</div>
            ${imageHtml}
        </div>
    `;
}

function renderPostMarkerOnMap(post) {
    if (!post || post.lat === undefined || post.lng === undefined || typeof AMap === 'undefined') {
        return;
    }

    const mapInstance = window.amapInstance || window.map || null;
    if (!mapInstance) {
        return;
    }

    const emoji = getMoodEmoji(post.mood);
    const marker = new AMap.Marker({
        position: [post.lng, post.lat],
        title: post.locationName || '新贴文',
        icon: new AMap.Icon({
            size: new AMap.Size(40, 40),
            image: createMoodMarkerIcon(emoji),
            imageSize: new AMap.Size(40, 40)
        }),
        offset: new AMap.Pixel(-20, -40)
    });

    const previewText = (post.content || '').replace(/\n+/g, ' ').trim().slice(0, 30);
    if (previewText) {
        marker.setLabel({
            direction: 'top',
            offset: new AMap.Pixel(0, -4),
            content: `<div style="background:#fff;border:2px solid #000;border-radius:8px;padding:4px 8px;font-size:12px;line-height:1.2;box-shadow:2px 2px 0 #000;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${previewText}</div>`
        });
    }

    marker.on('click', () => {
        if (!post?.id) return;
        window.location.href = `/pages/mobile/post-detail.html?id=${encodeURIComponent(post.id)}`;
    });

    mapInstance.add(marker);
    mapInstance.setCenter([post.lng, post.lat]);
}

// 打开文字编辑器
function openTextEditor() {
    closePublishModal();
    openPublishEditor('text');
}

// 关闭文字编辑器
function closeTextEditor() {
    const modal = document.getElementById('textEditorModal');
    const textInput = document.getElementById('textEditorInput');
    if (!modal || !textInput) return;

    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        textInput.value = '';
    }, 300);
}

// 提交文字笔记
async function submitTextNote() {
    const text = document.getElementById('textEditorInput').value.trim();
    if (!text) {
        showToast('请输入内容', 'error');
        return;
    }
    
    const userId = getPostUserId();
    if (!userId) {
        showToast('请先登录', 'error');
        window.location.href = '/pages/mobile/login.html';
        return;
    }
    
    // 确保有位置信息
    if (!currentLocation) {
        await getCurrentLocation();
    }
    
    try {
        // 1. 发布贴文
        const postResult = await apiJsonRequest('/posts', {
            method: 'POST',
            body: {
                content: text,
                city: currentLocation.city,
                district: currentLocation.district,
                locationName: currentLocation.locationName,
                lat: currentLocation.lat,
                lng: currentLocation.lng
            }
        });
        
        if (!postResult.success) {
            throw new Error(postResult.error || '发布失败');
        }
        
        console.log('✅ 贴文发布成功:', postResult.data);
        
        // 2. 创建聊天室
        const chatroomResult = await apiJsonRequest('/chatrooms/create-by-location', {
            method: 'POST',
            body: {
                postId: postResult.data.id,
                city: currentLocation.city,
                district: currentLocation.district,
                lat: currentLocation.lat,
                lng: currentLocation.lng,
                radius: 1000
            }
        });
        
        if (chatroomResult.success) {
            console.log('✅ 聊天室创建成功:', chatroomResult.data);
            const matchCount = chatroomResult.data.matchedUsers?.length || 0;
            if (matchCount > 0) {
                showToast(`发布成功！发现 ${matchCount} 位附近的旅行者，快去火花页面看看吧！`, 'success');
            } else {
                showToast('发布成功！你是第一个在这里发帖的人~', 'success');
            }
        }
        
        closeTextEditor();
        // 跳转到火花页面
        window.location.href = '/pages/mobile/spark.html';
        
    } catch (error) {
        console.error('❌ 发布失败:', error);
        showToast('发布失败: ' + error.message, 'error');
    }
}

// 初始化事件监听
document.addEventListener('DOMContentLoaded', function() {
    ensurePublishModalTemplate();
    ensurePublishModalVisualStyle();

    // 点击遮罩层关闭悬浮窗
    const publishModal = document.getElementById('publishModal');
    if (publishModal) {
        publishModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closePublishModal();
            }
        });
    }

    const textEditorModal = document.getElementById('textEditorModal');
    if (textEditorModal) {
        textEditorModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeTextEditor();
            }
        });
    }
});

window.togglePublishMenu = togglePublishMenu;
window.openPublishModal = openPublishModal;
window.closePublishModal = closePublishModal;
window.selectFromGallery = selectFromGallery;
window.openCamera = openCamera;
window.handleGallerySelect = handleGallerySelect;
window.handleCameraCapture = handleCameraCapture;
window.selectMoreImages = selectMoreImages;
window.handleEditorImageSelect = handleEditorImageSelect;
window.openImageEditor = openImageEditor;
window.closeImageEditor = closeImageEditor;
window.publishImageNote = publishImageNote;
window.openTextEditor = openTextEditor;
window.closeTextEditor = closeTextEditor;
window.submitTextNote = submitTextNote;
