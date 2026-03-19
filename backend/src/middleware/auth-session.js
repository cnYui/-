function parseCookieHeader(header = '') {
  const cookies = {};
  String(header)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const separatorIndex = item.indexOf('=');
      if (separatorIndex <= 0) return;
      const key = item.slice(0, separatorIndex).trim();
      const value = item.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
    });
  return cookies;
}

export function attachAuthSession(req, _res, next) {
  const cookies = parseCookieHeader(req.headers.cookie || '');
  const cookieUserId = String(cookies.current_user_id || '').trim();
  req.authUserId = cookieUserId;
  req.authCookies = cookies;
  next();
}

export function requireAuthenticatedUser(req, res, next) {
  if (!req.authUserId) {
    return res.status(401).json({ success: false, error: '未登录或登录已失效' });
  }
  next();
}

export function ensureSameUserParam(paramName = 'userId') {
  return (req, res, next) => {
    const targetUserId = String(req.params?.[paramName] || '').trim();
    if (!req.authUserId) {
      return res.status(401).json({ success: false, error: '未登录或登录已失效' });
    }
    if (!targetUserId) {
      return res.status(400).json({ success: false, error: '缺少用户标识' });
    }
    if (req.authUserId !== targetUserId) {
      return res.status(403).json({ success: false, error: '无权访问其他用户数据' });
    }
    next();
  };
}

export function ensureSameUserBody(fieldName = 'userId') {
  return (req, res, next) => {
    if (!req.authUserId) {
      return res.status(401).json({ success: false, error: '未登录或登录已失效' });
    }
    const bodyUserId = req.body?.[fieldName];
    if (bodyUserId !== undefined && String(bodyUserId).trim() !== req.authUserId) {
      return res.status(403).json({ success: false, error: '请求用户与当前登录用户不一致' });
    }
    next();
  };
}

export function getAuthenticatedUserId(req) {
  return String(req.authUserId || '').trim();
}
