/*
 * Web to APK Builder API
 * Convert website ke Android APK via rfweb2apk.rfdevv.com + proxy rotation
 * Source: api.ikyyxd.my.id
 */

const express = require('express');
const axios = require('axios');
const FormData = require('form-data');

const router = express.Router();

const PROXY_API_URL = 'https://api.ikyyxd.my.id/v2l/proxy-free/ikyy-xsample';
const BUILD_ENDPOINT = 'https://rfweb2apk.rfdevv.com/api/apk/build';
const BUILD_HOST = 'https://rfweb2apk.rfdevv.com';

let proxies = [];
let proxiesFetchedAt = 0;

const DEVICE_PROFILES = [
  { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36', chrome: '125' },
  { ua: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', chrome: '124' },
  { ua: 'Mozilla/5.0 (Linux; Android 12; Redmi Note 12 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36', chrome: '123' }
];

async function refreshProxies() {
  const now = Date.now();
  if (proxies.length && now - proxiesFetchedAt < 5 * 60 * 1000) return proxies;
  try {
    const res = await axios.get(PROXY_API_URL, { timeout: 10000 });
    proxies = (res.data || []).filter(p => typeof p === 'string' && p.trim().split(':').length === 4);
    proxiesFetchedAt = now;
    console.log(`[APK] ${proxies.length} proxies loaded`);
  } catch (err) {
    console.error('[APK] Proxy fetch failed:', err.message);
  }
  return proxies;
}

function getRandomHeaders() {
  const p = DEVICE_PROFILES[Math.floor(Math.random() * DEVICE_PROFILES.length)];
  return {
    'User-Agent': p.ua,
    'Sec-Ch-Ua': `"Chromium";v="${p.chrome}", "Google Chrome";v="${p.chrome}", "Not=A?Brand";v="24"`,
    'Sec-Ch-Ua-Mobile': '?1',
    'Sec-Ch-Ua-Platform': '"Android"',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
  };
}

function parseProxy(str) {
  const [host, port, username, password] = str.split(':');
  return { host, port: parseInt(port), auth: { username, password }, protocol: 'http' };
}

async function downloadIcon(url) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const ct = res.headers['content-type'] || 'image/png';
    const ext = ct.includes('jpeg') ? 'jpg' : 'png';
    return { buffer: Buffer.from(res.data), filename: `icon.${ext}`, contentType: ct };
  } catch {
    const dummy = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    return { buffer: dummy, filename: 'icon.png', contentType: 'image/png' };
  }
}

async function tryBuild(config) {
  await refreshProxies();
  if (!proxies.length) throw new Error('Tidak ada proxy tersedia');

  const iconData = await downloadIcon(config.icon || '');

  let lastErr = null;
  for (let i = 0; i < 5; i++) {
    const proxyStr = proxies[Math.floor(Math.random() * proxies.length)];
    try {
      const fd = new FormData();
      fd.append('appName', config.appName);
      fd.append('packageName', config.packageName);
      fd.append('versionName', config.versionName || '1.0');
      fd.append('versionCode', String(config.versionCode || '1'));
      fd.append('url', config.url);
      fd.append('splashType', config.splashType || 'image');
      fd.append('orientation', config.orientation || 'auto');
      fd.append('icon', iconData.buffer, {
        filename: iconData.filename,
        contentType: iconData.contentType
      });

      const headers = { ...fd.getHeaders(), ...getRandomHeaders() };
      const r = await axios.post(BUILD_ENDPOINT, fd, {
        headers,
        proxy: parseProxy(proxyStr),
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      if (r.data.success) {
        return {
          success: true,
          buildId: r.data.buildId,
          fileName: r.data.fileName,
          size: r.data.size,
          downloadUrl: `${BUILD_HOST}${r.data.downloadUrl}`,
          message: r.data.message || 'Build successful'
        };
      }
      lastErr = r.data.message || 'Build failed';
    } catch (e) {
      lastErr = e.response?.data?.message || e.message;
      console.warn(`[APK] Attempt ${i + 1}/5 failed:`, lastErr);
    }
  }
  throw new Error(lastErr || 'Semua attempt gagal');
}

router.post('/', async (req, res) => {
  try {
    const { url, appName, packageName, versionName, versionCode, icon, orientation, splashType } = req.body || {};

    if (!url || !appName || !packageName) {
      return res.status(400).json({
        success: false,
        message: 'url, appName, packageName wajib diisi'
      });
    }

    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ success: false, message: 'URL harus http:// atau https://' });
    }

    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(packageName)) {
      return res.status(400).json({ success: false, message: 'Package name tidak valid (format: com.example.app)' });
    }

    const result = await tryBuild({
      url: url.trim(),
      appName: appName.trim(),
      packageName: packageName.trim(),
      versionName: versionName || '1.0',
      versionCode: versionCode || '1',
      icon,
      orientation: orientation || 'auto',
      splashType: splashType || 'image'
    });

    return res.json(result);
  } catch (error) {
    console.error('[APK] Build error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Build gagal'
    });
  }
});

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Web to APK Builder API — use POST with build config',
    endpoints: {
      POST: 'Build APK',
      body: {
        url: 'string (required)',
        appName: 'string (required)',
        packageName: 'string (required)',
        versionName: 'string (optional, default 1.0)',
        versionCode: 'string (optional, default 1)',
        icon: 'string URL (optional)',
        orientation: 'auto | portrait | landscape',
        splashType: 'image | text'
      }
    }
  });
});

module.exports = router;
