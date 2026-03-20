import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const DEFAULT_BASE_URL = 'https://api.stepfun.com/v1';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

function ensureStepfunApiKey() {
    if (!process.env.STEPFUN_API_KEY) {
        throw new Error('未配置 STEPFUN_API_KEY');
    }
}

function getStepfunApiKey() {
    ensureStepfunApiKey();
    return process.env.STEPFUN_API_KEY;
}

function getStepfunBaseUrl() {
    return process.env.STEPFUN_BASE_URL || DEFAULT_BASE_URL;
}

function stripJsonFence(value = '') {
    const text = String(value || '').trim();
    if (text.startsWith('```json')) {
        return text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    }
    if (text.startsWith('```')) {
        return text.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    }
    return text;
}

function inferMimeType(fileName = '') {
    const ext = path.extname(String(fileName || '')).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return 'image/jpeg';
}

function inferExtension(contentType = '', fallbackUrl = '') {
    const normalized = String(contentType || '').toLowerCase();
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    const urlExt = path.extname(String(fallbackUrl || '').split('?')[0]).replace('.', '').toLowerCase();
    return urlExt || 'jpg';
}

function toDataUri(buffer, mimeType = 'image/jpeg') {
    return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

function buildPromptFromSavedRecord(record = {}) {
    const title = String(record.title || '').trim();
    const content = String(record.content || '').trim();
    const locationName = String(record.locationName || record.location_name || '').trim();
    const city = String(record.city || '').trim();
    const mood = String(record.mood || '').trim();
    const sourceMode = String(record.sourceMode || record.source_mode || 'text').trim();
    const promptParts = [
        '旅行电影感插画，适合移动端社区封面，构图完整，主体清晰，环境细节丰富。',
        title ? `标题：${title}` : '',
        content ? `内容：${content}` : '',
        locationName || city ? `地点：${locationName || city}` : '',
        mood ? `情绪：${mood}` : '',
        sourceMode === 'image' ? '保留原始旅行照片中的主体和场景关系，强化电影感、光影和叙事氛围。' : '根据文字记录生成具有电影叙事感的旅行画面。',
        '不要文字水印，不要海报排版字块，不要多余边框。'
    ].filter(Boolean);

    return promptParts.join(' ');
}

function buildMovieAnalysisInstruction(record = {}, movieName = '') {
    const locationName = String(record.locationName || record.location_name || '').trim();
    const city = String(record.city || '').trim();
    const content = String(record.content || '').trim();
    const title = String(record.title || '').trim();
    const mood = String(record.mood || '').trim();

    return `请结合这条旅行记录，分析影视作品《${movieName}》的经典视觉语言、色调和情绪，并给出适合用于改写这条记录图片的电影风格提示词。

记录信息：
- 标题：${title || '无'}
- 正文：${content || '无'}
- 地点：${locationName || city || '未知'}
- 心情：${mood || '未知'}

要求：
1. 如果对《${movieName}》的风格不了解，请使用 web_search 查找该作品的视觉关键词、经典氛围、代表性色彩与镜头感。
2. 输出内容要同时结合电影风格与当前旅行记录，不要只泛泛描述电影。
3. 如果提供了原图，请优先做图生图改写，保留主体与地点氛围。
4. 返回 JSON，不要 markdown，不要代码块。

JSON 格式：
{
  "movie_style": "一句话概括电影风格",
  "movie_emotion": "电影情绪基调",
  "color_tone": "推荐主色调",
  "filter_effect": "滤镜与光影建议",
  "scene_prompt": "给图像模型的中文改图提示词，强调构图、色调、主体、环境、镜头语言",
  "subtitles": ["一句短字幕", "一句短字幕", "一句短字幕"]
}`;
}

function sanitizePromptText(text = '') {
    // 移除可能触发审查的敏感词汇和特殊字符
    return String(text || '')
        .replace(/[【】\[\]《》<>""'']/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 800); // 限制长度
}

function buildMovieEditPrompt(record = {}, movieName = '', styleAnalysis = {}) {
    const locationName = sanitizePromptText(record.locationName || record.location_name || record.city || '');
    const mood = sanitizePromptText(record.mood || '');
    const title = sanitizePromptText(record.title || '');
    
    // 简化提示词，避免过于复杂的描述触发审查
    const parts = [
        `电影风格旅行照片`,
        styleAnalysis.color_tone ? `色调${styleAnalysis.color_tone}` : '',
        styleAnalysis.filter_effect ? `${styleAnalysis.filter_effect}` : '',
        locationName ? `地点${locationName}` : '',
        mood ? `氛围${mood}` : '',
        '电影感光影，高质量摄影'
    ].filter(Boolean);

    return sanitizePromptText(parts.join('，'));
}

async function resolveSourceImageDataUri(sourceUrl) {
    const source = String(sourceUrl || '').trim();
    if (!source) return '';

    if (source.startsWith('data:image/')) {
        return source;
    }

    if (/^https?:\/\//i.test(source)) {
        const response = await axios.get(source, {
            responseType: 'arraybuffer',
            timeout: 120000
        });
        const buffer = Buffer.from(response.data);
        const mimeType = response.headers['content-type'] || inferMimeType(source);
        
        // 压缩图片到2048x2048以内
        const compressed = await compressImageBuffer(buffer, mimeType);
        return toDataUri(compressed, mimeType);
    }

    if (source.startsWith('/uploads/')) {
        const fileName = path.basename(source);
        const buffer = await fs.readFile(path.join(UPLOADS_DIR, fileName));
        const mimeType = inferMimeType(fileName);
        
        // 压缩图片到2048x2048以内
        const compressed = await compressImageBuffer(buffer, mimeType);
        return toDataUri(compressed, mimeType);
    }

    return '';
}

async function compressImageBuffer(buffer, mimeType) {
    try {
        const image = sharp(buffer);
        const metadata = await image.metadata();
        
        // 如果图片尺寸超过2048，进行压缩
        if (metadata.width > 2048 || metadata.height > 2048) {
            console.log(`🔧 压缩图片: ${metadata.width}x${metadata.height} -> 2048x2048以内`);
            return await image
                .resize(2048, 2048, {
                    fit: 'inside', // 保持宽高比，不裁切
                    withoutEnlargement: true
                })
                .jpeg({ quality: 85 })
                .toBuffer();
        }
        
        return buffer;
    } catch (error) {
        console.warn('⚠️ 图片压缩失败，使用原图:', error.message);
        return buffer;
    }
}

async function requestMovieStyleAnalysis(record, movieName, sourceDataUri = '') {
    ensureStepfunApiKey();
    const userContent = [
        {
            type: 'text',
            text: buildMovieAnalysisInstruction(record, movieName)
        }
    ];

    if (sourceDataUri) {
        userContent.unshift({
            type: 'image_url',
            image_url: {
                url: sourceDataUri,
                detail: 'high'
            }
        });
    }

    const response = await axios.post(
        `${getStepfunBaseUrl()}/chat/completions`,
        {
            model: 'step-3',
            messages: [
                {
                    role: 'user',
                    content: userContent
                }
            ],
            tools: [
                {
                    type: 'web_search',
                    function: {
                        description: `搜索影视作品《${movieName}》的视觉风格、经典镜头、色彩和语言风格信息`
                    }
                }
            ],
            tool_choice: 'auto',
            temperature: 0.7
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getStepfunApiKey()}`
            },
            timeout: 120000
        }
    );

    const content = stripJsonFence(response.data?.choices?.[0]?.message?.content || '');

    try {
        return JSON.parse(content);
    } catch {
        return {
            movie_style: movieName,
            movie_emotion: record.mood || '平静',
            color_tone: '电影感色调',
            filter_effect: '强化光影层次和故事感',
            scene_prompt: content || `将图片改写为《${movieName}》风格的电影剧照`,
            subtitles: []
        };
    }
}

async function requestStepImageGeneration(prompt) {
    ensureStepfunApiKey();
    const response = await axios.post(
        `${getStepfunBaseUrl()}/images/generations`,
        {
            model: 'step-1x-medium',
            prompt: String(prompt || '').slice(0, 1024),
            size: '1024x1024',
            n: 1,
            response_format: 'url',
            steps: 50,
            cfg_scale: 7.5
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getStepfunApiKey()}`
            },
            timeout: 120000
        }
    );

    return response.data.data?.[0]?.url || null;
}

