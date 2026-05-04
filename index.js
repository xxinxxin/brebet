import express from 'express';
import { bratGenerator, bratVidGenerator, generateAnimatedBratVid } from './lib/brat.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const app = express();

const API_KEY = process.env.API_KEY;

function requireApiKey(req, res, next) {
  const provided = req.query.apikey;

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: API_KEY not set' });
  }

  if (!provided || provided !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing apikey' });
  }

  next();
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    endpoints: [
      '/api/brat?text=hello&apikey=',
      '/api/bratvid?text=hello&apikey='
    ]
  });
});

app.get('/api/brat', requireApiKey, async (req, res) => {
  try {
    const { text, highlight } = req.query;
    if (!text) return res.status(400).json({ error: 'text required' });

    let highlightWords = [];
    if (highlight) {
      try {
        highlightWords = JSON.parse(highlight);
      } catch {
        highlightWords = highlight.split(',').map(w => w.trim());
      }
    }

    const buffer = await bratGenerator(text, highlightWords);
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bratvid', requireApiKey, async (req, res) => {
  try {
    const { text, highlight } = req.query;
    if (!text) return res.status(400).json({ error: 'text required' });

    let highlightWords = [];
    if (highlight) {
      try {
        highlightWords = JSON.parse(highlight);
      } catch {
        highlightWords = highlight.split(',').map(w => w.trim());
      }
    }

    const tempDir = path.join('/tmp', `brat_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const frames = await bratVidGenerator(text, 512, 512, '#FFFFFF', '#000000', highlightWords);
    frames.forEach((frame, i) => {
      fs.writeFileSync(path.join(tempDir, `frame_${i + 1}.png`), frame);
    });

    const outputPath = path.join(tempDir, 'output.webp');
    await generateAnimatedBratVid(tempDir, outputPath);

    const buffer = fs.readFileSync(outputPath);
    res.setHeader('Content-Type', 'image/webp');
    res.send(buffer);

    setTimeout(() => {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }, 5000);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/thumb', requireApiKey, async (req, res) => {
   try {
    const { q, type } = req.query;

    const { imageId, imgurl } = await getRandomImage(q, type);

const imgResponse = await fetch(imgurl, {
    headers: {
      'User-Agent': 'My Bot app - xunn li9186',
    },
    signal: AbortSignal.timeout(4000)
  });


  const arrayBuffer = await imgResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
    const thumbnail = await cropHorizontalSmart(buffer);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename=${imageId}.png;`);
    res.setHeader('X-Image-ID', imageId);

    res.status(200).send(thumbnail);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Terjadi kesalahan saat memproses gambar'
    });
  }
});


if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Local: http://localhost:${PORT}`);
  });
}

// EXPORT untuk Vercel
export default app;


const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'My Bot app - xunn li9186',
    },
    signal: AbortSignal.timeout(4000)
  });

  return response.json();
};

const getRandomImage = async (q, type) => {
  const queries = [
    "Genshin Impact",
    "Azur Lane",
    "Blue Archive",
    "NIKKE: The Goddess Of Victory",
    "Zenless Zone Zero",
    "Honkai Star Rail",
    "Wuthering Waves"
  ];

  type = type || "full";

  while (true) {
    try {
      const query = q || queries[Math.floor(Math.random() * queries.length)];
      const page = Math.floor(Math.random() * 10) + 1;

      const { items } = await fetchJson(
        `https://www.zerochan.net/${encodeURIComponent(query)},female,solo?p=${page}&l=100&s=id&json`
      );

      if (!items?.length) continue;

      const { id } = shuffle(items)[0];
      const imgData = await fetchJson(`https://www.zerochan.net/${id}?json`);

      const imgurl = imgData[type];
      if (imgurl) return { imageId: id, imgurl };

    } catch (e) {
            if (!e.response) {
              console.log('Server tidak merespon (down / timeout)');
      break;
  }
      // axios error → e.response?.status
      if (e.response?.status === 403) continue;
      throw e;
    }
  }
};

const cropHorizontalSmart = async (buffer) => {
  const img = sharp(buffer);
  const { width, height } = await img.metadata();

  return img.extract({
    left: 0,
    top: Math.floor(height * 0.05),
    width,
    height: Math.min(
      Math.floor(width * 9 / 16),
      Math.floor(height * 0.9)
    ),
  }).toBuffer();
};