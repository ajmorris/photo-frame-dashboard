import { bad, json } from './util.js';

const CACHE_TTL = 900; // 15 minutes — signed URLs expire
const CK_HOST = 'https://ckdatabasews.icloud.com';
const CK_CONTAINER = 'com.apple.photos.cloud';
const CK_BUILD = '2620BuildBeta48';
const CK_PARAMS = 'clientBuildNumber=' + CK_BUILD + '&clientMasteringNumber=' + CK_BUILD;
const CK_RECORD_TYPE = 'CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted';
const CK_PAGE_SIZE = 200;
const CK_MAX_PAGES = 10;
const TARGET_EDGE = 1600;

function tokenFrom(album) {
  if (!album) return null;
  const s = String(album).trim();
  let m = s.match(/icloud\.com\/(?:photos\/)?shared\/(?:album\/)?([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]);
  m = s.match(/sharedalbum\/?#([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]);
  if (/^[A-Za-z0-9._-]+$/.test(s)) return s;
  return null;
}

function partitionGuess(token) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const n = alphabet.indexOf(token[0] || '');
  const part = (n < 0 ? 1 : n + 1).toString().padStart(2, '0');
  return part;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      origin: 'https://www.icloud.com',
      'user-agent': 'home-dashboard/1.0',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const reason = data?.reason || data?.error || text.slice(0, 120);
    throw new Error('HTTP ' + res.status + ' from ' + new URL(url).host + ': ' + reason);
  }
  return data;
}

async function fetchLegacyAlbum(token) {
  let host = 'p' + partitionGuess(token) + '-sharedstreams.icloud.com';
  let url = 'https://' + host + '/' + token + '/sharedstreams/webstream';
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', accept: 'application/json', origin: 'https://www.icloud.com' },
    body: JSON.stringify({ streamCtag: null }),
  });
  if (res.status === 330) {
    const data = await res.json();
    host = data['X-Apple-MMe-Host'] || host;
    url = 'https://' + host + '/' + token + '/sharedstreams/webstream';
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', accept: 'application/json', origin: 'https://www.icloud.com' },
      body: JSON.stringify({ streamCtag: null }),
    });
  }
  if (!res.ok) throw new Error('webstream HTTP ' + res.status);
  const stream = await res.json();
  const photos = (stream.photos || []).filter((p) => p.mediaAssetType !== 'video');
  const guids = photos.map((p) => p.photoGuid).filter(Boolean);
  const assets = {};
  for (let i = 0; i < guids.length; i += 25) {
    const batch = guids.slice(i, i + 25);
    const aRes = await fetch('https://' + host + '/' + token + '/sharedstreams/webasseturls', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', accept: 'application/json', origin: 'https://www.icloud.com' },
      body: JSON.stringify({ photoGuids: batch }),
    });
    if (!aRes.ok) throw new Error('webasseturls HTTP ' + aRes.status);
    Object.assign(assets, (await aRes.json()).items || {});
  }

  return photos.map((p) => {
    let best = null, bestSize = -1;
    const ders = p.derivatives || {};
    for (const k of Object.keys(ders)) {
      const d = ders[k];
      const size = Number(d.fileSize || d.width || 0);
      if (size >= bestSize) { bestSize = size; best = d; }
    }
    const checksum = best && (best.checksum || best.fileChecksum);
    const item = checksum && assets[checksum];
    const src = item ? 'https://' + item.url_location + item.url_path : null;
    const w = Number(best?.width || p.width || 1600);
    const h = Number(best?.height || p.height || 1000);
    const date = (p.dateCreated || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    return {
      id: p.photoGuid,
      src,
      o: h > w ? 'p' : 'l',
      date,
      place: p.caption || stream.streamName || '',
      from: 'family',
      tag: 'album',
    };
  }).filter((p) => p.src);
}

function isCloudKitImage(fields) {
  const itemType = (fields.itemType?.value || '').toString().toLowerCase();
  if (!itemType) return true;
  return !itemType.includes('movie') && !itemType.includes('video');
}

