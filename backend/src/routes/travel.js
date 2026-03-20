import { Router } from 'express';
import { generateTravelPlan } from '../services/travel-plan-generator.js';
import { generateDailyRoamingSummary } from '../services/deepseek.js';
import { getPgPool } from '../database/pg-client.js';
import { ensureSameUserParam, getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js';

const router = Router();
const SPOT_STAY_SECONDS = 15;

const CITY_CENTER = {
    南京: { lat: 32.060255, lng: 118.796877 },
    杭州: { lat: 30.274085, lng: 120.15507 },
    上海: { lat: 31.230416, lng: 121.473701 },
    北京: { lat: 39.9042, lng: 116.4074 }
};

function resolvePlanningCity({ destination, currentLocation }) {
    const destinationCity = String(destination || '').trim();
    const departureCity = String(currentLocation || '').trim();
    return destinationCity || departureCity || '南京';
}

function pickNearestSpot(anchor, candidates) {
    if (!anchor || !Array.isArray(candidates) || candidates.length === 0) {
        return { picked: null, rest: [] };
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < candidates.length; i++) {
        const spot = candidates[i];
        const distance = haversineDistanceMeters(anchor.lat, anchor.lng, Number(spot.lat), Number(spot.lng));
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
        }
    }

    const picked = candidates[bestIndex];
    const rest = candidates.filter((_, index) => index !== bestIndex);
    return { picked, rest };
}

function pickRandomSpot(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return { picked: null, rest: [] };
    }

    const randomIndex = Math.floor(Math.random() * candidates.length);
    const picked = candidates[randomIndex];
    const rest = candidates.filter((_, index) => index !== randomIndex);
    return { picked, rest };
}

const TEMPLATE_SPOTS = {
    南京: [
        { location_name: '夫子庙', content: '沿秦淮河夜游与小吃探索', category: '逛', lat: 32.023911, lng: 118.78858 },
        { location_name: '老门东', content: '历史街区慢逛，感受市井与文创', category: '逛', lat: 32.015473, lng: 118.785493 },
        { location_name: '玄武湖', content: '湖畔散步与放松', category: '玩', lat: 32.073216, lng: 118.801533 }
    ],
    杭州: [
        { location_name: '西湖', content: '环湖散步，体验城市景观', category: '玩', lat: 30.24306, lng: 120.150481 },
        { location_name: '河坊街', content: '老街美食和手作店打卡', category: '吃', lat: 30.246845, lng: 120.170146 },
        { location_name: '龙井村', content: '茶园观景与轻徒步', category: '玩', lat: 30.21895, lng: 120.107568 }
    ]
};

function clampDays(days) {
    const n = Number(days);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(5, n));
}

function normalizeLocationName(spot) {
    return String(spot.location_name || spot.title || spot.city || '旅行地点').slice(0, 40);
}

function normalizeDescription(spot) {
    const raw = String(spot.content || spot.tags || '城市漫游打卡').replace(/\s+/g, ' ').trim();
    return raw ? raw.slice(0, 80) : '城市漫游打卡';
}

function inferSpotCategory(spot = {}) {
    if (spot.category) return spot.category;
    const source = `${spot.title || ''} ${spot.content || ''} ${spot.tags || ''}`;
    if (/(美食|咖啡|奶茶|餐厅|火锅|小吃|甜品|吃|饭)/i.test(source)) return '吃';
    if (/(citywalk|街区|拍照|书店|展览|逛|夜市)/i.test(source)) return '逛';
    return '玩';
}

