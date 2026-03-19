import axios from 'axios';
import { callDeepSeek } from './deepseek.js';

const AMAP_KEY = process.env.AMAP_KEY || 'eff8ab024dd806b392d1216eb0f7abdb';

// 城市坐标数据
const CITY_COORDS = {
    '北京': [39.9042, 116.4074], '上海': [31.2304, 121.4737], '天津': [39.1422, 117.1767],
    '重庆': [29.4316, 106.9123], '石家庄': [38.0428, 114.5149], '太原': [37.8706, 112.5489],
    '呼和浩特': [40.8414, 111.7519], '沈阳': [41.8057, 123.4328], '长春': [43.8171, 125.3235],
    '哈尔滨': [45.8038, 126.5340], '南京': [32.0603, 118.7969], '杭州': [30.2741, 120.1551],
    '合肥': [31.8206, 117.2272], '福州': [26.0745, 119.2965], '南昌': [28.6829, 115.8579],
    '济南': [36.6512, 117.1205], '郑州': [34.7466, 113.6253], '武汉': [30.5928, 114.3055],
    '长沙': [28.2282, 112.9388], '广州': [23.1291, 113.2644], '南宁': [22.8170, 108.3665],
    '海口': [20.0444, 110.1999], '成都': [30.5728, 104.0668], '贵阳': [26.6470, 106.6302],
    '昆明': [25.0406, 102.7123], '拉萨': [29.6520, 91.1722], '西安': [34.3416, 108.9398],
    '兰州': [36.0611, 103.8343], '西宁': [36.6171, 101.7782], '银川': [38.4872, 106.2309],
    '乌鲁木齐': [43.8256, 87.6168], '深圳': [22.5431, 114.0579], '厦门': [24.4798, 118.0894],
    '宁波': [29.8683, 121.5440], '青岛': [36.0671, 120.3826], '大连': [38.9140, 121.6147],
    '苏州': [31.2989, 120.5853], '无锡': [31.4912, 120.3119]
};

/**
 * 获取地点坐标（高德地图 API）
 */
async function getLocationCoordinates(locationName, city) {
    try {
        const response = await axios.get('https://restapi.amap.com/v3/geocode/geo', {
            params: {
                address: locationName,
                city: city,
                key: AMAP_KEY
            }
        });

        if (response.data.status === '1' && response.data.geocodes?.length > 0) {
            const geocode = response.data.geocodes[0];
            const [lng, lat] = geocode.location.split(',').map(Number);
            return { lat, lng, name: locationName };
        }
        return null;
    } catch (error) {
        console.error('获取坐标失败:', error.message);
        return null;
    }
}

/**
 * 批量获取景点坐标
 */