function pickBestCloudKitAsset(fields) {
  let bestUrl = null, bestW = -1, fallbackUrl = null, fallbackW = -1;
  for (const k of Object.keys(fields)) {
    if (!k.startsWith('res') || !k.endsWith('Res') || k.includes('Vid')) continue;
    const value = fields[k]?.value;
    if (!value) continue;
    const dl = value.downloadURL || '';
    if (!dl || dl === 'null') continue;
    const widthKey = k.slice(0, -3) + 'Width'; // resJPEGFullRes -> resJPEGFullWidth
    const width = Number(fields[widthKey]?.value || 0);
    const height = Number(fields[k.slice(0, -3) + 'Height']?.value || 0);
    if (width >= TARGET_EDGE && (bestW < 0 || width < bestW)) {
      bestW = width;
      bestUrl = { src: dl, w: width, h: height || Math.round(width * 0.75) };
    }
    if (width > fallbackW) {
      fallbackW = width;
      fallbackUrl = { src: dl, w: width || 1600, h: height || 1000 };
    }
  }
  const picked = bestUrl || fallbackUrl;
  if (picked && picked.src.includes('${f}')) {
    // Browsers and CDNs are happier with a real filename than the ${f} placeholder.
    picked.src = picked.src.split('${f}').join('IMG.JPG');
  }
  return picked;
}

async function fetchCloudKitAlbum(token) {
  const resolveUrl = CK_HOST + '/database/1/' + CK_CONTAINER + '/production/public/records/resolve?' + CK_PARAMS;
  const resolved = await postJson(resolveUrl, { shortGUIDs: [{ value: token }] });
  const result = (resolved.results || [])[0];
  if (!result) throw new Error('cloudkit resolve empty');
  const zone = result.zoneID;
  if (!zone?.zoneName) throw new Error('cloudkit resolve missing zone');
  const access = result.anonymousPublicAccess;
  if (!access?.token) throw new Error('cloudkit resolve missing anonymous token');
  const partition = String(access.databasePartition || CK_HOST).replace(/:443$/, '');
  const title = result.share?.fields?.['cloudkit.title']?.value || '';
  const zoneID = {
    zoneName: zone.zoneName,
    ownerRecordName: zone.ownerRecordName || '',
    zoneType: zone.zoneType || 'REGULAR_CUSTOM_ZONE',
  };
  const queryUrl = partition + '/database/1/' + CK_CONTAINER + '/production/shared/records/query?'
    + CK_PARAMS + '&publicAccessAuthToken=' + encodeURIComponent(access.token);

  const out = [];
  let marker = null;
  let pages = 0;
  do {
    const body = {
      query: {
        recordType: CK_RECORD_TYPE,
        filterBy: [{
          fieldName: 'direction',
          comparator: 'EQUALS',
          fieldValue: { value: 'DESCENDING', type: 'STRING' },
        }],
      },
      zoneID,
      resultsLimit: CK_PAGE_SIZE,
    };
    if (marker) body.continuationMarker = marker;
    const resp = await postJson(queryUrl, body);
    const records = resp.records || [];
    for (const rec of records) {
      if (rec.recordType !== 'CPLMaster') continue;
      const fields = rec.fields || {};
      if (!isCloudKitImage(fields)) continue;
      const asset = pickBestCloudKitAsset(fields);
      if (!asset) continue;
      const ms = Number(fields.assetDate?.value || fields.addedDate?.value || Date.now());
      const d = new Date(ms);
      const date = d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
      out.push({
        id: rec.recordName,
        src: asset.src,
        o: asset.h > asset.w ? 'p' : 'l',
        date,
        place: title || '',
        from: 'family',
        tag: 'album',
      });
    }
    marker = resp.continuationMarker || null;
    pages++;
  } while (marker && pages < CK_MAX_PAGES);

  return out;
}

export async function handlePhotos(request, env, ctx) {
  if (request.method !== 'GET') return bad('GET only', 405);
  if (!env.PHOTO_ALBUM) return json({ photos: [], configured: false });

  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + '/api/photos?v=3');
  const hit = await cache.match(key);
  if (hit) return hit;

  const token = tokenFrom(env.PHOTO_ALBUM);
  if (!token) return bad('PHOTO_ALBUM is not a recognized shared-album link', 500);

  let photos;
  try {
    // Modern Shared Album links (photos.icloud.com/shared/album/…) use CloudKit.
    // Fall back to the legacy sharedstreams API for older tokens.
    try {
      photos = await fetchCloudKitAlbum(token);
    } catch (ckErr) {
      try {
        photos = await fetchLegacyAlbum(token);
      } catch {
        throw ckErr;
      }
    }
  } catch (err) {
    return bad('photos fetch failed: ' + (err.message || err), 502);
  }

  const out = json(
    { photos, configured: true, count: photos.length },
    200,
    { 'cache-control': 'public, max-age=' + CACHE_TTL }
  );
  if (photos.length) ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}