function parseJsonValue(value, fallback = []) {
    if (value === undefined || value === null || value === '') return fallback;
    if (Array.isArray(value) || typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function sanitizeDailyPlans(rawPlans) {
    const source = Array.isArray(rawPlans) ? rawPlans : [];
    const cleaned = [];

    source.forEach((spot, index) => {
        if (!spot || typeof spot !== 'object') return;

        const rawLocation = typeof spot.location === 'string' ? spot.location.trim() : '';
        if (!rawLocation) return;

        const parsedDay = Number(spot.day);
        const safeDay = Number.isFinite(parsedDay) && parsedDay > 0
            ? Math.floor(parsedDay)
            : Math.floor(index / 3) + 1;

        cleaned.push({
            ...spot,
            day: safeDay,
            location: rawLocation
        });
    });

    return cleaned;
}

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371e3;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildMinimalFallbackPlan(destination) {
    const template = TEMPLATE_SPOTS[destination] || [];
    if (template.length >= 3) {
        return buildRoamingPlanFromSpots(destination, template);
    }

    const center = CITY_CENTER[destination] || CITY_CENTER['南京'];
    return {
        estimatedDays: 1,
        dailyPlans: [
            { day: 1, location: `${destination}城市漫步`, description: '从城市中心开始漫游', duration: SPOT_STAY_SECONDS, lat: center.lat, lng: center.lng, category: '逛' },
            { day: 1, location: `${destination}特色美食`, description: '寻找本地口味体验', duration: SPOT_STAY_SECONDS, lat: center.lat, lng: center.lng, category: '吃' },
            { day: 1, location: `${destination}夜景散步`, description: '收尾放松，感受城市夜色', duration: SPOT_STAY_SECONDS, lat: center.lat, lng: center.lng, category: '玩' }
        ]
    };
}

function shuffleArray(input) {
    const arr = [...input];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function buildRoamingPlanFromSpots(destination, spots, options = {}) {
    const unique = [];
    const seen = new Set();

    for (const spot of spots) {
        const key = `${normalizeLocationName(spot)}_${spot.lat}_${spot.lng}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(spot);
    }

    const routableSpots = unique
        .map((spot) => ({
            ...spot,
            lat: Number(spot.lat),
            lng: Number(spot.lng),
            category: inferSpotCategory(spot)
        }))
        .filter((spot) => Number.isFinite(spot.lat) && Number.isFinite(spot.lng));

    const targetCount = Math.max(3, Math.min(12, routableSpots.length));
    const cityCenter = CITY_CENTER[destination] || null;
    const cityScopedSpots = cityCenter
        ? routableSpots.filter((spot) => haversineDistanceMeters(cityCenter.lat, cityCenter.lng, spot.lat, spot.lng) <= 70000)
        : routableSpots;
    const basePool = cityScopedSpots.length >= 3 ? cityScopedSpots : routableSpots;

    let remaining = [...basePool];
    const selected = [];

    const firstPick = pickRandomSpot(remaining);
    if (firstPick.picked) {
        selected.push(firstPick.picked);
        remaining = firstPick.rest;
    }

    while (selected.length < targetCount && remaining.length > 0) {
        const lastSpot = selected[selected.length - 1];
        const anchor = lastSpot
            ? { lat: Number(lastSpot.lat), lng: Number(lastSpot.lng) }
            : null;

        if (!anchor) break;

        const nearest = pickNearestSpot(anchor, remaining);
        if (!nearest.picked) {
            break;
        }

        selected.push(nearest.picked);
        remaining = nearest.rest;
    }

    if (!selected.length) {
        return buildMinimalFallbackPlan(destination);
    }

    const spotsPerDay = 3;
    const estimatedDays = clampDays(Math.ceil(selected.length / spotsPerDay));

    const dailyPlans = selected.map((spot, index) => ({
        day: clampDays(Math.floor(index / spotsPerDay) + 1),
        location: normalizeLocationName(spot),
        description: normalizeDescription(spot),
        duration: SPOT_STAY_SECONDS,
        lat: Number(spot.lat),
        lng: Number(spot.lng),
        mood: spot.mood || null,
        imageUrl: spot.image_url || null,
        category: spot.category || inferSpotCategory(spot),
        tags: spot.tags || null
    }));

    return { estimatedDays, dailyPlans };
}

async function fetchCandidatePostsByCity(city) {
    const pool = getPgPool();
    const result = await pool.query(`
        SELECT id, title, content, tags, mood, category, city, location_name, lat, lng, image_url, created_at
        FROM posts
        WHERE city = $1 AND is_public = 1
        ORDER BY created_at DESC
        LIMIT 200
    `, [city]);
    return result.rows;
}

function queueDiaryMailGeneration({
    planId,
    userId,
    destination,
    day,
    daySpots,
    sendSummary = false,
    estimatedDays = 0,
    allSpotsText = ''
}) {
    setTimeout(async () => {
        const pool = getPgPool();
        try {
            const existed = await pool.query(
                'SELECT id FROM travel_diaries WHERE plan_id = $1 AND day = $2 LIMIT 1',
                [planId, day]
            );

            if (existed.rows.length > 0) {
                console.log(`ℹ️ 第${day}天日记已存在，跳过重复生成`);
                return;
            }

            const dailyIdempotencyKey = `${planId}:${day}`;
            const existedDailyMail = await pool.query(
                `SELECT id FROM mails
                 WHERE user_id = $1 AND mail_type = 'diary' AND extra_data ->> 'idempotencyKey' = $2
                 LIMIT 1`,
                [userId, dailyIdempotencyKey]
            );

            if (existedDailyMail.rows.length > 0) {
                console.log(`ℹ️ 第${day}天总结邮件已存在（幂等键命中），跳过重复发送`);
                return;
            }

            console.log(`🧠 正在异步生成第${day}天漫游总结邮件...`);
            const summaryMail = await generateDailyRoamingSummary(destination, day, daySpots || []);
            const visitedPlaces = (daySpots || []).map(spot => spot.location).filter(Boolean).join('、');

            await pool.query(
                `INSERT INTO travel_diaries (plan_id, user_id, day, destination, content, visited_places)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [planId, userId, day, destination, summaryMail.content, visitedPlaces || null]
            );

            await pool.query(
                `INSERT INTO mails (user_id, sender_type, mail_type, title, content, extra_data)
                 VALUES ($1, 'ai', 'diary', $2, $3, $4::jsonb)`,
                [
                    userId,
                    summaryMail.title || `${destination} 第${day}天漫游总结`,
                    summaryMail.content,
                    JSON.stringify({
                        day,
                        destination,
                        senderName: summaryMail.senderName || '你的旅行分身',
                        recommended: summaryMail.recommended || [],
                        notRecommended: summaryMail.notRecommended || [],
                        nextDaySuggestion: summaryMail.nextDaySuggestion || '建议按片区错峰出行',
                        idempotencyKey: dailyIdempotencyKey
                    })
                ]
            );

            console.log(`✅ 第${day}天漫游总结已异步生成并发送到收信箱`);

            if (sendSummary) {
                const summaryTitle = `🗺️ ${destination}旅行完成！`;
                const finalSummaryKey = `${planId}:final`;
                const existedSummary = await pool.query(
                    `SELECT id FROM mails
                     WHERE user_id = $1 AND (title = $2 OR extra_data ->> 'idempotencyKey' = $3)
                     LIMIT 1`,
                    [userId, summaryTitle, finalSummaryKey]
                );

                if (existedSummary.rows.length === 0) {
                    const summaryContent = `🎉 恭喜你完成了 ${destination} ${estimatedDays} 日游！\n\n` +
                        `📍 你游览了以下景点：\n${allSpotsText}\n\n` +
                        `📝 旅行日记已为你生成，快去查看吧！\n\n` +
                        `期待你的下一次旅行 ✨`;

                    await pool.query(
                        `INSERT INTO mails (user_id, sender_type, mail_type, title, content, extra_data)
                         VALUES ($1, 'ai', 'diary', $2, $3, $4::jsonb)`,
                        [
                            userId,
                            summaryTitle,
                            summaryContent,
                            JSON.stringify({
                                destination,
                                estimatedDays,
                                idempotencyKey: finalSummaryKey
                            })
                        ]
                    );

                    console.log('✅ 旅行总结邮件已发送到收信箱');
                }
            }
        } catch (error) {
            console.error(`❌ 异步生成第${day}天日记失败:`, error);
        }
    }, 0);
}

