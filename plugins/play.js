'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const yts = require('yt-search');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');

// ⚡ Cola rápida: 5 segundos entre canciones en lugar de 2 minutos
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

async function searchYouTube(query) {
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

async function downloadAudio(url, output) {
  await execFileAsync('yt-dlp', [
    '--extractor-args', 'youtube:player_client=android,web',
    '--geo-bypass',
    '--force-ipv4',
    '--no-playlist',
    '--ignore-errors',
    '--no-warnings',
    '-f', 'ba/b',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '128K',
    '-o', output,
    url
  ], { timeout: 150000 });
}

function sanitizeFileName(name = 'audio') {
  return String(name).replace(/[\\/:*?"<>|]/g, '').slice(0, 80).trim() || 'audio';
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
      console.log('❌ Error en cola play:', err?.message || err);
      await job.sock.sendMessage(job.remoteJid, { text: '❌ Error al procesar esta canción.' }, { quoted: job.msg });
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
  let finalPath = null;

  try {
    ensureTemp();
    let url = query;
    let title = 'Audio de YouTube';
    const videoInfo = await searchYouTube(query);

    if (!isYouTubeUrl(query)) {
      if (!videoInfo) {
        return sock.sendMessage(remoteJid, { text: '❌ No se encontraron resultados.' }, { quoted: msg });
      }
      url = videoInfo.url;
      title = videoInfo.title || title;
    } else if (videoInfo) {
      title = videoInfo.title || title;
    }

    if (videoInfo && videoInfo.thumbnail) {
      const infoText = `🎧 *SIRIUS MUSIC* 🎧\n\n📌 *Título:* ${title}\n⏱️ *Duración:* ${videoInfo.timestamp || 'Desconocida'}\n👀 *Vistas:* ${videoInfo.views || 'Desconocidas'}\n\n⬇️ _Descargando audio optimizado, un momento..._`;
      await sock.sendMessage(remoteJid, {
        image: { url: videoInfo.thumbnail },
        caption: infoText
      }, { quoted: msg }).catch(() => {});
    }

    const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const fileTemplate = path.join(TEMP_DIR, `yt_audio_${id}.%(ext)s`);

    await downloadAudio(url, fileTemplate);

    const files = fs.readdirSync(TEMP_DIR);
    const downloaded = files.find(f => f.startsWith(`yt_audio_${id}`) && f.endsWith('.mp3'));

    if (!downloaded) {
      return sock.sendMessage(remoteJid, { text: '❌ No se pudo descargar el audio.' }, { quoted: msg });
    }

    finalPath = path.join(TEMP_DIR, downloaded);
    const sizeMB = fs.statSync(finalPath).size / 1024 / 1024;

    if (sizeMB > 90) {
      return sock.sendMessage(remoteJid, { text: '❌ El audio pesa demasiado para enviarlo por WhatsApp.' }, { quoted: msg });
    }

    await sock.sendMessage(remoteJid, {
      audio: fs.readFileSync(finalPath),
      mimetype: 'audio/mpeg',
      fileName: `${sanitizeFileName(title)}.mp3`
    }, { quoted: msg });

  } finally {
    try {
      if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    } catch {}
  }
}

module.exports = {
  name: 'play',
  aliases: ['yt', 'youtube', 'musica', 'cancion'],
  category: 'multimedia',
  desc: 'Busca, muestra información y descarga música de YouTube',

  execute: async ({ sock, remoteJid, args, msg, sender, pushName, reply }) => {
    try {
      if (!args.length) {
        return reply('❌ Envía un link o nombre de canción.\n\n📌 Ejemplo:\n.play bad bunny');
      }

      const query = args.join(' ').trim();
      const senderClean = String(sender).split(':')[0];
      const senderNum = cleanNumber(senderClean);

      if (!queues.has(remoteJid)) queues.set(remoteJid, []);
      const queue = queues.get(remoteJid);
      const isProcessing = processingChats.has(remoteJid);
      const activeCount = queue.length + (isProcessing ? 1 : 0);

      if (activeCount >= 3) {
        if (!warnedChats.has(remoteJid)) warnedChats.set(remoteJid, new Set());
        const warnedUsers = warnedChats.get(remoteJid);
        if (warnedUsers.has(senderClean)) return;
        warnedUsers.add(senderClean);

        return sock.sendMessage(remoteJid, {
          text: `⚠️ *COLA LLENA*\n\n@${senderNum}, ya hay canciones procesándose en este chat. Espera unos segundos.`,
          mentions: [senderClean]
        }, { quoted: msg });
      }

      queue.push({ sock, remoteJid, msg, sender: senderClean, pushName, query });

      if (activeCount > 0) {
        await sock.sendMessage(remoteJid, {
          text: `📥 *Añadido a la cola (#${activeCount + 1})*\n\n👤 Por: @${senderNum}\n🎶 Búsqueda: *${query}*`,
          mentions: [senderClean]
        }, { quoted: msg });
      }

      processQueue(remoteJid);
    } catch (err) {
      console.log('❌ Error en comando play:', err?.message || err);
      return reply('❌ Error al iniciar la descarga.');
    }
  }
};
