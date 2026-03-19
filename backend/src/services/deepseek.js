import axios from 'axios';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_ENDPOINT = process.env.DEEPSEEK_API_ENDPOINT || 'https://api.deepseek.com/v1';

/**
 * 调用 DeepSeek API
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userPrompt - 用户提示词
 * @param {object} options - 额外配置
 * @returns {Promise<string>} - AI 返回的内容
 */
async function callDeepSeek(systemPrompt, userPrompt, options = {}) {
    try {
        if (!DEEPSEEK_API_KEY) {
            throw new Error('缺少 DEEPSEEK_API_KEY 环境变量');
        }

        const response = await axios.post(
            `${DEEPSEEK_API_ENDPOINT}/chat/completions`,
            {
                model: options.model || 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: options.max_tokens || 4000,
                temperature: options.temperature || 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('DeepSeek API 调用失败:', error.response?.data || error.message);
        throw new Error('AI 服务调用失败');
    }
}

/**
 * 生成旅行日记
 * @param {string} destination - 目的地
 * @param {number} day - 第几天
 * @param {array} spots - 当天访问的景点
 * @returns {Promise<{title: string, content: string, senderName: string}>} - 邮件格式日记
 */
async function generateTravelDiary(destination, day, spots) {
    const spotsText = spots.map(s => `- ${s.location}: ${s.description} (停留${s.duration}分钟)`).join('\n');

    const systemPrompt = '你是一个擅长写旅行邮件的助手。你必须只输出 JSON，不要输出其他解释文字。';
    const userPrompt = `请将以下旅行经历写成一封给用户的旅行邮件，语气温暖自然。

目的地：${destination}
日期：第${day}天
今日行程：
${spotsText}

邮件规则：
1. 开头使用礼貌的邮件问候语（例如“你好”、“您好”、“见字如晤”等），但不要固定死板模板
2. 内容采用第一人称（我）回顾当天经历
3. 重点写感受、细节、印象深刻的片段
4. 邮件结尾必须包含“我是xxx”用于署名
5. 正文控制在220~420字

请严格按以下 JSON 输出，不要加 markdown 代码块：
{
  "title": "字符串，邮件标题，建议包含目的地和第几天",
  "content": "字符串，完整邮件正文（含礼貌问候开头与署名结尾）",
  "senderName": "字符串，署名名称"
}`;

    const raw = await callDeepSeek(systemPrompt, userPrompt);
    let parsed = null;

    try {
        const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : null;
    } catch (error) {
        parsed = null;
    }

    const senderName = String(parsed?.senderName || '你的旅行分身').trim();
    const title = String(parsed?.title || `${destination} 第${day}天旅行来信`).trim();
    let content = String(parsed?.content || '').trim();

    if (!content) {
        content = `你好，\n今天是我在${destination}旅程的第${day}天，我按照计划走访了这些地点：\n${spots.map(s => s.location).join('、')}。\n一路上的风景和人情味让我很有收获，也让我更期待接下来的旅程。\n我是${senderName}`;
    }

    if (!/我是/.test(content)) {
        content = `${content}\n\n我是${senderName}`;
    }

    return {
        title,
        content,
        senderName
    };
}

/**
 * 生成每日漫游总结（结构化 JSON）
 * @param {string} destination
 * @param {number} day
 * @param {array} spots
 * @returns {Promise<{title:string, content:string, senderName:string, recommended:any[], notRecommended:any[], nextDaySuggestion:string}>}
 */
async function generateDailyRoamingSummary(destination, day, spots) {
    const spotLines = (spots || []).map((s) => {
        const name = s.location || s.location_name || '未知地点';
        const desc = s.description || s.content || '无描述';
        const category = s.category || '玩';
        return `- ${name}（${category}）：${desc}`;
    }).join('\n');

    const systemPrompt = '你是旅行推荐分析助手。你必须只输出 JSON，不输出代码块和解释。';
    const userPrompt = `请基于以下当日漫游记录，输出“每日总结邮件” JSON。

目的地：${destination}
第几天：${day}
当日景点：
${spotLines || '- 暂无'}

输出要求：
1. recommended 至少 1 项，元素包含 name/reason/score(0-100)
2. notRecommended 可为空，元素包含 name/reason/score(0-100)
3. nextDaySuggestion 为一句建议
4. content 是完整邮件正文，120~260字
5. senderName 为署名

严格输出 JSON：
{
  "title": "字符串",
  "content": "字符串",
  "senderName": "字符串",
  "recommended": [{"name":"字符串","reason":"字符串","score":85}],
  "notRecommended": [{"name":"字符串","reason":"字符串","score":40}],
  "nextDaySuggestion": "字符串"
}`;

    try {
        const raw = await callDeepSeek(systemPrompt, userPrompt, { temperature: 0.4, max_tokens: 2500 });
        const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        const parsed = match ? JSON.parse(match[0]) : null;

        const senderName = String(parsed?.senderName || '你的旅行分身').trim();
        const title = String(parsed?.title || `📮 ${destination} 第${day}天漫游总结`).trim();
        let content = String(parsed?.content || '').trim();
        const recommended = Array.isArray(parsed?.recommended) ? parsed.recommended : [];
        const notRecommended = Array.isArray(parsed?.notRecommended) ? parsed.notRecommended : [];
        const nextDaySuggestion = String(parsed?.nextDaySuggestion || '明天可优先选择人少且步行友好的路线').trim();

        if (!content) {
            const names = (spots || []).map((s) => s.location || s.location_name).filter(Boolean).join('、') || '本地特色地点';
            content = `你好，今天我在${destination}第${day}天体验了${names}。整体体验以轻松探索为主，推荐保留节奏感强、反馈稳定的点位。明天建议错峰出行，优先安排相邻区域连走，减少折返。\n\n我是${senderName}`;
        }

        if (!/我是/.test(content)) {
            content = `${content}\n\n我是${senderName}`;
        }

        return { title, content, senderName, recommended, notRecommended, nextDaySuggestion };
    } catch (error) {
        const senderName = '你的旅行分身';
        const names = (spots || []).map((s) => s.location || s.location_name).filter(Boolean);
        const recommended = names.slice(0, 2).map((name) => ({ name, reason: '动线顺畅、体验稳定', score: 82 }));
        const notRecommended = names.slice(2, 3).map((name) => ({ name, reason: '高峰期拥挤，建议错峰', score: 48 }));
        const nextDaySuggestion = '建议次日选择同片区路线，减少通勤并错峰出行';
        const content = `你好，今天在${destination}第${day}天的漫游已经完成。我已为你整理了推荐与避坑点，并建议明天继续按片区探索、避开高峰时段，这样体验会更稳定。\n\n我是${senderName}`;

        return {
            title: `📮 ${destination} 第${day}天漫游总结`,
            content,
            senderName,
            recommended,
            notRecommended,
            nextDaySuggestion
        };
    }
}

export {
    callDeepSeek,
    generateTravelDiary,
    generateDailyRoamingSummary
};