// 生成漫游计划（优先真实帖子池，AI兜底）
router.post('/plan/generate', requireAuthenticatedUser, async (req, res) => {
    const { destination, travelMode, currentLocation } = req.body || {};
    const userId = getAuthenticatedUserId(req);

    try {
        if (!userId || !destination || !currentLocation) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少必要参数：destination, currentLocation' 
            });
        }

        const planningCity = resolvePlanningCity({ destination, currentLocation, travelMode });
        console.log(`📝 收到生成漫游计划请求: 用户${userId}, ${currentLocation} → ${destination} (规划城市: ${planningCity})`);

        let planData = null;
        let warning = null;

        try {
            const candidatePosts = await fetchCandidatePostsByCity(planningCity);
            if (candidatePosts.length >= 3) {
                planData = buildRoamingPlanFromSpots(planningCity, candidatePosts, { currentLocation });
                console.log(`🧭 使用真实帖子池生成漫游计划: ${candidatePosts.length} 条候选`);
            } else {
                const template = TEMPLATE_SPOTS[planningCity] || [];
                planData = buildRoamingPlanFromSpots(planningCity, [...candidatePosts, ...template], { currentLocation });
                warning = '规划城市帖子不足，已混合模板点位生成漫游计划';
                console.log(`⚠️ 城市帖子不足(${candidatePosts.length})，回退模板点位`);
            }
        } catch (candidateError) {
            console.error('⚠️ 候选池查询失败，回退最小计划:', candidateError.message);
            planData = buildMinimalFallbackPlan(planningCity);
            warning = '候选池异常，已使用最小可运行计划';
        }

        if (!planData || !Array.isArray(planData.dailyPlans) || planData.dailyPlans.length === 0) {
            planData = buildMinimalFallbackPlan(planningCity);
            warning = warning || '候选池为空，已使用最小可运行计划';
        }
        
        console.log(`✅ 漫游计划生成成功: ${planData.estimatedDays} 天, ${planData.dailyPlans.length} 个景点`);

        const response = { success: true, data: planData };
        if (warning) response.warning = warning;
        res.json(response);
    } catch (error) {
        console.error('❌ 生成旅行计划失败:', error);

        const fallbackDestination = destination || currentLocation || '南京';
        const fallbackPlan = buildMinimalFallbackPlan(fallbackDestination);

        res.json({
            success: true,
            data: fallbackPlan,
            fallback: true,
            warning: '旅行计划生成服务异常，已使用兜底行程'
        });
    }
});

