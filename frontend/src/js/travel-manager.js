// 旅行管理功能
import { apiJsonRequest, apiRequest } from './utils/api.js';
import { getAuthUserId } from './utils/auth.js';
import { showToast } from './utils/helpers.js';

let currentUserId = null;
let travelProgressInterval = null;
let currentTravelPlan = null;
let travelModeBehaviorBound = false;
let progressRequestInFlight = false;
let lastDiaryQueueLogKey = null;

function getCompletionNoticeKey(planId) {
    return `travel_completed_notified_${planId}`;
}

function markCompletionNotified(planId) {
    if (!planId) return;
    sessionStorage.setItem(getCompletionNoticeKey(planId), '1');
}

function isCompletionNotified(planId) {
    if (!planId) return false;
    return sessionStorage.getItem(getCompletionNoticeKey(planId)) === '1';
}

function resetToTravelStartUI() {
    const startUI = document.getElementById('travel-start-ui');
    const ongoingUI = document.getElementById('travel-ongoing-ui');
    if (startUI) startUI.style.display = 'block';
    if (ongoingUI) ongoingUI.style.display = 'none';
}

function stopProgressPolling() {
    if (travelProgressInterval) {
        clearInterval(travelProgressInterval);
        travelProgressInterval = null;
    }
    progressRequestInFlight = false;
}

const PROVINCE_CITY_MAP = {
    '直辖市': ['北京', '上海', '天津', '重庆'],
    '河北': ['石家庄', '唐山', '秦皇岛', '保定'],
    '山西': ['太原', '大同', '晋中'],
    '内蒙古': ['呼和浩特', '包头', '鄂尔多斯'],
    '辽宁': ['沈阳', '大连', '鞍山'],
    '吉林': ['长春', '吉林', '延边'],
    '黑龙江': ['哈尔滨', '齐齐哈尔', '牡丹江'],
    '江苏': ['南京', '苏州', '无锡', '常州', '扬州'],
    '浙江': ['杭州', '宁波', '温州', '绍兴', '嘉兴'],
    '安徽': ['合肥', '芜湖', '黄山'],
    '福建': ['福州', '厦门', '泉州'],
    '江西': ['南昌', '赣州', '上饶'],
    '山东': ['济南', '青岛', '烟台', '威海'],
    '河南': ['郑州', '洛阳', '开封'],
    '湖北': ['武汉', '宜昌', '襄阳'],
    '湖南': ['长沙', '张家界', '岳阳'],
    '广东': ['广州', '深圳', '珠海', '佛山'],
    '广西': ['南宁', '桂林', '北海'],
    '海南': ['海口', '三亚'],
    '四川': ['成都', '绵阳', '乐山', '九寨沟'],
    '贵州': ['贵阳', '遵义', '安顺'],
    '云南': ['昆明', '大理', '丽江', '西双版纳'],
    '西藏': ['拉萨', '林芝', '日喀则'],
    '陕西': ['西安', '咸阳', '延安'],
    '甘肃': ['兰州', '敦煌', '天水'],
    '青海': ['西宁', '海东'],
    '宁夏': ['银川', '中卫'],
    '新疆': ['乌鲁木齐', '喀什', '伊宁'],
    '香港': ['香港'],
    '澳门': ['澳门'],
    '台湾': ['台北', '台中', '高雄']
};

function populateProvinceCitySelect(selectEl, placeholderText) {
    if (!selectEl) return;

    selectEl.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholderText;
    selectEl.appendChild(placeholderOption);

    Object.entries(PROVINCE_CITY_MAP).forEach(([province, cities]) => {
        const group = document.createElement('optgroup');
        group.label = province;

        cities.forEach((city) => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            group.appendChild(option);
        });

        selectEl.appendChild(group);
    });
}

function initTravelCitySelects() {
    const departureSelect = document.getElementById('departure');
    const destinationSelect = document.getElementById('destination');

    populateProvinceCitySelect(departureSelect, '请选择出发城市');
    populateProvinceCitySelect(destinationSelect, '请选择目的地城市');

    if (departureSelect) departureSelect.value = '南京';
    if (destinationSelect) destinationSelect.value = '杭州';

    bindTravelModeBehavior();
    syncTravelModeDestination();
}

