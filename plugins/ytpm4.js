'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const yts = require('yt-search');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');

const QUEUE_DELAY = 5000;
const queues = new Map();
const processingChats = new Set();
const warnedChats = new Map();

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function isYouTubeUrl(text = '') {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(text);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanNumber(jid = '') {
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

async function searchVideo(query) {
  const res = await yts(query);
  if (!res.videos?.length) return null;

  return (
    res.videos.find(v =>
      v.url &&
      !v.title?.toLowerCase().includes('mix') &&
      !v.title?.toLowerCase().includes('playlist')
    ) || res.videos[0]
  );
}

async function downloadVideo(url, output) {
  await execFileAsync('yt-dlp', [
    '--extractor-args', 'youtube:player_client=android,web',
    '--geo-bypass',
    '--force-ipv4',
    '--no-playlist',
    '--ignore-errors',
    '--no-warnings',
    '-f', 'bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4][height<=480]/best',
    '--merge-output-format', 'mp4',
    '-o', output,
    url
  ], { timeout: 180000 });
}

function sanitizeFileName(name = 'video') {
  return String(name).replace(/[\\/:*?"<>|]/g, '').slice(0, 80).trim() || 'video';
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
      console.log('❌ Error en cola de video:', err?.message || err);
      await job.sock.sendMessage(job.remoteJid, { text: '❌ Error al procesar este video.' }, { quoted: job.msg });
    }
    warnedChats.delete(chatId);
    if (queue.length > 0) await sleep(QUEUE_DELAY);
  }

  queues.delete(chatId);
  processingChats.delete(chatId);
  warnedChats.delete(chatId);
}

async function handleDownload(job) {
  const { sock, remoteJid, msg, query } = job;
  let finalFile = null;

  try {
    ensureTemp();
    let url = query;
    let title = 'Video de YouTube';
    const videoInfo = await searchVideo(query);

    if (!isYouTubeUrl(query)) {
      if (!videoInfo) {
        return sock.sendMessage(remoteJid, { text: '❌ No se encontraron resultados.' }, { quoted: msg });
      }
      url = videoInfo.url;
      title = videoInfo.title || title;
    } else if (videoInfo) {
      title = videoInfo.title || title;
    }

    if (url.includes('list=')) {
      return sock.sendMessage(remoteJid, { text: '❌ No se permiten playlists para evitar saturación.' }, { quoted: msg });
    }

    if (videoInfo && videoInfo.seconds > 900) {
      return sock.sendMessage(remoteJid, { text: '❌ El video supera el límite de 15 minutos.' }, { quoted: msg });
    }

    if (videoInfo && videoInfo.thumbnail) {
      const infoText = `🎬 *SIRIUS VIDEO* 🎬\n\n📌 *Título:* ${title}\n⏱️ *Duración:* ${videoInfo.timestamp || 'Desconocida'}\n👀 *Vistas:* ${videoInfo.views || 'Desconocidas'}\n\n⬇️ _Descargando video a 480p, un momento..._`;
      await sock.sendMessage(remoteJid, {
        image: { url: videoInfo.thumbnail },
        caption: infoText
      }, { quoted: msg }).catch(() => {});
    }

    const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    finalFile = path.join(TEMP_DIR, `yt_video_${id}.mp4`);

    await downloadVideo(url, finalFile);

    if (!fs.existsSync(finalFile)) {
      return sock.sendMessage(remoteJid, { text: '❌ No se pudo descargar el video.' }, { quoted: msg });
    }

    const sizeMB = fs.statSync(finalFile).size / 1024 / 1024;
    if (sizeMB > 50) {
      return sock.sendMessage(remoteJid, { text: `⚠️ El video pesa demasiado (${sizeMB.toFixed(1)} MB). El límite es 50 MB.` }, { quoted: msg });
    }

    await sock.sendMessage(remoteJid, {
      video: fs.readFileSync(finalFile),
      mimetype: 'video/mp4',
      caption: `🎬 *${title}*`,
      fileName: `${sanitizeFileName(title)}.mp4`
    }, { quoted: msg });

  } finally {
    if (finalFile && fs.existsSync(finalFile)) {
      try { fs.unlinkSync(finalFile); } catch {}
    }
  }
}

module.exports = {
  name: 'video',
  aliases: ['ytmp4', 'ytvideo', 'mp4'],
  category: 'multimedia',
  desc: 'Busca y descarga un video de YouTube optimizado a 480p',

  execute: async ({ sock, remoteJid, args, sender, msg, pushName, reply }) => {
    try {
      if (!args.length) {
        return reply('❌ Envía un link o nombre del video.\n\n📌 Ejemplo:\n.video bad bunny');
      }

      const query = args.join(' ').trim();
      const senderClean = String(sender).split(':')[0];
      const senderNum = cleanNumber(senderClean);

      if (!queues.has(remoteJid)) queues.set(remoteJid, []);
      const queue = queues.get(remoteJid);
      const isProcessing = processingChats.has(remoteJid);
      const activeCount = queue.length + (isProcessing ? 1 : 0);

      if (activeCount >= 2) {
        if (!warnedChats.has(remoteJid)) warnedChats.set(remoteJid, new Set());
        const warnedUsers = warnedChats.get(remoteJid);
        if (warnedUsers.has(senderClean)) return;
        warnedUsers.add(senderClean);

        return sock.sendMessage(remoteJid, {
          text: `⚠️ *COLA LLENA*\n\n@${senderNum}, ya hay videos procesándose en este chat. Espera un momento.`,
          mentions: [senderClean]
        }, { quoted: msg });
      }

      queue.push({ sock, remoteJid, msg, sender: senderClean, pushName, query });

      if (activeCount > 0) {
        await sock.sendMessage(remoteJid, {
          text: `📥 *Video en cola (#${activeCount + 1})*\n\n👤 Pedido por: @${senderNum}\n🎬 Búsqueda: *${query}*`,
          mentions: [senderClean]
        }, { quoted: msg });
      }

      processQueue(remoteJid);
    } catch (err) {
      console.log('❌ Error en comando video:', err?.message || err);
      await reply('❌ Error al intentar procesar el video.');
    }
  }
};
