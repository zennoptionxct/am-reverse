/*
 * CapCut Template Search API
 * Search template video/image dari CapCut via proxy rotation
 * Source: api.ikyyxd.my.id
 */

const express = require('express');
const axios = require('axios');

const router = express.Router();

const PROXY_API = 'https://api.ikyyxd.my.id/v2l/proxy-free/ikyy-xsample';
const BASE_URL = 'https://www.capcut.com';
const API_ENDPOINT = '/kep/api/getSimilarTemplates';

let proxies = [];
let proxiesFetchedAt = 0;

async function fetchProxies() {
  const now = Date.now();
  if (proxies.length && now - proxiesFetchedAt < 5 * 60 * 1000) return proxies;
  try {
    const res = await axios.get(PROXY_API, { timeout: 10000 });
    if (!Array.isArray(res.data)) throw new Error('Invalid proxy format');
    proxies = res.data.filter(p => typeof p === 'string' && p.trim().split(':').length === 4);
    proxiesFetchedAt = now;
    console.log(`[CapCut] ${proxies.length} proxies loaded`);
  } catch (err) {
    console.error('[CapCut] Proxy fetch failed:', err.message);
  }
  return proxies;
}

function getRandomProxyConfig() {
  const p = proxies[Math.floor(Math.random() * proxies.length)];
  const [host, port, user, pass] = p.trim().split(':');
  return {
    host,
    port: parseInt(port),
    auth: { username: user, password: pass },
    protocol: 'http'
  };
}

async function searchTemplates({ keyword, size = 10, language = 'en', regionCode = 'US', tabs = ['video'] }) {
  const proxyConfig = getRandomProxyConfig();

  const client = axios.create({
    baseURL: BASE_URL,
    proxy: proxyConfig,
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
      'Accept': '*/*',
      'Content-Type': 'application/json',
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/template`,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    }
  });

  const payload = { keyword, tabs, language, regionCode, size };

  const res = await client.post(API_ENDPOINT, payload);

  if (res.data.status !== 1000 || !res.data.data?.videoTemplateList) {
    throw new Error(`API Error: ${JSON.stringify(res.data).slice(0, 200)}`);
  }

  return res.data.data.videoTemplateList.videoTemplates || [];
}

router.post('/', async (req, res) => {
  try {
    const { keyword, size = 20, language = 'en', regionCode = 'US', tabs = ['video'] } = req.body || {};

    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ success: false, message: 'Keyword wajib diisi' });
    }

    await fetchProxies();
    if (!proxies.length) {
      return res.status(503).json({ success: false, message: 'Tidak ada proxy tersedia' });
    }

    let lastError = '';
    let results = [];
    let usedProxyIp = '';

    for (let i = 0; i < 5; i++) {
      try {
        const proxyConfig = getRandomProxyConfig();
        usedProxyIp = proxyConfig.host;

        const templates = await searchTemplates({
          keyword: keyword.trim(),
          size: Math.min(Math.max(parseInt(size) || 20, 1), 30),
          language,
          regionCode,
          tabs: Array.isArray(tabs) ? tabs : [tabs]
        });

        results = templates.map(t => ({
          templateId: t.templateId,
          title: t.title,
          titleDesc: t.titleDesc,
          useCount: t.useCount,
          likeCount: t.likeCount,
          commentCount: t.commentCount,
          templateDuration: t.templateDuration,
          coverUrl: t.coverUrl,
          videoUrl: t.videoUrl,
          fragmentId: t.fragmentId || t.templateId,
          structuredData: t.structuredData || null
        }));

        return res.json({
          success: true,
          message: `Found ${results.length} templates for "${keyword}"`,
          data: {
            keyword,
            total_results: results.length,
            templates: results,
            proxy_ip: usedProxyIp,
            timestamp: new Date().toISOString()
          }
        });
      } catch (err) {
        lastError = err.message;
        console.warn(`[CapCut] Attempt ${i + 1}/5 failed: ${lastError}`);
      }
    }

    return res.status(502).json({
      success: false,
      message: 'Semua attempt gagal',
      error: lastError
    });

  } catch (error) {
    console.error('[CapCut] Fatal:', error);
    return res.status(500).json({
      success: false,
      message: 'Fatal error: ' + error.message
    });
  }
});

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'CapCut Search API — use POST with { keyword, tabs, size }',
    endpoints: {
      POST: 'Search templates',
      body: { keyword: 'string', tabs: ['video' | 'image'], size: 'number', language: 'string', regionCode: 'string' }
    }
  });
});

module.exports = router;
