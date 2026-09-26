'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const { analyze, MODES } = require('./analyze');
const { SAMPLES } = require('./samples');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/modes', (_req, res) => {
  res.json({
    modes: Object.values(MODES).map((m) => ({ key: m.key, label: m.label, dropFrame: m.dropFrame, fps: m.fps })),
  });
});

app.get('/api/sample/:mode', (req, res) => {
  const csv = SAMPLES[req.params.mode];
  if (!csv) return res.status(404).json({ error: '未知模式' });
  res.json({ csv });
});

app.post('/api/analyze', (req, res) => {
  const { csv, mode } = req.body || {};
  if (!MODES[mode]) {
    return res.status(400).json({ error: 'mode 必须为 25 或 2997df' });
  }
  if (typeof csv !== 'string') {
    return res.status(400).json({ error: 'csv 必须为字符串' });
  }
  try {
    res.json(analyze({ csv, mode }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 生产环境托管 React 构建产物
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`[edl-checker] 服务已启动: http://${HOST}:${PORT}`);
});
