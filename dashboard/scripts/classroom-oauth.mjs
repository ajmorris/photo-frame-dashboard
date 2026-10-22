#!/usr/bin/env node
/**
 * One-time Google OAuth for a kid's Classroom account.
 * Prints a JSON blob to store as CLASSROOM_MAYA (or CLASSROOM_OTTO).
 *
 * Prerequisites:
 * 1. Google Cloud project with Classroom API enabled
 * 2. OAuth client type "Desktop app" (or "Installed")
 * 3. Set env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *
 * Usage (from dashboard/):
 *   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node scripts/classroom-oauth.mjs
 */
import http from 'node:http';
import { URL } from 'node:url';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 8765;
const REDIRECT = 'http://127.0.0.1:' + PORT + '/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const err = u.searchParams.get('error');
  if (err) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('OAuth error: ' + err + '\nSchool accounts often block unapproved apps.');
    server.close();
    process.exit(1);
  }
  const code = u.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('Missing code');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    });
    const body = await tokenRes.json();
    if (!tokenRes.ok || !body.refresh_token) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Token exchange failed:\n' + JSON.stringify(body, null, 2));
      server.close();
      process.exit(1);
    }
    const secret = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: body.refresh_token,
    };
    const json = JSON.stringify(secret);
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Success. Copy the JSON below into CLASSROOM_MAYA (wrangler secret / .dev.vars), then close this tab.\n\n' + json + '\n');
    console.log('\nCLASSROOM_MAYA secret (paste into wrangler secret put CLASSROOM_MAYA):\n');
    console.log(json);
    console.log('');
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
    server.close();
    process.exit(1);
  }
  server.close();
  process.exit(0);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Open this URL in a browser signed in as the student:\n');
  console.log(authUrl.toString());
  console.log('\nWaiting for redirect on ' + REDIRECT + ' …');
});
