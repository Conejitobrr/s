'use strict';

function normalizeJid(jid = '') {
  if (!jid || typeof jid !== 'string') return '';
  const clean = jid.trim();
  if (clean.includes(':')) {
    const [user, domain] = clean.split('@');
    return `${user.split(':')[0]}@${domain || 's.whatsapp.net'}`;
  }
  return clean;
}

function cleanNumber(jid = '') {
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

function unwrapMessage(message = {}) {
  if (!message || typeof message !== 'object') return {};
  let m = message;
  let depth = 0;

  while (depth < 5) {
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    else if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    else if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    else if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
    else if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
    else if (m.editedMessage?.message) m = m.editedMessage.message;
    else if (m.protocolMessage?.editedMessage) m = m.protocolMessage.editedMessage;
    else if (m.deviceSentMessage?.message) m = m.deviceSentMessage.message;
    else break;
    depth++;
  }
  return m || {};
}

function getBody(msg = {}) {
  const m = unwrapMessage(msg.message || {});
  if (!m) return '';

  if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const parsed = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
      if (parsed?.id) return String(parsed.id);
    } catch {}
  }

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    m.interactiveResponseMessage?.body?.text ||
    ''
  );
}

function getContextInfo(msg = {}) {
  const m = unwrapMessage(msg.message || {});
  for (const key of Object.keys(m)) {
    if (m[key] && typeof m[key] === 'object' && m[key].contextInfo) {
      return m[key].contextInfo;
    }
  }
  return null;
}

function detectPrefix(text = '', customPrefix = '.') {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const prefixes = Array.isArray(customPrefix) ? customPrefix : [customPrefix];
  const prefix = prefixes.find(p => p && trimmed.startsWith(p));

  if (!prefix) return null;

  return {
    prefix,
    body: trimmed.slice(prefix.length).trim()
  };
}

async function getGroupAdmins(sock, jid = '') {
  try {
    const metadata = sock.getCachedGroupMetadata
      ? await sock.getCachedGroupMetadata(jid)
      : await sock.groupMetadata(jid);
    if (!metadata?.participants) return [];
    return metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => normalizeJid(p.id));
  } catch {
    return [];
  }
}

function getReadableType(msg = {}) {
  const m = unwrapMessage(msg.message || {});
  if (!m) return 'Desconocido';

  const keys = Object.keys(m);
  if (keys.includes('conversation') || keys.includes('extendedTextMessage')) return '📝 Texto';
  if (keys.includes('imageMessage')) return '📸 Imagen';
  if (keys.includes('videoMessage')) return '🎥 Video';
  if (keys.includes('audioMessage')) return '🎵 Audio / Nota de voz';
  if (keys.includes('stickerMessage')) return '🧩 Sticker';
  if (keys.includes('documentMessage')) return '📄 Documento';
  if (keys.includes('locationMessage') || keys.includes('liveLocationMessage')) return '📍 Ubicación';
  if (keys.includes('contactMessage') || keys.includes('contactsArrayMessage')) return '👤 Contacto(s)';
  if (keys.includes('reactionMessage')) return '❤️ Reacción';
  if (keys.includes('pollCreationMessage') || keys.includes('pollCreationMessageV3')) return '📊 Encuesta';
  if (keys.includes('interactiveResponseMessage') || keys.includes('buttonsResponseMessage')) return '🔘 Botón';

  return '📦 Multimedia/Otro';
}

module.exports = {
  normalizeJid,
  cleanNumber,
  unwrapMessage,
  getBody,
  getContextInfo,
  detectPrefix,
  getGroupAdmins,
  getReadableType
};
