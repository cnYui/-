// 地图和旅行功能 - mobile-index.html 专用

// 初始化高德地图
let map;
let postMarkers = [];
let activePostInfoWindow = null;
let lastLoadTimer = null;
let postsFetchAbortController = null;
let markerRenderVersion = 0;
let markerBatchTimer = null;
let mapInitialized = false;
const MAX_RENDER_MARKERS = 500;
const FIRST_BATCH_MARKERS = 30;
const MARKER_BATCH_SIZE = 40;
const MAP_VIEW_STATE_KEY = 'main_map_view_state';
const MAP_POSTS_CACHE_KEY = 'main_map_posts_cache_v3';
const MAP_POSTS_CACHE_TTL_MS = 2 * 60 * 1000;
const MAP_POSTS_CACHE_REFRESH_MS = 15 * 1000;
const DEFAULT_MAP_CENTER = [118.796877, 32.060255];
const DEFAULT_MAP_ZOOM = 11;
const moodMarkerIconCache = new Map();
let travelRoutePolylines = [];
let travelRouteMarkers = [];
let pendingTravelRouteData = null;
let lastFittedTravelPlanId = null;

function saveMapViewState() {
    if (!map) return;
    try {
        const center = map.getCenter();
        const zoom = map.getZoom();
        if (!center || typeof center.lng !== 'number' || typeof center.lat !== 'number') return;

        sessionStorage.setItem(MAP_VIEW_STATE_KEY, JSON.stringify({
            center: [center.lng, center.lat],
            zoom: Number(zoom) || DEFAULT_MAP_ZOOM,
            updatedAt: Date.now()
        }));
    } catch (error) {
        console.warn('保存地图视角失败:', error.message);
    }
}

function getSavedMapViewState() {
    try {
        const raw = sessionStorage.getItem(MAP_VIEW_STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.center) || parsed.center.length !== 2) return null;
        const [lng, lat] = parsed.center;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        const zoom = Number.isFinite(Number(parsed.zoom)) ? Number(parsed.zoom) : DEFAULT_MAP_ZOOM;
        return { center: [lng, lat], zoom };
    } catch {
        return null;
    }
}

