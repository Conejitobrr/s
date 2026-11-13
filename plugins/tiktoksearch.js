'use strict';

const fs = require('fs');
const path = require('path');

const TEMP_DIR = path.join(process.cwd(), 'temp');
const searchSessions = new Map();
const SESSION_TTL = 10 * 60 * 1000; // 10 minutos activa la búsqueda por usuario

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function cleanJid(jid = '') {
  return String(jid).split(':')[0];
}

function cleanNumber(jid = '') {
  return cleanJid(jid).split('@')[0].replace(/\D/g, '');
}

function getSessionKey(remoteJid, sender) {
  return `${remoteJid}:${cleanJid(sender)}`;
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of searchSessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL) {
      searchSessions.delete(key);
    }
  }
}

function formatCount(num = 0) {
  const n = Number(num || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// 🔎 Busca videos reales en TikTok sin marca de agua
async function searchTikTokVideos(keywords) {
  const bodyParams = new URLSearchParams({
    keywords,
    count: '15',
    cursor: '0',
    web: '1',
    hd: '1'
  });

  const res = await fetch('https://www.tikwm.com/api/feed/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: bodyParams.toString()
  });

  const json = await res.json();
  const list = json?.data?.videos || [];

  return list
    .filter(v => v && (v.play || v.wmplay))
    .map(v => ({
      id: v.video_id || '',
      title: (v.title || 'Sin descripción').trim(),
      author: v.author?.nickname || v.author?.unique_id || 'Creador TikTok',
      username: v.author?.unique_id ? `@${v.author.unique_id}` : '',
      duration: v.duration || 0,
      views: formatCount(v.play_count),
      likes: formatCount(v.digg_count),
      music: v.music_info?.title || 'Sonido original',
      videoUrl: v.play || v.wmplay
    }));
}

// 📤 Envía el video actual con respaldo de descarga si el enlace directo falla
async function sendTikTokResult({ sock, remoteJid, msg, sender, session }) {
  const item = session.results[session.index];
  if (!item) return;

  const total = session.results.length;
  const currentNum = session.index + 1;
  const senderClean = cleanJid(sender);
  const hasMore = currentNum < total;

  const caption =
    `🎬 *TIKTOK SEARCH* (${currentNum}/${total})\n\n` +
    `🔎 *Búsqueda:* ${session.query}\n` +
    `👤 *Autor:* ${item.author} ${item.username ? `(${item.username})` : ''}\n` +
    `📝 *Título:* ${item.title.slice(0, 140)}\n` +
    `🎵 *Audio:* ${item.music.slice(0, 60)}\n` +
    `❤️ ${item.likes}   👁️ ${item.views}\n\n` +
    (hasMore
      ? `👉 Escribe *siguiente* (o *.siguiente*) para ver el video #${currentNum + 1}`
      : `🏁 _Has llegado al último resultado de esta búsqueda._`);

  // 1er intento: Envío rápido por URL directa
  try {
    await sock.sendMessage(remoteJid, {
      video: { url: item.videoUrl },
      mimetype: 'video/mp4',
      caption,
      mentions: [senderClean]
    }, { quoted: msg });
    return;
  } catch {}

  // 2do intento (Respaldo): Descargar buffer en temp y enviarlo
  ensureTemp();
  const tempFile = path.join(TEMP_DIR, `tt_search_${Date.now()}_${Math.floor(Math.random() * 9999)}.mp4`);
  try {
    const vidRes = await fetch(item.videoUrl);
    if (!vidRes.ok) throw new Error('Error descargando stream');
    const buffer = Buffer.from(await vidRes.arrayBuffer());
    fs.writeFileSync(tempFile, buffer);

    await sock.sendMessage(remoteJid, {
      video: fs.readFileSync(tempFile),
      mimetype: 'video/mp4',
      caption,
      mentions: [senderClean]
    }, { quoted: msg });
  } finally {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
  }
}

module.exports = {
  name: 'ttsearch',
  aliases: ['tiktoksearch', 'buscartt', 'buscartiktok', 'ttbusqueda', 'siguiente', 'sig'],
  category: 'descargas',
  desc: 'Busca videos en TikTok y permite ver más resultados con "siguiente"',

  execute: async ({ sock, remoteJid, args, sender, msg, commandName, db, reply }) => {
    cleanExpiredSessions();
    const cmd = commandName.toLowerCase();
    const senderClean = cleanJid(sender);
    const sessionKey = getSessionKey(remoteJid, senderClean);

    // ⏭️ SI USARON .siguiente o .sig
    if (cmd === 'siguiente' || cmd === 'sig') {
      const session = searchSessions.get(sessionKey);
      if (!session) {
        return reply('❌ No tienes ninguna búsqueda de TikTok activa.\n\n📌 Usa primero: *.ttsearch [lo que quieras buscar]*');
      }

      if (session.loading) return;

      if (session.index + 1 >= session.results.length) {
        searchSessions.delete(sessionKey);
        return reply('🏁 Ya viste todos los resultados de esta búsqueda. Haz una nueva con *.ttsearch [tema]*.');
      }

      session.loading = true;
      session.index += 1;
      session.updatedAt = Date.now();

      try {
        await sock.sendMessage(remoteJid, { react: { text: '⏭️', key: msg.key } }).catch(() => {});
        await sendTikTokResult({ sock, remoteJid, msg, sender: senderClean, session });
      } catch (err) {
        console.log('❌ Error enviando siguiente TikTok:', err?.message || err);
        await reply('❌ No se pudo cargar ese video. Escribe *siguiente* para saltar al próximo.');
      } finally {
        session.loading = false;
      }
      return;
    }

    // 🔎 NUEVA BÚSQUEDA (.ttsearch <texto>)
    const query = args.join(' ').trim();
    if (!query) {
      return reply(
        '🔍 *BUSCADOR DE TIKTOK*\n\n' +
        'Escribe lo que quieres buscar y luego pon *siguiente* para cambiar de video.\n\n' +
        '📌 *Ejemplo:*\n' +
        '*.ttsearch edits de anime*'
      );
    }

    try {
      await sock.sendMessage(remoteJid, { react: { text: '🔍', key: msg.key } }).catch(() => {});

      const results = await searchTikTokVideos(query);
      if (!results.length) {
        return reply(`❌ No encontré videos en TikTok para *"${query}"*. Intenta con otras palabras.`);
      }

      const session = {
        query,
        results,
        index: 0,
        loading: true,
        updatedAt: Date.now()
      };

      searchSessions.set(sessionKey, session);

      await sendTikTokResult({ sock, remoteJid, msg, sender: senderClean, session });
      session.loading = false;

      if (db && typeof db.addXP === 'function') {
        await db.addXP(senderClean, Math.floor(Math.random() * 10) + 5);
      }
    } catch (err) {
      searchSessions.delete(sessionKey);
      console.log('❌ Error en ttsearch:', err?.message || err);
      return reply('❌ Ocurrió un error al buscar en TikTok. Intenta de nuevo en unos segundos.');
    }
  },

  // 👂 DETECTA CUANDO EL USUARIO ESCRIBE "siguiente" O "next" SIN PUNTO EN EL CHAT
  onMessage: async ({ sock, remoteJid, sender, body, msg, reply }) => {
    if (!body) return;
    const text = body.trim().toLowerCase();
    if (!['siguiente', 'next', 'otro tiktok', 'otro'].includes(text)) return;

    cleanExpiredSessions();
    const senderClean = cleanJid(sender);
    const sessionKey = getSessionKey(remoteJid, senderClean);
    const session = searchSessions.get(sessionKey);

    if (!session || session.loading) return;

    if (session.index + 1 >= session.results.length) {
      searchSessions.delete(sessionKey);
      return reply('🏁 Ya llegaste al final de los resultados. Usa *.ttsearch [tema]* para buscar más.');
    }

    session.loading = true;
    session.index += 1;
    session.updatedAt = Date.now();

    try {
      await sock.sendMessage(remoteJid, { react: { text: '⏭️', key: msg.key } }).catch(() => {});
      await sendTikTokResult({ sock, remoteJid, msg, sender: senderClean, session });
    } catch (err) {
      console.log('❌ Error en siguiente (onMessage):', err?.message || err);
      await reply('❌ Falló la carga de este video. Escribe *siguiente* para probar con el próximo.');
    } finally {
      session.loading = false;
    }
  }
};
