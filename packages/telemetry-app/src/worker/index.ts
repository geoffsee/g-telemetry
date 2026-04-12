import { Hono } from 'hono';
import { githubAuth } from '@hono/oauth-providers/github';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import { renderPage } from 'vike/server';

type Bindings = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  ALLOWED_GITHUB_USERNAMES: string; // Comma-separated list
  TELEMETRY_SINK_URL: string;
  TELEMETRY_SINK_AUTH: string; // user:password for Basic Auth
};

const app = new Hono<{ Bindings: Bindings }>();

// --- Session Helper ---
async function getSession(c: any) {
  const token = getCookie(c, 'telemetry_session');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(c.env.SESSION_SECRET));
    return payload;
  } catch {
    return null;
  }
}

// --- GitHub Auth Routes ---
app.use('/login/github', (c, next) => {
  return githubAuth({
    client_id: c.env.GITHUB_CLIENT_ID,
    client_secret: c.env.GITHUB_CLIENT_SECRET,
    scope: ['read:user'],
  })(c, next);
});

app.get('/login/github/callback', async (c) => {
  const user = c.get('user-github') as any;
  if (!user || !user.login) {
    return c.text('GitHub login failed', 401);
  }

  // Check if user is allowed (optional, but recommended)
  const allowedUsers = c.env.ALLOWED_GITHUB_USERNAMES?.split(',').filter(Boolean).map((u: string) => u.trim()) || [];
  if (allowedUsers.length > 0 && !allowedUsers.includes(user.login)) {
    return c.text('User not authorized', 403);
  }

  // Create session
  const token = await new SignJWT({ login: user.login, avatar: user.avatar_url })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(new TextEncoder().encode(c.env.SESSION_SECRET));

  setCookie(c, 'telemetry_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return c.redirect('/');
});

app.get('/logout', (c) => {
  deleteCookie(c, 'telemetry_session');
  return c.redirect('/');
});

// --- API Proxy ---
app.all('/api/telemetry/*', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const urlObj = new URL(c.req.url);
  const fullPath = urlObj.pathname.replace('/api/telemetry', '');
  const search = urlObj.search;
  const url = `${c.env.TELEMETRY_SINK_URL}${fullPath}${search}`;

  const headers = new Headers();
  headers.set('Authorization', `Basic ${btoa(c.env.TELEMETRY_SINK_AUTH)}`);

  const response = await fetch(url, {
    method: c.req.method,
    headers,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? await c.req.raw.blob() : undefined,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
  });
});

// --- Vike SSR ---
app.all('*', async (c) => {
  const session = await getSession(c);
  
  if (!session && !c.req.path.startsWith('/login')) {
      return c.html(`<h1>Telemetry Dashboard</h1><p><a href="/login/github">Login with GitHub</a></p>`);
  }

  const pageContextInit = {
    urlOriginal: c.req.url,
    user: session,
    env: c.env,
  };
  const pageContext = await renderPage(pageContextInit);
  const { httpResponse } = pageContext;
  if (!httpResponse) return c.notFound();

  return new Response(httpResponse.body, {
    status: httpResponse.statusCode,
    headers: { 'Content-Type': httpResponse.contentType },
  });
});

export default app;
