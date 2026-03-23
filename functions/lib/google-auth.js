export async function getGoogleAccessToken(env) {
  const fallbackAccessToken = env.GOOGLE_ACCESS_TOKEN;

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    try {
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:
          'client_id=' + encodeURIComponent(env.GOOGLE_CLIENT_ID) +
          '&client_secret=' + encodeURIComponent(env.GOOGLE_CLIENT_SECRET) +
          '&refresh_token=' + encodeURIComponent(env.GOOGLE_OAUTH_REFRESH_TOKEN) +
          '&grant_type=refresh_token',
      });

      if (tokenResp.ok) {
        const tokenData = await tokenResp.json();
        if (tokenData?.access_token) {
          return { accessToken: tokenData.access_token, source: 'refresh_token' };
        }
      }

      const errBody = await tokenResp.json().catch(() => ({}));
      if (fallbackAccessToken) {
        console.warn('Google OAuth refresh falhou; usando GOOGLE_ACCESS_TOKEN como fallback.', errBody);
        return {
          accessToken: fallbackAccessToken,
          source: 'access_token_fallback',
          warning: errBody.error_description || errBody.error || `HTTP ${tokenResp.status}`,
        };
      }

      throw new Error(errBody.error_description || errBody.error || `HTTP ${tokenResp.status}`);
    } catch (error) {
      if (fallbackAccessToken) {
        console.warn('Google OAuth refresh lançou exceção; usando GOOGLE_ACCESS_TOKEN como fallback.', error.message);
        return {
          accessToken: fallbackAccessToken,
          source: 'access_token_fallback',
          warning: error.message,
        };
      }

      throw error;
    }
  }

  if (fallbackAccessToken) {
    return { accessToken: fallbackAccessToken, source: 'access_token_only' };
  }

  throw new Error('Credenciais do Google não configuradas.');
}