// 创建旅行计划并开始旅行
router.post('/plan/start', requireAuthenticatedUser, async (req, res) => {
    try {
        const { destination, departure, travelMode, estimatedDays, dailyPlans } = req.body;
        const userId = getAuthenticatedUserId(req);
        const safeDailyPlans = sanitizeDailyPlans(dailyPlans);
        
        if (!userId || !destination || !Array.isArray(dailyPlans) || safeDailyPlans.length === 0) {
            return res.status(400).json({ success: false, error: '缺少必要参数' });
        }

        const pool = getPgPool();
        const insertResult = await pool.query(
            `INSERT INTO travel_plans (user_id, destination, departure, travel_mode, estimated_days, daily_plans, plan_status)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'active')
             RETURNING id`,
            [userId, destination, departure || null, travelMode, estimatedDays, JSON.stringify(safeDailyPlans)]
        );

        const planId = insertResult.rows[0].id;
        const firstStep = safeDailyPlans[0];
        const now = new Date();
        const expectedCompleteTime = new Date(now.getTime() + SPOT_STAY_SECONDS * 1000);

        await pool.query(
            `INSERT INTO travel_progress (user_id, plan_id, current_day, step_index, progress_status, location, remaining_seconds, expected_complete_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (user_id)
             DO UPDATE SET
               plan_id = EXCLUDED.plan_id,
               current_day = EXCLUDED.current_day,
               step_index = EXCLUDED.step_index,
               progress_status = EXCLUDED.progress_status,
               location = EXCLUDED.location,
               remaining_seconds = EXCLUDED.remaining_seconds,
               expected_complete_time = EXCLUDED.expected_complete_time,
               last_update = NOW()`,
            [userId, planId, firstStep.day || 1, 0, 'traveling', firstStep.location, SPOT_STAY_SECONDS, expectedCompleteTime.toISOString()]
        );

        await pool.query(
            `UPDATE users
             SET footprint_count = COALESCE(footprint_count, 0) + 1
             WHERE id = $1`,
            [userId]
        );
        
        console.log(`✅ 旅行开始: 计划ID=${planId}, 第一站: ${firstStep.location}, 预计完成: ${expectedCompleteTime.toISOString()}`);

        return res.json({ 
            success: true, 
            data: { 
                planId,
                userId,
                destination,
                estimatedDays,
                dailyPlans: safeDailyPlans,
                currentProgress: {
                    stepIndex: 0,
                    location: firstStep.location,
                    remainingSeconds: SPOT_STAY_SECONDS,
                    expectedCompleteTime: expectedCompleteTime.toISOString()
                }
            } 
        });
    } catch (error) {
        console.error('创建旅行计划失败:', error);
        res.status(500).json({ success: false, error: '创建旅行计划失败: ' + error.message });
    }
});

