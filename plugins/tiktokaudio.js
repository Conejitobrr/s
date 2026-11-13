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

function cleanJid(jid = '') {
  return String(jid).split(':')[0];
}

function cleanNumber(jid = '') {
  return cleanJid(jid).split('@')[0].replace(/\D/g, '');
}

function extractTikTokUrl(text = '') {
  const match = String(text).match(/https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/i);
  return match ? match[0] : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadTikTokAudio(url, baseOutputPath) {
  // 1er intento: Extracción directa de audio MP3 con yt-dlp
  try {
    const mp3Out = `${baseOutputPath}.mp3`;
    await execFileAsync('yt-dlp', [
      '--no-playlist',
      '--no-warnings',
      '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      '-f', 'ba/b',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '128K',
      '-o', `${baseOutputPath}.%(ext)s`,
      url
    ], { timeout: 120000 });

    if (fs.existsSync(mp3Out) && fs.statSync(mp3Out).size > 0) {
      return mp3Out;
    }
  } catch {}

  // 2do intento (Respaldo): Descarga el MP4 y extrae el audio con FFmpeg
  const rawMp4 = `${baseOutputPath}_raw.mp4`;
  const fallbackMp3 = `${baseOutputPath}_fb.mp3`;

  await execFileAsync('yt-dlp', [
    '-f', 'mp4/best',
    '--no-playlist',
    '--add-header', 'user-agent:Mozilla/5.0',
    '-o', rawMp4,
    url
  ], { timeout: 120000 });

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', rawMp4,
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '128k',
    '-ar', '44100',
    fallbackMp3
  ], { timeout: 90000 });

  try { if (fs.existsSync(rawMp4)) fs.unlinkSync(rawMp4); } catch {}
  return fallbackMp3;
}

async function processQueue(chatId) {
  if (processingChats.has(chatId)) return;
  processingChats.add(chatId);
  const queue = queues.get(chatId) || [];

  while (queue.length > 0) {
    const job = queue.shift();
    try {
      await handleAudioJob(job);
    } catch (err) {
      console.log('❌ Error en cola tiktokaudio:', err?.message || err);
      await job.sock.sendMessage(job.remoteJid, {
        text: '❌ No se pudo extraer el audio de este TikTok. Verifica que el enlace sea público.'
      }, { quoted: job.msg });
    }
    warnedChats.delete(chatId);
    if (queue.length > 0) await sleep(QUEUE_DELAY);
  }

  queues.delete(chatId);
  processingChats.delete(chatId);
  warnedChats.delete(chatId);
}

async function handleAudioJob(job) {
  const { sock, remoteJid, msg, sender, url, asVoice, db } = job;
  let audioFile = null;

  try {
    ensureTemp();
    const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const baseOutput = path.join(TEMP_DIR, `tt_audio_${id}`);

    await sock.sendMessage(remoteJid, {
      text: asVoice ? '🎙️ _Extrayendo nota de voz de TikTok..._' : '🎵 _Extrayendo audio MP3 de TikTok..._'
    }, { quoted: msg });

    audioFile = await downloadTikTokAudio(url, baseOutput);

    if (!audioFile || !fs.existsSync(audioFile)) {
      return sock.sendMessage(remoteJid, { text: '❌ No se pudo obtener el audio del enlace.' }, { quoted: msg });
    }

    const sizeMB = fs.statSync(audioFile).size / 1024 / 1024;
    if (sizeMB > 60) {
      return sock.sendMessage(remoteJid, { text: `⚠️ El audio pesa demasiado (${sizeMB.toFixed(1)} MB).` }, { quoted: msg });
    }

    await sock.sendMessage(remoteJid, {
      audio: fs.readFileSync(audioFile),
      mimetype: 'audio/mpeg',
      fileName: `TikTok_Audio_${id}.mp3`,
      ptt: asVoice
    }, { quoted: msg });

    if (db && typeof db.addXP === 'function') {
      await db.addXP(sender, Math.floor(Math.random() * 10) + 5);
    }
  } finally {
    try {
      if (audioFile && fs.existsSync(audioFile)) fs.unlinkSync(audioFile);
    } catch {}
  }
}

module.exports = {
  name: 'ttmp3',
  aliases: ['tiktokaudio', 'ttaudio', 'tiktokmp3', 'audiott'],
  category: 'descargas',
  desc: 'Descarga únicamente el audio MP3 de un video de TikTok',

  execute: async ({ sock, remoteJid, args, sender, msg, quoted, db, reply }) => {
    try {
      const fullInput = `${args.join(' ')} ${quoted?.text || ''}`.trim();
      const url = extractTikTokUrl(fullInput);

      if (!url) {
        return reply(
          '🎵 *DESCARGADOR DE AUDIO TIKTOK*\n\n' +
          'Envía o responde a un enlace de TikTok para extraer solo su música.\n\n' +
          '📌 *Ejemplos:*\n' +
          '▪️ *.ttmp3 https://vm.tiktok.com/...*\n' +
          '▪️ *.ttmp3 https://vm.tiktok.com/... voz* _(lo envía como nota de voz)_'
        );
      }

      const asVoice = /\b(voz|ptt|nota)\b/i.test(args.join(' '));
      const senderClean = cleanJid(sender);

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
          text: `⚠️ *COLA LLENA*\n\n@${cleanNumber(senderClean)}, ya hay audios de TikTok procesándose. Espera unos segundos.`,
          mentions: [senderClean]
        }, { quoted: msg });
      }

      queue.push({ sock, remoteJid, msg, sender: senderClean, url, asVoice, db });

      if (activeCount > 0) {
        await reply(`📥 *Audio en cola (#${activeCount + 1})*\n⏳ Se enviará en breve.`);
      }

      processQueue(remoteJid);
    } catch (err) {
      console.log('❌ Error en ttmp3:', err?.message || err);
      return reply('❌ Ocurrió un error al procesar el audio de TikTok.');
    }
  }
};
