'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { unwrapMessage, getContextInfo } = require('../lib/utils');

const deletedCache = new Map();
const handledDeletes = new Set();

const MAX_CACHE = 800;
const CACHE_TIME = 2 * 60 * 60 * 1000;
const MAX_MEDIA_BUFFER = 45 * 1024 * 1024;

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function getMsgKey(remoteJid, id) { return `${remoteJid}:${id}`; }
function getHandledKey(remoteJid, id) { return `${remoteJid}:${id}:handled`; }

function isDeleteMessage(msg) {
  const raw = msg.message || {};
  const protocol = raw.protocolMessage || unwrapMessage(raw)?.protocolMessage;
  if (!protocol) return false;
  return protocol.type === 0 || protocol.type === 'REVOKE' || !!protocol.key?.id;
}

function getDeletedKey(msg) {
  const raw = msg.message || {};
  const protocol = raw.protocolMessage || unwrapMessage(raw)?.protocolMessage;
  return protocol?.key || null;
}

function getMessageMentions(msg = {}) {
  const ctx = getContextInfo(msg);
  return Array.isArray(ctx?.mentionedJid) ? ctx.mentionedJid.map(cleanJid).filter(Boolean) : [];
}

function getText(message = {}) {
  return message.conversation || message.extendedTextMessage?.text ||
         message.imageMessage?.caption || message.videoMessage?.caption ||
         message.documentMessage?.caption || '';
}

function getMediaInfo(message = {}) {
  if (message.imageMessage) return { type: 'image', mediaType: 'image', media: message.imageMessage, mimetype: message.imageMessage.mimetype || 'image/jpeg', caption: message.imageMessage.caption || '' };
  if (message.videoMessage) return { type: 'video', mediaType: 'video', media: message.videoMessage, mimetype: message.videoMessage.mimetype || 'video/mp4', caption: message.videoMessage.caption || '', gifPlayback: message.videoMessage.gifPlayback || false };
  if (message.audioMessage) return { type: 'audio', mediaType: 'audio', media: message.audioMessage, mimetype: message.audioMessage.mimetype || 'audio/mpeg', ptt: message.audioMessage.ptt || false, caption: '' };
  if (message.stickerMessage) return { type: 'sticker', mediaType: 'sticker', media: message.stickerMessage, mimetype: message.stickerMessage.mimetype || 'image/webp', caption: '' };
  if (message.documentMessage) return { type: 'document', mediaType: 'document', media: message.documentMessage, mimetype: message.documentMessage.mimetype || 'application/octet-stream', fileName: message.documentMessage.fileName || 'archivo', caption: message.documentMessage.caption || '' };
  return null;
}

async function downloadMediaBuffer(mediaInfo) {
  const stream = await downloadContentFromMessage(mediaInfo.media, mediaInfo.mediaType);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > MAX_MEDIA_BUFFER) return null;
  }
  return buffer.length ? buffer : null;
}

async function saveMessage(msg, remoteJid, sender, pushName) {
  const id = msg.key?.id;
  if (!id || !msg.message || msg.key?.fromMe || isDeleteMessage(msg)) return;

  const message = unwrapMessage(msg.message);
  const media = getMediaInfo(message);
  let mediaBuffer = null;

  if (media) {
    try { mediaBuffer = await downloadMediaBuffer(media); } catch {}
  }

  const key = getMsgKey(remoteJid, id);
  deletedCache.set(key, {
    remoteJid,
    sender: cleanJid(sender),
    pushName: pushName || 'Usuario',
    message,
    mentions: getMessageMentions(msg),
    media,
    mediaBuffer,
    text: getText(message),
    time: Date.now()
  });

  if (deletedCache.size > MAX_CACHE) {
    const first = deletedCache.keys().next().value;
    deletedCache.delete(first);
  }
}

function cleanOldCache() {
  const now = Date.now();
  for (const [key, value] of deletedCache.entries()) {
    if (now - value.time > CACHE_TIME) deletedCache.delete(key);
  }
}