function syncTravelModeDestination() {
    const travelModeEl = document.getElementById('travelMode');
    const departureSelect = document.getElementById('departure');
    const destinationSelect = document.getElementById('destination');
    if (!travelModeEl || !departureSelect || !destinationSelect) return;

    const isSameCity = travelModeEl.value === 'same_city';

    if (isSameCity) {
        if (departureSelect.value) {
            destinationSelect.value = departureSelect.value;
        }
        destinationSelect.disabled = true;
        destinationSelect.style.opacity = '0.7';
        destinationSelect.style.cursor = 'not-allowed';
    } else {
        destinationSelect.disabled = false;
        destinationSelect.style.opacity = '';
        destinationSelect.style.cursor = '';
    }
}

function bindTravelModeBehavior() {
    if (travelModeBehaviorBound) return;

    const travelModeEl = document.getElementById('travelMode');
    const departureSelect = document.getElementById('departure');
    if (!travelModeEl || !departureSelect) return;

    travelModeEl.addEventListener('change', syncTravelModeDestination);
    departureSelect.addEventListener('change', syncTravelModeDestination);

    travelModeBehaviorBound = true;
}

// 获取当前用户ID
function getCurrentUserId() {
    if (!currentUserId) {
        currentUserId = getAuthUserId();
    }
    return currentUserId;
}