// 获取旅行进度（带自动推进功能）
router.get('/progress/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params;

        const pool = getPgPool();
        let diaryStatus = null;

        const progressResult = await pool.query(
            `SELECT user_id, plan_id, current_day, step_index, progress_status, location,
                    remaining_seconds, last_update, expected_complete_time
            FROM travel_progress
            WHERE user_id = $1
            LIMIT 1`,
            [userId]
        );

        let progressRow = progressResult.rows[0];
        if (!progressRow) {
            return res.json({ success: true, data: null });
        }

        const progress = {
            userId: progressRow.user_id,
            planId: progressRow.plan_id,
            currentDay: progressRow.current_day,
            stepIndex: progressRow.step_index,
            status: progressRow.progress_status,
            location: progressRow.location,
            remainingSeconds: progressRow.remaining_seconds,
            lastUpdate: progressRow.last_update,
            expectedCompleteTime: progressRow.expected_complete_time
        };

        let plan = null;
        let dailyPlans = [];

        if (progress.planId) {
            const planResult = await pool.query(
                `SELECT id, daily_plans, destination, estimated_days
                 FROM travel_plans
                 WHERE id = $1
                 LIMIT 1`,
                [progress.planId]
            );
            plan = planResult.rows[0] || null;
            const parsedDailyPlans = parseJsonValue(plan?.daily_plans, []);
            dailyPlans = sanitizeDailyPlans(parsedDailyPlans);
        }

        if (progress.expectedCompleteTime && progress.status === 'traveling' && plan && dailyPlans.length > 0) {
            const now = new Date();
            const expectedTime = new Date(progress.expectedCompleteTime);

            if (now >= expectedTime) {
                console.log(`⏰ 用户 ${userId} 的景点已完成，自动推进...`);
                const currentSpot = dailyPlans[progress.stepIndex];
                const nextIndex = progress.stepIndex + 1;

                if (nextIndex < dailyPlans.length) {
                    const nextSpot = dailyPlans[nextIndex];
                    if (!nextSpot || !nextSpot.location) {
                        console.warn(`⚠️ 用户 ${userId} 的下一站数据异常，跳过自动推进`);
                        return res.json({ success: true, data: progress });
                    }
                    const nextExpectedTime = new Date(now.getTime() + SPOT_STAY_SECONDS * 1000);

                    await pool.query(
                        `UPDATE travel_progress
                         SET current_day = $1, step_index = $2, location = $3,
                            remaining_seconds = $4, expected_complete_time = $5, last_update = NOW()
                         WHERE user_id = $6`,
                        [nextSpot.day, nextIndex, nextSpot.location, SPOT_STAY_SECONDS, nextExpectedTime.toISOString(), userId]
                    );

                    console.log(`✅ 已推进到: ${nextSpot.location} (第${nextSpot.day}天)`);

                    if (currentSpot && nextSpot.day > currentSpot.day) {
                        console.log(`📝 第${currentSpot.day}天已完成，已加入日记生成队列`);
                        const daySpots = dailyPlans.filter(s => s.day === currentSpot.day);

                        queueDiaryMailGeneration({
                            planId: plan.id,
                            userId,
                            destination: plan.destination,
                            day: currentSpot.day,
                            daySpots
                        });

                        diaryStatus = { queued: true, day: currentSpot.day, destination: plan.destination };
                    }

                    progress.currentDay = nextSpot.day;
                    progress.stepIndex = nextIndex;
                    progress.status = 'traveling';
                    progress.location = nextSpot.location;
                    progress.remainingSeconds = SPOT_STAY_SECONDS;
                    progress.expectedCompleteTime = nextExpectedTime.toISOString();
                } else {
                    await pool.query(
                        `UPDATE travel_plans
                         SET plan_status = 'completed', completed_at = NOW()
                         WHERE id = $1`,
                        [progress.planId]
                    );

                    await pool.query(
                        `UPDATE travel_progress
                         SET progress_status = 'completed', last_update = NOW()
                         WHERE user_id = $1`,
                        [userId]
                    );

                    console.log(`🎉 用户 ${userId} 的旅行已完成！`);

                    const lastDay = dailyPlans[dailyPlans.length - 1]?.day || plan.estimated_days;
                    const lastDaySpots = dailyPlans.filter(s => s.day === lastDay);
                    const allSpots = dailyPlans.map(s => s.location).join('、');

                    queueDiaryMailGeneration({
                        planId: plan.id,
                        userId,
                        destination: plan.destination,
                        day: lastDay,
                        daySpots: lastDaySpots,
                        sendSummary: true,
                        estimatedDays: plan.estimated_days,
                        allSpotsText: allSpots
                    });

                    diaryStatus = { queued: true, day: lastDay, destination: plan.destination, finalDay: true };
                    progress.status = 'completed';
                }
            }
        }

        if (plan) {
            progress.destination = plan.destination;
            progress.estimatedDays = plan.estimated_days;
            progress.dailyPlans = dailyPlans;
        }

        if (diaryStatus) {
            progress.diaryStatus = diaryStatus;
        }

        return res.json({ success: true, data: progress });

    } catch (error) {
        console.error('获取旅行进度失败:', error);
        res.status(500).json({ success: false, error: '获取旅行进度失败: ' + error.message });
    }
});

