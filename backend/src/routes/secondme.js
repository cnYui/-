import { Router } from 'express';
import axios from 'axios';

const router = Router();

const SECONDME_API_BASE = process.env.SECONDME_API_BASE || 'https://api.mindverse.com/gate/lab';
const SECONDME_CLIENT_ID = process.env.SECONDME_CLIENT_ID || '1fd10355-ad04-43b1-a479-5a868b505130';
const SECONDME_CLIENT_SECRET = process.env.SECONDME_CLIENT_SECRET || '4144a38a22f1b03390973b337797fe673e0957d7726b7ccef9f7321fe72c92a4';

// Exchange authorization code for access token
router.post('/oauth/token', async (req, res) => {
    try {
        const { code, redirect_uri } = req.body;

        if (!code) {
            return res.status(400).json({
                code: -1,
                message: 'Authorization code is required'
            });
        }

        console.log('🔐 Exchanging SecondMe OAuth code for token...');
        console.log('  Code:', code.substring(0, 20) + '...');
        console.log('  Redirect URI:', redirect_uri);

        // Build URL-encoded request body
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirect_uri);
        params.append('client_id', SECONDME_CLIENT_ID);
        params.append('client_secret', SECONDME_CLIENT_SECRET);

        // Call SecondMe API to exchange code for token
        const response = await axios.post(`${SECONDME_API_BASE}/api/oauth/token/code`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('✅ SecondMe token exchange successful');

        // Return token data in the format expected by frontend
        res.json({
            code: 0,
            message: 'success',
            data: {
                accessToken: response.data.data.accessToken,
                refreshToken: response.data.data.refreshToken,
                expiresIn: response.data.data.expiresIn || 7200,
                tokenType: response.data.data.tokenType || 'Bearer'
            }
        });

    } catch (error) {
        console.error('❌ SecondMe token exchange failed:', error.response?.data || error.message);
        res.status(500).json({
            code: -1,
            message: error.response?.data?.message || error.message || 'Token exchange failed'
        });
    }
});

// Refresh access token
router.post('/oauth/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({
                code: -1,
                message: 'Refresh token is required'
            });
        }

        console.log('🔄 Refreshing SecondMe access token...');

        // Build URL-encoded request body
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refresh_token);
        params.append('client_id', SECONDME_CLIENT_ID);
        params.append('client_secret', SECONDME_CLIENT_SECRET);

        const response = await axios.post(`${SECONDME_API_BASE}/api/oauth/token/refresh`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('✅ SecondMe token refresh successful');

        res.json({
            code: 0,
            message: 'success',
            data: {
                accessToken: response.data.data.accessToken,
                refreshToken: response.data.data.refreshToken,
                expiresIn: response.data.data.expiresIn || 7200,
                tokenType: response.data.data.tokenType || 'Bearer'
            }
        });

    } catch (error) {
        console.error('❌ SecondMe token refresh failed:', error.response?.data || error.message);
        res.status(500).json({
            code: -1,
            message: error.response?.data?.message || error.message || 'Token refresh failed'
        });
    }
});

// Get user info
router.get('/user/info', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                code: -1,
                message: 'Authorization header is required'
            });
        }

        console.log('👤 Getting SecondMe user info...');

        const response = await axios.get(`${SECONDME_API_BASE}/api/secondme/user/info`, {
            headers: {
                'Authorization': authHeader
            }
        });

        console.log('✅ SecondMe user info retrieved');
        res.json(response.data);

    } catch (error) {
        console.error('❌ Failed to get user info:', error.response?.data || error.message);
        res.status(500).json({
            code: -1,
            message: error.response?.data?.message || error.message || 'Failed to get user info'
        });
    }
});

// Get user soft memory
router.get('/softmemory', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                code: -1,
                message: 'Authorization header is required'
            });
        }

        const { keyword, pageNo = 1, pageSize = 20 } = req.query;
        
        console.log('📚 Getting SecondMe soft memory...');
        console.log('  Page:', pageNo, 'Size:', pageSize);
        if (keyword) console.log('  Keyword:', keyword);

        // Build query params
        const params = new URLSearchParams();
        if (keyword) params.append('keyword', keyword);
        params.append('pageNo', String(pageNo));
        params.append('pageSize', String(pageSize));

        const response = await axios.get(`${SECONDME_API_BASE}/api/secondme/user/softmemory?${params.toString()}`, {
            headers: {
                'Authorization': authHeader
            }
        });

        console.log('✅ SecondMe soft memory retrieved, total:', response.data.data?.total || 0);
        res.json(response.data);

    } catch (error) {
        console.error('❌ Failed to get soft memory:', error.response?.data || error.message);
        res.status(500).json({
            code: -1,
            message: error.response?.data?.message || error.message || 'Failed to get soft memory'
        });
    }
});

export default router;
