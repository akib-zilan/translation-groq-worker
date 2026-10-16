/**
 * Translation tutor AI proxy: Cloudflare Worker -> Groq Chat Completions API.
 * Configure GROQ_API_KEY as a Worker secret; never paste it into index.html.
 */
const FIREBASE_PROJECT_ID = "translation-798e4";
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return json({ error: { message: "Method not allowed. Use POST." } }, 405, corsHeaders);
    }
    if (!env.GROQ_API_KEY) {
      return json({ error: { message: "Worker is missing its GROQ_API_KEY secret." } }, 500, corsHeaders);
    }

    try {
      const authHeader = request.headers.get("Authorization") || "";
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        return json({ error: { message: "Authentication required. Sign in and retry." } }, 401, corsHeaders);
      }

      const claims = await verifyFirebaseIdToken(match[1]);
      if (!claims) {
        return json({ error: { message: "Your sign-in token is invalid or expired. Sign out and sign in again." } }, 401, corsHeaders);
      }

      // Optional single-user lock. Set ALLOWED_UID in Worker variables for a private, personal app.
      if (env.ALLOWED_UID && claims.sub !== env.ALLOWED_UID.trim()) {
        return json({ error: { message: "This AI endpoint is not enabled for this account." } }, 403, corsHeaders);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: { message: "Request body must be valid JSON." } }, 400, corsHeaders);
      }
      if (typeof body.prompt !== "string" || !body.prompt.trim()) {
        return json({ error: { message: "Missing prompt." } }, 400, corsHeaders);
      }
      if (body.prompt.length > 12000) {
        return json({ error: { message: "Prompt is too long." } }, 413, corsHeaders);
      }

      const groqResponse = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: "You are a careful Bangla-to-English translation tutor. Follow the user's instructions exactly and return a single valid JSON object only. Do not use Markdown fences." },
            { role: "user", content: body.prompt }
          ],
          temperature: 0.2,
          max_completion_tokens: 900,
          response_format: { type: "json_object" }
        })
      });

      const groqData = await groqResponse.json().catch(() => ({}));
      if (!groqResponse.ok) {
        const upstreamMessage = groqData?.error?.message || `Groq returned HTTP ${groqResponse.status}.`;
        const status = [400, 401, 403, 404, 413, 429].includes(groqResponse.status) ? groqResponse.status : 502;
        return json({ error: { message: upstreamMessage } }, status, corsHeaders);
      }

      const text = groqData?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) {
        return json({ error: { message: "Groq returned an empty response. Please try again." } }, 502, corsHeaders);
      }
      return json({ text }, 200, corsHeaders);
    } catch (error) {
      console.error("Translation Worker error:", error);
      return json({ error: { message: "AI request failed. Check the Worker logs for details." } }, 500, corsHeaders);
    }
  }
};

async function verifyFirebaseIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== FIREBASE_PROJECT_ID ||
      claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
      typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128 ||
      typeof claims.exp !== "number" || claims.exp <= now ||
      typeof claims.iat !== "number" || claims.iat > now + 60) {
    return null;
  }

  const jwksResponse = await fetch(FIREBASE_JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!jwksResponse.ok) throw new Error("Unable to retrieve Firebase public signing keys.");
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) return null;

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = decodeBase64Url(parts[2]);
  const validSignature = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signedContent);
  return validSignature ? claims : null;
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function json(value, status, corsHeaders) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