// 获取用户的旅行计划列表
router.get('/plans/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params;

        const pool = getPgPool();
        const result = await pool.query(
            `SELECT id, user_id, destination, departure, travel_mode, estimated_days, daily_plans,
                    plan_status, created_at, completed_at
             FROM travel_plans
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        return res.json({
            success: true,
            data: result.rows.map(plan => ({
                id: plan.id,
                userId: plan.user_id,
                destination: plan.destination,
                departure: plan.departure,
                travelMode: plan.travel_mode,
                estimatedDays: plan.estimated_days,
                dailyPlans: parseJsonValue(plan.daily_plans, []),
                status: plan.plan_status,
                createdAt: plan.created_at,
                completedAt: plan.completed_at
            }))
        });
    } catch (error) {
        console.error('获取旅行计划失败:', error);
        res.status(500).json({ success: false, error: '获取旅行计划失败' });
    }
});

// 获取旅行日记
router.get('/diaries/:planId', requireAuthenticatedUser, async (req, res) => {
    try {
        const { planId } = req.params;
        const userId = getAuthenticatedUserId(req);

        const pool = getPgPool();
        const ownershipResult = await pool.query(
            `SELECT id FROM travel_plans WHERE id = $1 AND user_id = $2 LIMIT 1`,
            [planId, userId]
        );

        if (ownershipResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: '旅行计划不存在或无权访问' });
        }

        const result = await pool.query(
            `SELECT id, plan_id, user_id, day, destination, content, visited_places, image_url, created_at
             FROM travel_diaries
             WHERE plan_id = $1 AND user_id = $2
             ORDER BY day ASC`,
            [planId, userId]
        );

        return res.json({
            success: true,
            data: result.rows.map(diary => ({
                id: diary.id,
                planId: diary.plan_id,
                userId: diary.user_id,
                day: diary.day,
                destination: diary.destination,
                content: diary.content,
                visitedPlaces: diary.visited_places || null,
                imageUrl: diary.image_url || null,
                images: diary.image_url ? [diary.image_url] : [],
                createdAt: diary.created_at
            }))
        });
    } catch (error) {
        console.error('获取旅行日记失败:', error);
        res.status(500).json({ success: false, error: '获取旅行日记失败' });
    }
});

export default router;
