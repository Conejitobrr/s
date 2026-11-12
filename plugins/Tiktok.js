'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');

const QUEUE_DELAY = 3000;
const queues = new Map();
const processingChats = new Set();
const warnedChats = new Map();

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function isTikTokUrl(url = '') {
  return /tiktok\.com/i.test(url);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadTikTok(url, output) {
  await execFileAsync('yt-dlp', [
    '-f', 'mp4/best',
    '--no-playlist',
    '--add-header', 'user-agent:Mozilla/5.0',
    '-o', output,
    url
  ], { timeout: 120000 });
}

async function convertVideo(input, output) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', input,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-vf', "scale='min(720,iw)':-2",
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-movflags', '+faststart',
    output
  ], {
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10
  });
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
      console.log('❌ Error en cola tiktok:', err?.message || err);
      await job.sock.sendMessage(job.remoteJid, { text: '❌ Error al procesar este TikTok.' }, { quoted: job.msg });
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
  let rawFile = null;
  let finalFile = null;

  try {
    ensureTemp();
    const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    rawFile = path.join(TEMP_DIR, `tt_raw_${id}.mp4`);
    finalFile = path.join(TEMP_DIR, `tt_final_${id}.mp4`);

    await sock.sendMessage(remoteJid, { text: '⏳ Descargando TikTok sin marca de agua...' }, { quoted: msg });

    await downloadTikTok(query, rawFile);
    await convertVideo(rawFile, finalFile);

    const fileToSend = fs.existsSync(finalFile) ? finalFile : (fs.existsSync(rawFile) ? rawFile : null);
    if (!fileToSend) {
      return sock.sendMessage(remoteJid, { text: '❌ No se pudo procesar el video.' }, { quoted: msg });
    }

    const sizeMB = fs.statSync(fileToSend).size / 1024 / 1024;
    if (sizeMB > 48) {
      return sock.sendMessage(remoteJid, { text: `⚠️ Video muy pesado (${sizeMB.toFixed(1)} MB)` }, { quoted: msg });
    }

    await sock.sendMessage(remoteJid, {
      video: fs.readFileSync(fileToSend),
      mimetype: 'video/mp4',
      caption: '🎬 *TikTok descargado con éxito*'
    }, { quoted: msg });

  } finally {
    for (const file of [rawFile, finalFile]) {
      try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    }
  }
}

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'tiktokdl'],
  category: 'multimedia',
  desc: 'Descarga un video de TikTok desde su enlace',

  execute: async ({ sock, remoteJid, args, sender, msg, pushName, quoted, reply }) => {
    try {
      const query = (args[0] || quoted?.text || '').trim().split(/\s+/)[0];
      if (!query) return reply('❌ Envía o responde a un link de TikTok.\n\n📌 Ejemplo:\n.tiktok https://vm.tiktok.com/...');
      if (!isTikTokUrl(query)) return reply('❌ Link inválido de TikTok.');

      if (!queues.has(remoteJid)) queues.set(remoteJid, []);
      const queue = queues.get(remoteJid);
      const isProcessing = processingChats.has(remoteJid);
      const activeCount = queue.length + (isProcessing ? 1 : 0);

      if (activeCount >= 3) {
        if (!warnedChats.has(remoteJid)) warnedChats.set(remoteJid, new Set());
        const warnedUsers = warnedChats.get(remoteJid);
        if (warnedUsers.has(sender)) return;
        warnedUsers.add(sender);
        return reply('⚠️ *COLA LLENA*\n\nYa hay descargas en proceso. Espera unos segundos.');
      }

      queue.push({ sock, remoteJid, msg, sender, pushName, query });

      if (activeCount > 0) {
        await reply(`📥 *TikTok en cola* (Posición #${activeCount + 1})\n⏳ Se procesará en breve.`);
      }

      processQueue(remoteJid);
    } catch (err) {
      console.log('❌ Error en comando tiktok:', err?.message || err);
      await reply('❌ Error al intentar descargar.');
    }
  }
};