async function requestStepImageEdit(prompt, sourceDataUri) {
    ensureStepfunApiKey();
    
    // 简化提示词，避免触发审查
    const sanitizedPrompt = sanitizePromptText(prompt);
    
    const response = await axios.post(
        `${getStepfunBaseUrl()}/images/image2image`,
        {
            model: 'step-1x-medium',
            prompt: sanitizedPrompt.slice(0, 512), // 缩短提示词长度
            source_url: sourceDataUri,
            source_weight: 0.65, // 提高原图权重，减少AI改动
            size: '1024x1024',
            n: 1,
            response_format: 'url',
            steps: 40, // 减少步数，降低过度生成
            cfg_scale: 6.5 // 降低引导强度
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getStepfunApiKey()}`
            },
            timeout: 120000
        }
    );

    return response.data.data?.[0]?.url || null;
}

async function saveRemoteImageToUploads(imageUrl, prefix = 'stepfun') {
    const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 120000
    });

    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const extension = inferExtension(response.headers['content-type'], imageUrl);
    const fileName = `${prefix}_${randomUUID()}.${extension}`;
    await fs.writeFile(path.join(UPLOADS_DIR, fileName), Buffer.from(response.data));
    return `/uploads/${fileName}`;
}

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

        const imageUrl = await requestStepImageGeneration(prompt);
        
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

export async function generateSavedPostRecordImage(record) {
    try {
        const prompt = buildPromptFromSavedRecord(record);
        console.log('🎨 生成保存记录图片，提示词:', prompt.substring(0, 120) + '...');

        const imageUrl = await requestStepImageGeneration(prompt);

        if (!imageUrl) {
            throw new Error('未返回图片 URL');
        }

        return await saveRemoteImageToUploads(imageUrl, 'saved_record');
    } catch (error) {
        console.error('❌ 生成保存记录图片失败:', error.response?.data || error.message);

        if (error.response?.status === 451) {
            throw new Error('图片生成失败：内容审查触发');
        }

        throw new Error('保存记录图片生成失败: ' + (error.response?.data?.error?.message || error.message));
    }
}

export async function generateSavedPostRecordMovieImage(record, movieName) {
    try {
        const normalizedMovieName = String(movieName || '').trim();
        if (!normalizedMovieName) {
            throw new Error('请输入影视作品名称');
        }

        const sourceDataUri = await resolveSourceImageDataUri(record.originalImageUrl || record.original_image_url || '');
        const styleAnalysis = await requestMovieStyleAnalysis(record, normalizedMovieName, sourceDataUri);
        const prompt = buildMovieEditPrompt(record, normalizedMovieName, styleAnalysis);
        console.log('🎬 保存记录电影风格生成，影视作品:', normalizedMovieName);
        console.log('📝 改图提示词:', prompt.substring(0, 160) + '...');

        const remoteImageUrl = sourceDataUri
            ? await requestStepImageEdit(prompt, sourceDataUri)
            : await requestStepImageGeneration(prompt);

        if (!remoteImageUrl) {
            throw new Error('未返回图片 URL');
        }

        const imageUrl = await saveRemoteImageToUploads(remoteImageUrl, 'saved_record_movie');
        return {
            imageUrl,
            styleAnalysis,
            prompt
        };
    } catch (error) {
        console.error('❌ 电影风格图片生成失败:', error.response?.data || error.message);

        if (error.response?.status === 451 || error.response?.data?.error?.type === 'censorship_blocked') {
            throw new Error('内容审查触发，请尝试：1) 更换电影名称 2) 简化描述 3) 更换原图');
        }

        const errorMsg = error.response?.data?.error?.message || error.message;
        throw new Error('电影风格图片生成失败: ' + errorMsg);
    }
}

export default {
    generateTravelImage,
    generateSavedPostRecordImage,
    generateSavedPostRecordMovieImage
};
