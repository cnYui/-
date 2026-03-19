import axios from 'axios';

const STEPFUN_API_KEY = process.env.STEPFUN_API_KEY;
const BASE_URL = 'https://api.stepfun.com/v1';

/**
 * 生成旅行图片
 * @param {string} diaryContent - 日记内容
 * @param {string} destination - 目的地
 * @param {Array} visitedPlaces - 游览的景点列表
 * @returns {Promise<string>} - 图片 URL
 */
export async function generateTravelImage(diaryContent, destination, visitedPlaces) {
    try {
        const placesText = visitedPlaces && visitedPlaces.length > 0 
            ? visitedPlaces.join('、') 
            : destination;
        
        const prompt = `漫画风格，旅行者在${destination}游览${placesText}，多格漫画形式，每格展示一个景点场景，彩色漫画，夸张表情，充满活力，旅行冒险氛围，高质量插画`;

        console.log('🎨 生成旅行图片，提示词:', prompt.substring(0, 100) + '...');

        const response = await axios.post(
            `${BASE_URL}/images/generations`,
            {
                model: 'step-1x-medium',
                prompt: prompt.slice(0, 1024),
                size: '1024x1024',
                n: 1,
                response_format: 'url',
                steps: 50,
                cfg_scale: 7.5,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${STEPFUN_API_KEY}`,
                },
                timeout: 120000 // 2分钟超时
            }
        );

        const imageUrl = response.data.data?.[0]?.url || null;
        
        if (imageUrl) {
            console.log('✅ 旅行图片生成成功');
        } else {
            console.log('⚠️ 旅行图片生成失败：未返回 URL');
        }
        
        return imageUrl;
    } catch (error) {
        console.error('❌ 生成旅行图片失败:', error.response?.data || error.message);
        
        if (error.response?.status === 451) {
            throw new Error('图片生成失败：内容审查触发');
        }
        
        throw new Error('图片生成失败: ' + (error.response?.data?.error?.message || error.message));
    }
}

export default {
    generateTravelImage
};
