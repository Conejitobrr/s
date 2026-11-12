'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const yts = require('yt-search');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const FREE_LIMIT = 3;
const MAX_DURATION_SECONDS = 10 * 60;
const QUEUE_DELAY = 5000;

const queues = new Map();
const processingChats = new Set();
const dailyUses = new Map();

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function cleanNumber(jid = '') { return String(jid).split('@')[0].split(':')[0].replace(/\D/g, ''); }
function sanitizeFileName(name = 'audio') { return String(name).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'audio'; }
function msToSeconds(ms = 0) { return Math.floor(Number(ms || 0) / 1000); }
function formatSeconds(seconds = 0) { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${String(s).padStart(2, '0')}`; }

function parseTimestampSeconds(timestamp = '') {
  const parts = String(timestamp).split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function todayKey(sender) {
  const d = new Date();
  return `${cleanNumber(sender)}-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function useDailyLimit(sender) {
  const key = todayKey(sender);
  const used = dailyUses.get(key) || 0;
  if (used >= FREE_LIMIT) return { allowed: false, remaining: 0 };
  const next = used + 1;
  dailyUses.set(key, next);
  return { allowed: true, remaining: FREE_LIMIT - next };
}

// 🌐 Búsqueda nativa sin axios
async function searchITunes(query) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1&country=US`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.results?.[0] || null;
}

function scoreVideo(video, meta) {
  const title = String(video.title || '').toLowerCase();
  const author = String(video.author?.name || '').toLowerCase();
  const track = String(meta.trackName || '').toLowerCase();
  const artist = String(meta.artistName || '').toLowerCase();

  const ytSeconds = parseTimestampSeconds(video.timestamp);
  const realSeconds = msToSeconds(meta.trackTimeMillis);
  const diff = ytSeconds && realSeconds ? Math.abs(ytSeconds - realSeconds) : 999;

  let score = 0;
  if (title.includes(track)) score += 40;
  if (title.includes(artist)) score += 30;
  if (author.includes(artist)) score += 20;

  if (title.includes('official audio') || title.includes('audio oficial')) score += 35;
  if (author.includes('topic')) score += 40;
  if (title.includes('topic')) score += 20;

  if (diff <= 4) score += 45;
  else if (diff <= 8) score += 35;
  else if (diff <= 15) score += 20;
  else if (diff >= 30) score -= 60;

  const badWords = ['official video', 'video oficial', 'music video', 'videoclip', 'lyrics', 'letra', 'live', 'en vivo', 'cover', 'remix', 'slowed', 'reverb', 'karaoke', 'instrumental', 'sped up', 'nightcore'];
  for (const word of badWords) { if (title.includes(word)) score -= 50; }
  return score;
}

async function searchBestAudio(meta) {
  const query = `${meta.artistName} ${meta.trackName} official audio topic`;
  const res = await yts(query);
  if (!res.videos?.length) return null;
  const sorted = res.videos.filter(v => v.url).map(v => ({ video: v, score: scoreVideo(v, meta) })).sort((a, b) => b.score - a.score);
  return sorted[0]?.video || null;
}

async function downloadAudio(url, output) {
  await execFileAsync('yt-dlp', [
    '--extractor-args', 'youtube:player_client=android,web',
    '--geo-bypass', '--force-ipv4', '--no-playlist', '--ignore-errors', '--no-warnings',
    '-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '320K',
    '-o', output, url
  ], { timeout: 150000 });
}

async function processQueue(chatId) {
  if (processingChats.has(chatId)) return;
  processingChats.add(chatId);
  const queue = queues.get(chatId) || [];

  while (queue.length > 0) {
    const job = queue.shift();
    try {
      await handleDownload(job);
    } catch (err) {
      console.log('❌ Error en spotify queue:', err?.message || err);
      await job.sock.sendMessage(job.remoteJid, { text: '❌ Error al procesar esta canción.' }, { quoted: job.msg });
    }
    if (queue.length > 0) await sleep(QUEUE_DELAY);
  }
  queues.delete(chatId);
  processingChats.delete(chatId);
}

async function handleDownload(job) {
  const { sock, remoteJid, msg, query } = job;
  let downloadedPath = null, coverPath = null, finalAudio = null;

  try {
    const meta = await searchITunes(query);
    if (!meta) return sock.sendMessage(remoteJid, { text: '❌ No encontré datos de esa canción en el catálogo musical.' }, { quoted: msg });

    const realSeconds = msToSeconds(meta.trackTimeMillis);
    if (realSeconds > MAX_DURATION_SECONDS) {
      return sock.sendMessage(remoteJid, { text: `❌ La canción supera el límite de 10 minutos (${formatSeconds(realSeconds)}).` }, { quoted: msg });
    }

    const video = await searchBestAudio(meta);
    if (!video) return sock.sendMessage(remoteJid, { text: '❌ No encontré una versión de audio confiable.' }, { quoted: msg });

    const title = sanitizeFileName(meta.trackName);
    const artist = sanitizeFileName(meta.artistName);
    const album = sanitizeFileName(meta.collectionName || 'Álbum desconocido');
    const year = String(meta.releaseDate || '').slice(0, 4) || 'Desconocido';
    const genre = sanitizeFileName(meta.primaryGenreName || 'Music');
    const duration = formatSeconds(realSeconds);
    const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;

    const rawOutput = path.join(TEMP_DIR, `spotify_${id}.%(ext)s`);
    await downloadAudio(video.url, rawOutput);

    const downloaded = fs.readdirSync(TEMP_DIR).find(f => f.startsWith(`spotify_${id}`) && f.endsWith('.mp3'));
    if (!downloaded) return sock.sendMessage(remoteJid, { text: '❌ No se pudo descargar el audio.' }, { quoted: msg });

    downloadedPath = path.join(TEMP_DIR, downloaded);
    const coverUrl = String(meta.artworkUrl100 || '').replace('100x100bb', '1200x1200bb');
    coverPath = path.join(TEMP_DIR, `cover_${id}.jpg`);

    const coverRes = await fetch(coverUrl);
    const coverBuffer = Buffer.from(await coverRes.arrayBuffer());
    fs.writeFileSync(coverPath, coverBuffer);

    finalAudio = path.join(TEMP_DIR, `${title}_${id}.mp3`);

    await execFileAsync('ffmpeg', [
      '-i', downloadedPath, '-i', coverPath,
      '-map', '0', '-map', '1', '-c', 'copy', '-id3v2_version', '3',
      '-metadata', `title=${title}`, '-metadata', `artist=${artist}`, '-metadata', `album=${album}`,
      '-metadata', `date=${year}`, '-metadata', `year=${year}`, '-metadata', `genre=${genre}`,
      '-metadata', 'comment=Metadata by SiriusBot',
      '-disposition:v', 'attached_pic', '-y', finalAudio
    ]);

    const sizeMB = fs.statSync(finalAudio).size / 1024 / 1024;
    if (sizeMB > 90) return sock.sendMessage(remoteJid, { text: '❌ El audio pesa demasiado para enviarlo por WhatsApp.' }, { quoted: msg });

    await sock.sendMessage(remoteJid, {
      image: fs.readFileSync(coverPath),
      caption: `🎧 *Sirius Spotify Style*\n\n🎶 *${title}*\n👤 ${artist}\n💿 ${album}\n📅 ${year}\n🎼 ${genre}\n⏱️ ${duration}\n💽 Carátula y metadata agregadas`
    }, { quoted: msg });

    await sock.sendMessage(remoteJid, {
      audio: fs.readFileSync(finalAudio),
      mimetype: 'audio/mpeg',
      fileName: `${title}.mp3`,
      ptt: false
    }, { quoted: msg });

  } finally {
    [downloadedPath, coverPath, finalAudio].forEach(file => {
      try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    });
  }
}

module.exports = {
  name: 'spotify',
  aliases: ['sp', 'song'],
  category: 'multimedia',
  desc: 'Descarga música con portada y metadata MP3',

  execute: async ({ sock, remoteJid, args, msg, sender, isOwner, userData, reply }) => {
    try {
      if (!args.length) return reply('❌ Ingresa una canción.\n\n📌 Ejemplo:\n.spotify bad bunny dakiti');

      const query = args.join(' ').trim();
      const senderClean = String(sender).split(':')[0];
      const premium = isOwner || userData?.premium === true || Number(userData?.premiumUntil || 0) > Date.now();
      let remaining = '∞';

      if (!premium) {
        const limit = useDailyLimit(senderClean);
        if (!limit.allowed) return reply(`❌ Alcanzaste tu límite diario.\n\n🎧 Usuarios normales: ${FREE_LIMIT} canciones por día\n👑 Premium y Owner: Ilimitado`);
        remaining = limit.remaining;
      }

      if (!queues.has(remoteJid)) queues.set(remoteJid, []);
      const queue = queues.get(remoteJid);
      const position = queue.length + (processingChats.has(remoteJid) ? 1 : 0);

      queue.push({ sock, remoteJid, msg, sender: senderClean, query });

      const text = position === 0
        ? `📥 *Pedido añadido*\n\n👤 Pedido por: @${cleanNumber(senderClean)}\n🎶 Canción: *${query}*\n🎧 Pedidos restantes hoy: *${remaining}*\n\n⏳ Descargando y agregando carátula...`
        : `📥 *Pedido en cola (#${position + 1})*\n\n👤 Pedido por: @${cleanNumber(senderClean)}\n🎶 Canción: *${query}*\n🎧 Pedidos restantes hoy: *${remaining}*`;

      await sock.sendMessage(remoteJid, { text, mentions: [senderClean] }, { quoted: msg });
      processQueue(remoteJid);

    } catch (err) {
      console.log('❌ Error inicial en spotify:', err?.message || err);
      return reply('❌ Ocurrió un error al procesar tu solicitud.');
    }
  }
};