async function batchGetLocationCoordinates(locations, city) {
    const results = [];
    for (const name of locations) {
        const loc = await getLocationCoordinates(name, city);
        if (loc) {
            results.push(loc);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return results;
}

/**
 * 生成旅行计划
 */
async function generateTravelPlan(userId, destination, travelMode, currentLocation, db) {
    try {
        console.log(`📝 开始为用户 ${userId} 生成旅行计划: ${currentLocation} → ${destination}`);
        
        // 1. 获取用户记忆（如果有 user_memories 表）
        let memoriesText = '';
        try {
            const memories = db.prepare(`
                SELECT category, title, content FROM user_memories WHERE user_id = ?
            `).all(userId);
            
            if (memories && memories.length > 0) {
                memoriesText = memories.map(m => `${m.category || m.title}: ${m.content}`).join('\n');
            }
        } catch (error) {
            console.log('⚠️ user_memories 表不存在，跳过记忆获取');
        }
        
        // 2. 构建提示词
        const travelModeText = {
            plane: '飞机',
            train: '火车',
            car: '汽车',
            same_city: '同城漫步'
        }[travelMode] || '同城漫步';

        const prompt = `你是一个专业的旅行规划助手。请根据以下信息为用户制定完整的旅行计划。

【旅行信息】
- 出发地：${currentLocation}
- 目的地：${destination}
- 出行方式：${travelModeText}

【用户偏好】
${memoriesText || '暂无'}

【重要规则】
1. 游玩时间安排：
   - 每天游玩时间：最多10小时
   - 每天景点数量：3-5个
   - 单个景点停留时间：60-180分钟（测试模式下会调整为5秒）

2. 预估天数：1-5天
3. 行程要符合用户的兴趣偏好

【输出格式】
严格按照以下 JSON 格式输出：

{"estimatedDays":天数,"dailyPlans":[{"day":天数,"location":"地点名称","description":"活动描述","duration":分钟数}]}

【示例】
杭州3天游：
{"estimatedDays":3,"dailyPlans":[
  {"day":1,"location":"西湖","description":"游览西湖风光","duration":120},
  {"day":1,"location":"灵隐寺","description":"参观古刹","duration":90},
  {"day":2,"location":"宋城","description":"观看演出","duration":150},
  {"day":2,"location":"河坊街","description":"品尝美食","duration":80},
  {"day":3,"location":"西溪湿地","description":"自然风光","duration":100}
]}

请根据目的地"${destination}"和出行方式"${travelModeText}"生成旅行计划，直接输出JSON：`;

        // 3. 调用 DeepSeek API
        console.log('🤖 调用 DeepSeek API 生成旅行计划...');
        const content = await callDeepSeek(
            '你是一个旅行规划助手。你必须只输出纯JSON格式的旅行计划，不要输出任何其他文字。',
            prompt,
            { max_tokens: 4000 }
        );

        // 4. 解析 JSON
        let jsonStr = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('AI 返回的内容不是有效的 JSON');
        }
        
        const planData = JSON.parse(jsonMatch[0]);
        console.log('✅ 旅行计划解析成功');

        // 5. 验证和修正数据
        const estimatedDays = Math.min(Math.max(parseInt(planData.estimatedDays) || 3, 1), 5);
        let dailyPlans = (Array.isArray(planData.dailyPlans) ? planData.dailyPlans : [])
            .filter(step => step && step.location && step.description)
            .map((step, index) => ({
                day: parseInt(step.day) || Math.floor(index / 4) + 1,
                location: String(step.location).substring(0, 30),
                description: String(step.description).substring(0, 100),
                duration: 1, // 🧪 测试模式：每个景点 1 分钟（实际会在前端转为5秒）
            }));

        // 6. 获取景点坐标
        console.log('📍 开始获取景点坐标...');
        const locationNames = dailyPlans.map(s => s.location);
        const coordinates = await batchGetLocationCoordinates(locationNames, destination);
        
        // 7. 将坐标添加到景点
        for (let i = 0; i < dailyPlans.length; i++) {
            const coord = coordinates.find(c => c.name === dailyPlans[i].location);
            if (coord) {
                dailyPlans[i].lat = coord.lat;
                dailyPlans[i].lng = coord.lng;
            } else {
                const cityCoord = CITY_COORDS[destination];
                if (cityCoord) {
                    dailyPlans[i].lat = cityCoord[0];
                    dailyPlans[i].lng = cityCoord[1];
                }
            }
        }

        console.log(`✅ 旅行计划生成完成：${estimatedDays} 天，${dailyPlans.length} 个景点`);

        return { estimatedDays, dailyPlans };
        
    } catch (error) {
        console.error('❌ 生成旅行计划失败:', error);
        
        // 返回兜底计划
        console.log('⚠️ 使用兜底旅行计划');
        return {
            estimatedDays: 2,
            dailyPlans: [
                { day: 1, location: destination, description: '探索当地风光', duration: 1, lat: CITY_COORDS[destination]?.[0], lng: CITY_COORDS[destination]?.[1] },
                { day: 1, location: `${destination}市中心`, description: '品尝当地美食', duration: 1, lat: CITY_COORDS[destination]?.[0], lng: CITY_COORDS[destination]?.[1] },
                { day: 2, location: `${destination}著名景点`, description: '游览主要景点', duration: 1, lat: CITY_COORDS[destination]?.[0], lng: CITY_COORDS[destination]?.[1] },
            ],
        };
    }
}

export {
    generateTravelPlan,
    getLocationCoordinates,
    batchGetLocationCoordinates
};