function openPostDetailPage(postId) {
    if (!postId) return;
    saveMapViewState();
    window.location.href = `/pages/mobile/post-detail.html?id=${encodeURIComponent(postId)}`;
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
    if (moodMarkerIconCache.has(emoji)) {
        return moodMarkerIconCache.get(emoji);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

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

    const iconData = canvas.toDataURL('image/png');
    moodMarkerIconCache.set(emoji, iconData);
    return iconData;
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

function createPostInfoCard(post, emoji) {
    const title = (post.title || post.locationName || post.city || '旅途记录').trim();
    const content = (post.content || '').trim();
    const moodText = post.mood || '未设置';
    const imageCandidate = Array.isArray(post.imageUrls) && post.imageUrls.length > 0 ? post.imageUrls[0] : post.imageUrl;
    const createdAt = post.createdAt ? new Date(post.createdAt).toLocaleString() : '';
    const imageHtml = imageCandidate
        ? `<img src="${escapeHtml(imageCandidate)}" style="width:100%; max-height:160px; object-fit:cover; border:2px solid #000; border-radius:8px; margin-top:8px;" alt="贴文图片">`
        : '';

    return `
        <div style="background:#fff;border:3px solid #000;border-radius:12px;padding:10px 12px;box-shadow:4px 4px 0 #000;max-width:220px;">
            <div style="display:flex;align-items:center;gap:6px;font-weight:800;font-size:13px;margin-bottom:6px;">
                <span>${emoji}</span>
                <span>${escapeHtml(title)}</span>
            </div>
            <div style="font-size:12px;color:#333;line-height:1.4;white-space:normal;word-break:break-word;">${escapeHtml(content || '（无内容）')}</div>
            <div style="margin-top:6px;font-size:11px;color:#666;">心情：${escapeHtml(moodText)}</div>
            ${createdAt ? `<div style="margin-top:2px;font-size:11px;color:#666;">访问时间：${escapeHtml(createdAt)}</div>` : ''}
            ${imageHtml}
        </div>
    `;
}

function clearPostMarkers() {
    if (markerBatchTimer) {
        clearTimeout(markerBatchTimer);
        markerBatchTimer = null;
    }
    if (!map || postMarkers.length === 0) return;
    map.remove(postMarkers);
    postMarkers = [];
}

function clearTravelRouteOverlays() {
    if (!map) return;

    if (travelRoutePolylines.length > 0) {
        map.remove(travelRoutePolylines);
        travelRoutePolylines = [];
    }

    if (travelRouteMarkers.length > 0) {
        map.remove(travelRouteMarkers);
        travelRouteMarkers = [];
    }
}

function normalizeTravelSpots(dailyPlans) {
    if (!Array.isArray(dailyPlans)) return [];
    return dailyPlans
        .map((spot, index) => ({
            ...spot,
            index,
            lat: Number(spot?.lat),
            lng: Number(spot?.lng)
        }))
        .filter((spot) => Number.isFinite(spot.lat) && Number.isFinite(spot.lng));
}

function createTravelSpotMarker(spot, currentStepIndex) {
    const isCurrent = spot.index === currentStepIndex;
    const borderColor = isCurrent ? '#2B59FF' : '#000';
    const fillColor = isCurrent ? '#2B59FF' : '#fff';
    const textColor = isCurrent ? '#fff' : '#000';

    const marker = new AMap.Marker({
        position: [spot.lng, spot.lat],
        offset: new AMap.Pixel(-13, -13),
        zIndex: isCurrent ? 230 : 210,
        title: spot.location || `第${spot.index + 1}站`,
        content: `
            <div style="width:26px;height:26px;border-radius:50%;border:3px solid ${borderColor};background:${fillColor};color:${textColor};font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:2px 2px 0 #000;">
                ${spot.index + 1}
            </div>
        `
    });

    return marker;
}

function createTravelSegmentPolyline(fromSpot, toSpot, segmentIndex, currentStepIndex) {
    const isCompleted = segmentIndex < currentStepIndex;
    const isActive = segmentIndex === currentStepIndex;

    let color = '#9AA0A6';
    if (isCompleted) color = '#16A34A';
    if (isActive) color = '#2B59FF';

    return new AMap.Polyline({
        path: [
            [fromSpot.lng, fromSpot.lat],
            [toSpot.lng, toSpot.lat]
        ],
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: isActive ? 7 : 5,
        strokeStyle: isCompleted || isActive ? 'solid' : 'dashed',
        showDir: true,
        lineJoin: 'round',
        zIndex: isActive ? 220 : 205
    });
}

function renderTravelRoute(travelData) {
    if (!map) {
        pendingTravelRouteData = travelData || null;
        return;
    }

    const status = travelData?.status;
    const spots = normalizeTravelSpots(travelData?.dailyPlans);
    if (!travelData || !Array.isArray(travelData.dailyPlans) || spots.length < 1 || !['traveling', 'completed'].includes(status)) {
        clearTravelRouteOverlays();
        pendingTravelRouteData = null;
        return;
    }

    const currentStepIndex = Number.isFinite(Number(travelData.stepIndex))
        ? Number(travelData.stepIndex)
        : 0;

    clearTravelRouteOverlays();

    const markers = spots.map((spot) => createTravelSpotMarker(spot, currentStepIndex));
    const lines = [];

    for (let i = 0; i < spots.length - 1; i++) {
        lines.push(createTravelSegmentPolyline(spots[i], spots[i + 1], i, currentStepIndex));
    }

    if (lines.length > 0) {
        map.add(lines);
        travelRoutePolylines = lines;
    }

    if (markers.length > 0) {
        map.add(markers);
        travelRouteMarkers = markers;
    }

    if (travelData?.planId && lastFittedTravelPlanId !== travelData.planId) {
        lastFittedTravelPlanId = travelData.planId;
        map.setFitView([...lines, ...markers], false, [80, 40, 220, 40]);
    }

    pendingTravelRouteData = null;
}

function syncTravelRoute(travelData) {
    renderTravelRoute(travelData);
}

function clearTravelRoute() {
    pendingTravelRouteData = null;
    clearTravelRouteOverlays();
}

function getSquaredDistance(lngA, latA, lngB, latB) {
    const dx = Number(lngA) - Number(lngB);
    const dy = Number(latA) - Number(latB);
    return (dx * dx) + (dy * dy);
}

function sortPostsByDistanceToCenter(posts) {
    if (!map || !Array.isArray(posts) || posts.length <= 1) return posts || [];
    const center = map.getCenter();
    if (!center) return posts;
    const centerLng = Number(center.lng);
    const centerLat = Number(center.lat);

    return [...posts].sort((a, b) => {
        const da = getSquaredDistance(a.lng, a.lat, centerLng, centerLat);
        const db = getSquaredDistance(b.lng, b.lat, centerLng, centerLat);
        return da - db;
    });
}

function createPostMarker(post) {
    const emoji = getMoodEmoji(post.mood);
    const marker = new AMap.Marker({
        position: [Number(post.markerLng ?? post.lng), Number(post.markerLat ?? post.lat)],
        title: post.locationName || '旅途贴文',
        icon: new AMap.Icon({
            size: new AMap.Size(40, 40),
            image: createMoodMarkerIcon(emoji),
            imageSize: new AMap.Size(40, 40)
        }),
        offset: new AMap.Pixel(-20, -40)
    });

    marker.on('click', () => {
        openPostDetailPage(post.id);
    });

    return marker;
}

function isValidMarkerPost(post) {
    return Number.isFinite(Number(post?.lng)) && Number.isFinite(Number(post?.lat));
}

function normalizeMarkerPosts(posts) {
    if (!Array.isArray(posts)) return [];
    const groupedCounts = new Map();

    return posts
        .filter(isValidMarkerPost)
        .slice(0, MAX_RENDER_MARKERS)
        .map((post) => {
            const lng = Number(post.lng);
            const lat = Number(post.lat);
            const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
            const index = groupedCounts.get(key) || 0;
            groupedCounts.set(key, index + 1);

            if (index === 0) {
                return {
                    ...post,
                    lng,
                    lat,
                    markerLng: lng,
                    markerLat: lat
                };
            }

            const angle = (index * Math.PI) / 3;
            const radius = 0.002 + (Math.floor(index / 6) * 0.001);

            return {
                ...post,
                lng,
                lat,
                markerLng: lng + (Math.cos(angle) * radius),
                markerLat: lat + (Math.sin(angle) * radius)
            };
        });
}

function readPostsCache() {
    try {
        const raw = sessionStorage.getItem(MAP_POSTS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.updatedAt !== 'number') return null;
        return {
            updatedAt: parsed.updatedAt,
            posts: normalizeMarkerPosts(parsed.posts)
        };
    } catch {
        return null;
    }
}

function writePostsCache(posts) {
    try {
        sessionStorage.setItem(MAP_POSTS_CACHE_KEY, JSON.stringify({
            updatedAt: Date.now(),
            posts: normalizeMarkerPosts(posts)
        }));
    } catch (error) {
        console.warn('缓存地图贴文失败:', error.message);
    }
}

function renderPostMarkers(posts) {
    if (!map) return;

    markerRenderVersion += 1;
    const currentRenderVersion = markerRenderVersion;
    clearPostMarkers();

    const orderedPosts = sortPostsByDistanceToCenter(posts);
    if (!orderedPosts.length) return;

    const firstBatch = orderedPosts.slice(0, FIRST_BATCH_MARKERS);
    const firstBatchMarkers = firstBatch.map(createPostMarker);

    postMarkers.push(...firstBatchMarkers);
    if (firstBatchMarkers.length > 0) {
        map.add(firstBatchMarkers);
    }

    const renderRemainingBatches = (startIndex) => {
        if (!map || currentRenderVersion !== markerRenderVersion) {
            return;
        }

        const nextPosts = orderedPosts.slice(startIndex, startIndex + MARKER_BATCH_SIZE);
        if (!nextPosts.length) {
            markerBatchTimer = null;
            return;
        }

        const nextMarkers = nextPosts.map(createPostMarker);
        postMarkers.push(...nextMarkers);
        map.add(nextMarkers);

        markerBatchTimer = setTimeout(() => {
            renderRemainingBatches(startIndex + MARKER_BATCH_SIZE);
        }, 16);
    };

    if (orderedPosts.length > FIRST_BATCH_MARKERS) {
        markerBatchTimer = setTimeout(() => {
            renderRemainingBatches(FIRST_BATCH_MARKERS);
        }, 16);
    }
}

async function fetchNearbyPosts() {
    if (!map) return [];

    const center = map.getCenter();
    const query = new URLSearchParams({
        lat: String(center.lat),
        lng: String(center.lng),
        radius: '5000000'
    });

    if (postsFetchAbortController) {
        postsFetchAbortController.abort();
    }
    postsFetchAbortController = new AbortController();

    const response = await fetch(`/api/posts/nearby?${query.toString()}`, {
        signal: postsFetchAbortController.signal
    });
    const text = await response.text();
    const result = text ? JSON.parse(text) : null;

    if (!response.ok || !result?.success) {
        throw new Error(result?.error || '加载贴文失败');
    }

    return normalizeMarkerPosts(result.data);
}

async function loadPostMarkers({ preferCache = false } = {}) {
    if (!map) return;

    try {
        const cache = readPostsCache();
        const now = Date.now();

        if (preferCache && cache?.posts?.length) {
            renderPostMarkers(cache.posts);
        }

        const hasFreshCache = cache && (now - cache.updatedAt) < MAP_POSTS_CACHE_TTL_MS;
        const needRefresh = !hasFreshCache || (now - cache.updatedAt) > MAP_POSTS_CACHE_REFRESH_MS;

        if (!needRefresh) {
            return;
        }

        const posts = await fetchNearbyPosts();
        writePostsCache(posts);
        renderPostMarkers(posts);
    } catch (error) {
        if (error?.name === 'AbortError') {
            return;
        }
        console.warn('加载心情贴文标记失败:', error.message);
    }
}

function scheduleLoadPostMarkers() {
    clearTimeout(lastLoadTimer);
    lastLoadTimer = setTimeout(() => {
        loadPostMarkers({ preferCache: false });
    }, 220);
}

function initMapOnce() {
    if (mapInitialized || map) return;
    mapInitialized = true;

    const savedView = getSavedMapViewState();
    const initialCenter = savedView?.center || DEFAULT_MAP_CENTER;
    const initialZoom = savedView?.zoom || DEFAULT_MAP_ZOOM;

    map = new AMap.Map('amap-container', {
        zoom: initialZoom,
        center: initialCenter,
        viewMode: '2D',
        mapStyle: 'amap://styles/normal'
    });

    // 暴露地图实例给发布模块使用（发布后立即贴图）
    window.amapInstance = map;
    window.map = map;

    loadPostMarkers({ preferCache: true });
    map.on('moveend', () => {
        saveMapViewState();
        scheduleLoadPostMarkers();
    });
    map.on('zoomend', () => {
        saveMapViewState();
        scheduleLoadPostMarkers();
    });

    if (pendingTravelRouteData) {
        renderTravelRoute(pendingTravelRouteData);
    }
}

window.addEventListener('pagehide', saveMapViewState);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        saveMapViewState();
    }
});

window.addEventListener('pageshow', (event) => {
    if (map) {
        map.resize();
        if (event.persisted) {
            saveMapViewState();
            if (postMarkers.length === 0) {
                loadPostMarkers({ preferCache: true });
            }
        }
        return;
    }

    initMapOnce();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMapOnce, { once: true });
} else {
    initMapOnce();
}

window.MapTravelRenderer = {
    syncTravelRoute,
    clearTravelRoute
};
