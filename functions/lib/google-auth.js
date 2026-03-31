import { getCleanEnvValue } from "./env.js";

export async function getGoogleAccessToken(env) {
  const fallbackAccessToken = getCleanEnvValue(env.GOOGLE_ACCESS_TOKEN);
  const clientId = getCleanEnvValue(env.GOOGLE_CLIENT_ID);
  const clientSecret = getCleanEnvValue(env.GOOGLE_CLIENT_SECRET);
  const refreshToken =
    getCleanEnvValue(env.GOOGLE_OAUTH_REFRESH_TOKEN) ||
    getCleanEnvValue(env.GOOGLE_REFRESH_TOKEN);

  if (clientId && clientSecret && refreshToken) {
    try {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:
          "client_id=" + encodeURIComponent(clientId) +
          "&client_secret=" + encodeURIComponent(clientSecret) +
          "&refresh_token=" + encodeURIComponent(refreshToken) +
          "&grant_type=refresh_token",
      });

      const tokenData = await tokenResp.json().catch(() => ({}));
      if (tokenResp.ok && tokenData?.access_token) {
        return { accessToken: tokenData.access_token, source: "refresh_token" };
      }

      if (fallbackAccessToken) {
        console.warn("Google OAuth refresh falhou; usando GOOGLE_ACCESS_TOKEN como fallback.", tokenData);
        return {
          accessToken: fallbackAccessToken,
          source: "access_token_fallback",
          warning: tokenData.error_description || tokenData.error || `HTTP ${tokenResp.status}`,
        };
      }

      throw new Error(tokenData.error_description || tokenData.error || `HTTP ${tokenResp.status}`);
    } catch (error) {
      if (fallbackAccessToken) {
        console.warn("Google OAuth refresh lancou excecao; usando GOOGLE_ACCESS_TOKEN como fallback.", error.message);
        return {
          accessToken: fallbackAccessToken,
          source: "access_token_fallback",
          warning: error.message,
        };
      }

      throw error;
    }
  }

  if (fallbackAccessToken) {
    return { accessToken: fallbackAccessToken, source: "access_token_only" };
  }

  throw new Error("Credenciais do Google nao configuradas.");
}
