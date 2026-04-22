const IS_PROD = process.env.NODE_ENV === 'production';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function baseOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
  };
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken) {
    res.cookie('accessToken', accessToken, { ...baseOptions(), maxAge: ACCESS_MAX_AGE_MS });
  }
  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, { ...baseOptions(), maxAge: REFRESH_MAX_AGE_MS });
  }
}

export function clearAuthCookies(res) {
  res.clearCookie('accessToken', baseOptions());
  res.clearCookie('refreshToken', baseOptions());
}