// 打开旅行弹窗（替换原来的 toggleTravelState）
function toggleTravelState() {
    const modal = document.getElementById('travelModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// 关闭旅行弹窗
function closeTravelModal() {
    const modal = document.getElementById('travelModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 开始漫游计划
async function startTravelPlan() {
    const travelMode = document.getElementById('travelMode').value;
    const departure = document.getElementById('departure').value.trim();
    const destination = document.getElementById('destination').value.trim();
    
    if (!departure || !destination) {
        showToast('请填写出发地和目的地', 'error');
        return;
    }
    
    const confirmBtn = document.querySelector('.modal-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '正在生成漫游计划...';
    
    try {
        // 1. 生成漫游计划
        console.log('📝 正在生成漫游计划...');
        const generateResult = await apiJsonRequest('/travel/plan/generate', {
            method: 'POST',
            body: {
                destination,
                travelMode,
                currentLocation: departure
            }
        });

        if (!generateResult?.data) {
            throw new Error('生成漫游计划失败：服务返回数据为空');
        }

        if (generateResult.warning) {
            console.warn(`⚠️ ${generateResult.warning}`);
        }

        console.log('✅ 漫游计划生成成功:', generateResult.data);
        
        // 2. 开始漫游
        console.log('🚀 开始漫游...');
        const startResult = await apiJsonRequest('/travel/plan/start', {
            method: 'POST',
            body: {
                destination,
                departure,
                travelMode,
                estimatedDays: generateResult.data.estimatedDays,
                dailyPlans: generateResult.data.dailyPlans
            }
        });

        console.log('✅ 旅行已开始:', startResult.data);

        const startedPlanId = startResult?.data?.planId;
        if (startedPlanId) {
            sessionStorage.removeItem(getCompletionNoticeKey(startedPlanId));
        }
        
        // 3. 关闭弹窗
        closeTravelModal();
        
        // 4. 显示旅行进行中的UI
        showTravelProgress(startResult.data);
        
        // 5. 开始轮询进度
        startProgressPolling();
        
        showToast(`漫游计划已生成！共 ${generateResult.data.estimatedDays} 天，${generateResult.data.dailyPlans.length} 个景点`, 'success');
        
    } catch (error) {
        console.error('❌ 漫游计划创建失败:', error);
        showToast('创建漫游计划失败: ' + error.message, 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '开始漫游 🚀';
    }
}

// 显示旅行进行中的UI
function showTravelProgress(travelData) {
    const startUI = document.getElementById('travel-start-ui');
    const ongoingUI = document.getElementById('travel-ongoing-ui');
    
    if (startUI) startUI.style.display = 'none';
    if (ongoingUI) ongoingUI.style.display = 'block';
    
    // 保存当前旅行计划
    currentTravelPlan = travelData;
    
    // 动态生成 Todo 卡片
    renderTravelCards(travelData);
    updateTravelCardStatuses(travelData);
}

// 渲染旅行卡片
function renderTravelCards(travelData) {
    const wrapper = document.querySelector('.todo-cards-wrapper');
    if (!wrapper) return;
    
    // 清空现有内容
    wrapper.innerHTML = '';
    
    // 获取每日计划
    const dailyPlans = travelData.dailyPlans || [];
    const estimatedDays = travelData.estimatedDays || 1;
    const destination = travelData.destination || '旅行';
    const currentDay = travelData.currentDay || 1;
    const stepIndex = travelData.stepIndex || 0;
    
    // 按天分组
    const dayGroups = {};
    dailyPlans.forEach(plan => {
        const day = plan.day || 1;
        if (!dayGroups[day]) {
            dayGroups[day] = [];
        }
        dayGroups[day].push(plan);
    });
    
    // 为每一天创建卡片
    for (let day = 1; day <= estimatedDays; day++) {
        const spots = dayGroups[day] || [];
        const dayColors = ['day-1', 'day-2', 'day-3'];
        const colorClass = dayColors[(day - 1) % 3];
        
        const card = document.createElement('div');
        card.className = 'todo-list-card';
        card.innerHTML = `
            <div class="todo-header ${colorClass}">
                <span>${destination}${estimatedDays}日游</span>
                <span style="font-size: 14px; background: #fff; padding: 2px 8px; border: 2px solid #000; border-radius: 10px;">Day ${day}</span>
            </div>
            <div class="todo-list-content" id="day-${day}-content">
                ${spots.map((spot, idx) => {
                    const globalIdx = dailyPlans.indexOf(spot);
                    const isCompleted = day < currentDay || (day === currentDay && globalIdx < stepIndex);
                    const isActive = day === currentDay && globalIdx === stepIndex;
                    const isPending = day > currentDay || (day === currentDay && globalIdx > stepIndex);
                    
                    let statusIcon = '';
                    let statusClass = '';
                    let timeText = '';
                    
                    if (isCompleted) {
                        statusIcon = '<i class="ri-check-line"></i>';
                        statusClass = 'completed';
                        timeText = `已完成 • 耗时 ${spot.duration}分钟`;
                    } else if (isActive) {
                        statusIcon = '<i class="ri-map-pin-user-fill"></i>';
                        statusClass = '';
                        timeText = '正在游览中...';
                    } else {
                        statusIcon = '<i class="ri-arrow-right-line"></i>';
                        statusClass = '';
                        timeText = `待前往 • 预计 ${spot.duration}分钟`;
                    }
                    
                    return `
                        <div class="todo-item ${statusClass}" data-global-idx="${globalIdx}" ${isPending ? 'style="opacity: 0.6;"' : ''}>
                            <div class="todo-status-icon ${isActive ? 'active' : ''} ${isCompleted ? 'done' : ''}">${statusIcon}</div>
                            <div class="todo-content">
                                <div class="todo-text" ${isActive ? 'style="color: var(--accent-blue);"' : ''}>${spot.location}</div>
                                <div class="todo-time" id="countdown-${globalIdx}">${timeText}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        wrapper.appendChild(card);
    }
    
    // 滚动到当前天的卡片
    setTimeout(() => {
        const currentCard = wrapper.children[currentDay - 1];
        if (currentCard) {
            currentCard.scrollIntoView({ behavior: 'smooth', inline: 'center' });
        }
    }, 100);
}

function updateTravelCardStatuses(progressData) {
    if (!currentTravelPlan?.dailyPlans?.length) return;

    const dailyPlans = currentTravelPlan.dailyPlans;
    const currentDay = progressData.currentDay || 1;
    const stepIndex = progressData.stepIndex || 0;

    dailyPlans.forEach((spot, globalIdx) => {
        const item = document.querySelector(`.todo-item[data-global-idx="${globalIdx}"]`);
        if (!item) return;

        const iconEl = item.querySelector('.todo-status-icon');
        const textEl = item.querySelector('.todo-text');
        const timeEl = document.getElementById(`countdown-${globalIdx}`);
        if (!iconEl || !textEl || !timeEl) return;

        const day = spot.day || 1;
        const isCompleted = day < currentDay || (day === currentDay && globalIdx < stepIndex);
        const isActive = day === currentDay && globalIdx === stepIndex;
        const isPending = day > currentDay || (day === currentDay && globalIdx > stepIndex);

        item.classList.toggle('completed', isCompleted);
        item.style.opacity = isPending ? '0.6' : '';

        iconEl.classList.toggle('active', isActive);
        iconEl.classList.toggle('done', isCompleted);
        if (isCompleted) {
            iconEl.innerHTML = '<i class="ri-check-line"></i>';
        } else if (isActive) {
            iconEl.innerHTML = '<i class="ri-map-pin-user-fill"></i>';
        } else {
            iconEl.innerHTML = '<i class="ri-arrow-right-line"></i>';
        }

        textEl.style.color = isActive ? 'var(--accent-blue)' : '';

        if (isCompleted) {
            timeEl.textContent = `已完成 • 耗时 ${spot.duration}分钟`;
        } else if (isActive) {
            const remainingText = timeEl.textContent.includes('还剩') || timeEl.textContent.includes('预计还需')
                ? timeEl.textContent
                : '正在游览中...';
            timeEl.textContent = remainingText;
        } else {
            timeEl.textContent = `待前往 • 预计 ${spot.duration}分钟`;
        }
    });
}

// 开始轮询进度
function startProgressPolling() {
    stopProgressPolling();
    
    // 每秒查询一次进度
    travelProgressInterval = setInterval(async () => {
        if (progressRequestInFlight) return;
        progressRequestInFlight = true;

        try {
            const result = await apiRequest(`/travel/progress/${getCurrentUserId()}`);
            if (result.data) {
                updateTravelUI(result.data);

                if (result.data.diaryStatus?.queued) {
                    const logKey = `${result.data.planId}-${result.data.diaryStatus.day}-${result.data.diaryStatus.finalDay ? 'final' : 'daily'}`;
                    if (lastDiaryQueueLogKey !== logKey) {
                        lastDiaryQueueLogKey = logKey;
                        const diaryType = result.data.diaryStatus.finalDay ? '最终日' : '当日';
                        console.log(`📮 ${diaryType}日记已加入生成队列: 第${result.data.diaryStatus.day}天 (${result.data.diaryStatus.destination})`);
                    }
                }
                
                // 如果旅行已完成，停止轮询
                if (result.data.status === 'completed') {
                    stopProgressPolling();

                    if (!isCompletionNotified(result.data.planId)) {
                        markCompletionNotified(result.data.planId);
                        showToast('🎉 旅行已完成！', 'success');
                    }

                    resetToTravelStartUI();
                }
            } else {
                stopProgressPolling();
                resetToTravelStartUI();
            }
        } catch (error) {
            console.error('获取进度失败:', error);
        } finally {
            progressRequestInFlight = false;
        }
    }, 1000);
}

// 更新旅行UI
function updateTravelUI(progressData) {
    // 计算剩余秒数
    if (progressData.expectedCompleteTime) {
        const now = new Date();
        const expectedTime = new Date(progressData.expectedCompleteTime);
        const remainingMs = expectedTime - now;
        const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        
        // 更新倒计时显示
        const countdownEl = document.getElementById(`countdown-${progressData.stepIndex}`);
        if (countdownEl) {
            if (remainingSeconds > 60) {
                const minutes = Math.floor(remainingSeconds / 60);
                countdownEl.textContent = `正在游览中... 预计还需 ${minutes} 分钟`;
            } else if (remainingSeconds > 0) {
                countdownEl.textContent = `正在游览中... 还剩 ${remainingSeconds} 秒`;
            } else {
                countdownEl.textContent = `即将前往下一站...`;
            }
        }
    }
    
    // 如果进度变化，重新渲染卡片
    if (currentTravelPlan) {
        currentTravelPlan = { ...currentTravelPlan, ...progressData };
        updateTravelCardStatuses(progressData);
    }
}

// 页面加载时检查是否有正在进行的旅行
window.addEventListener('DOMContentLoaded', async () => {
    initTravelCitySelects();

    const userId = getCurrentUserId();
    if (!userId) {
        console.log('用户未登录，跳过旅行状态检查');
        return;
    }
    
    try {
        const result = await apiRequest(`/travel/progress/${userId}`);
        if (result.data && (result.data.status === 'traveling' || result.data.status === 'completed')) {
            console.log('发现旅行记录，恢复旅行面板...');
            showTravelProgress(result.data);

            if (result.data.status === 'traveling') {
                startProgressPolling();
            } else {
                resetToTravelStartUI();
            }
        } else {
            resetToTravelStartUI();
        }
    } catch (error) {
        console.log('检查旅行状态失败:', error);
        resetToTravelStartUI();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopProgressPolling();
        return;
    }

    if (currentTravelPlan?.status === 'traveling') {
        startProgressPolling();
    }
});

window.addEventListener('pagehide', () => {
    stopProgressPolling();
});

window.toggleTravelState = toggleTravelState;
window.closeTravelModal = closeTravelModal;
window.startTravelPlan = startTravelPlan;