module.exports = {
  name: 'antidelete',
  aliases: ['antiborrar'],
  category: 'administración',
  desc: 'Recupera mensajes eliminados en tiempo real',

  onMessage: async ({ sock, msg, remoteJid, sender, pushName, fromGroup, groupData }) => {
    try {
      cleanOldCache();

      if (!isDeleteMessage(msg)) {
        await saveMessage(msg, remoteJid, sender, pushName);
        return;
      }

      const isEnabled = fromGroup ? (groupData?.antidelete !== false) : true;
      if (!isEnabled) return;

      const deletedKey = getDeletedKey(msg);
      const deletedId = deletedKey?.id;
      if (!deletedId) return;

      const handledKey = getHandledKey(remoteJid, deletedId);
      if (handledDeletes.has(handledKey)) return;

      handledDeletes.add(handledKey);
      setTimeout(() => handledDeletes.delete(handledKey), 30000);

      const cacheKey = getMsgKey(remoteJid, deletedId);
      const saved = deletedCache.get(cacheKey);
      if (!saved) return;

      const targetJid = cleanJid(saved.sender);
      const pureNumber = cleanNumber(saved.sender);

      const originalMentions = (saved.mentions || []).map(cleanJid);
      const finalMentions = [...new Set([targetJid, ...originalMentions])];

      const text = saved.text || getText(saved.message);
      const media = saved.media || getMediaInfo(saved.message);

      if (!media) {
        if (!text) { deletedCache.delete(cacheKey); return; }
        await sock.sendMessage(remoteJid, {
          text: `🕵️ *MENSAJE ELIMINADO*\n\n👤 Usuario: @${pureNumber}\n\n💬 Mensaje:\n${text}`,
          mentions: finalMentions
        });
        deletedCache.delete(cacheKey);
        return;
      }

      let buffer = saved.mediaBuffer;
      if (!buffer || !buffer.length) {
        try { buffer = await downloadMediaBuffer(media); } catch {}
      }

      if (!buffer || !buffer.length) {
        await sock.sendMessage(remoteJid, {
          text: `🕵️ *MENSAJE ELIMINADO*\n\n👤 Usuario: @${pureNumber}\n\n⚠️ Multimedia eliminado.${text ? `\n\n💬 Texto:\n${text}` : ''}`,
          mentions: finalMentions
        });
        deletedCache.delete(cacheKey);
        return;
      }

      const captionText = `🕵️ *MENSAJE ELIMINADO*\n\n👤 Usuario: @${pureNumber}${media.caption || text ? `\n\n💬 Descripción:\n${media.caption || text}` : ''}`;

      if (media.type === 'image') await sock.sendMessage(remoteJid, { image: buffer, mimetype: media.mimetype, caption: captionText, mentions: finalMentions });
      else if (media.type === 'video') await sock.sendMessage(remoteJid, { video: buffer, mimetype: media.mimetype, caption: captionText, gifPlayback: media.gifPlayback || false, mentions: finalMentions });
      else if (media.type === 'audio') {
        await sock.sendMessage(remoteJid, { audio: buffer, mimetype: media.mimetype, ptt: media.ptt || false });
        await sock.sendMessage(remoteJid, { text: captionText, mentions: finalMentions });
      } else if (media.type === 'sticker') {
        await sock.sendMessage(remoteJid, { sticker: buffer });
        await sock.sendMessage(remoteJid, { text: captionText, mentions: finalMentions });
      } else if (media.type === 'document') {
        await sock.sendMessage(remoteJid, { document: buffer, mimetype: media.mimetype, fileName: media.fileName || 'archivo', caption: captionText, mentions: finalMentions });
      }

      deletedCache.delete(cacheKey);
    } catch (err) {
      console.log('❌ Error en antidelete pasivo:', err?.message || err);
    }
  },

  execute: async ({ remoteJid, args, fromGroup, isAdmin, isOwner, db, groupData, reply }) => {
    if (!fromGroup) return reply('✅ En chats privados, *antidelete* siempre está activo.');
    if (!isOwner && !isAdmin) return reply('❌ Solo los administradores pueden usar este comando.');

    const option = (args[0] || '').toLowerCase();
    const currentStatus = groupData?.antidelete !== false;

    if (!['on', 'off'].includes(option)) {
      return reply(`🕵️ *ANTIDELETE*\n\nEstado actual: *${currentStatus ? 'Activado ✅' : 'Desactivado ❌'}*\n\nUso:\n*.antidelete on*\n*.antidelete off*`);
    }

    const newState = option === 'on';
    await db.setGroup(remoteJid, { antidelete: newState });

    return reply(newState ? '✅ Antidelete activado en este grupo.' : '🔇 Antidelete desactivado en este grupo.');
  }
};
