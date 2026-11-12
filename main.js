'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const pino = require('pino');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const db = require('./lib/database');
const { getBody, unwrapMessage } = require('./lib/utils');

const SESSION_DIR = path.resolve(config.sessionPath);
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const logger = pino({ level: 'silent' });

const store = {
  contacts: {},
  messages: new Map(),
  groupMetadata: new Map()
};

const retryMap = new Map();
const msgRetryCounterCache = {
  get: (key) => retryMap.get(key),
  set: (key, val) => {
    retryMap.set(key, val);
    setTimeout(() => retryMap.delete(key), 60000);
  },
  del: (key) => retryMap.delete(key),
  flushAll: () => retryMap.clear()
};

const processedMessages = new Map();
let restarting = false;
let dbInitialized = false;

function extractNumber(jid = '') {
  if (!jid) return '';
  try { jid = jidNormalizedUser(jid); } catch {}
  let number = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
  return number.length > 15 ? number.slice(0, 15) : `+${number}`;
}

async function getCachedGroupMetadata(sock, jid) {
  const cached = store.groupMetadata.get(jid);
  if (cached && (Date.now() - cached._fetchedAt < 180000)) {
    return cached;
  }
  try {
    const metadata = await sock.groupMetadata(jid);
    if (metadata) {
      metadata._fetchedAt = Date.now();
      store.groupMetadata.set(jid, metadata);
    }
    return metadata;
  } catch {
    return cached || null;
  }
}

async function startBot(opts = {}) {
  if (!dbInitialized) {
    await db.init();
    dbInitialized = true;
  }

  const { messageHandler } = require('./handler');
  const useCode = opts.method === 'code';
  const phoneNum = opts.phone || null;

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    browser: useCode ? ['Ubuntu', 'Chrome', '20.0.04'] : [config.botName, 'Safari', config.botVersion],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    msgRetryCounterCache,
    printQRInTerminal: false,
    emitOwnEvents: true,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    cachedGroupMetadata: async (jid) => store.groupMetadata.get(jid),
    getMessage: async (key) => {
      const saved = store.messages.get(key?.id);
      return saved?.message || undefined;
    }
  });

  sock.store = store; // 👈 Vital para que .ver rescate mensajes del store global
  sock.getCachedGroupMetadata = (jid) => getCachedGroupMetadata(sock, jid);

  if (useCode && phoneNum && !state.creds?.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNum);
        console.log(chalk.cyan('\n🔑 Código de vinculación:'));
        console.log(chalk.bgCyan.black.bold(`   ${code}   \n`));
      } catch (e) {
        console.log(chalk.red('❌ Error generando código. Verifica el número.'));
      }
    }, 3000);
  }

  sock.ev.on('connection.update', update => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && !useCode) {
      console.log(chalk.yellow('\n📷 Escanea el código QR con tu WhatsApp:\n'));
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      restarting = false;
      console.log(chalk.green('\n✅ BOT CONECTADO EXITOSAMENTE'));
      console.log(chalk.green('📱 Número:'), extractNumber(sock.user?.id || ''));
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : 0;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      if (shouldReconnect && config.autoReconnect) {
        if (restarting) return;
        restarting = true;
        console.log(chalk.yellow(`⚠️ Reconectando en ${config.reconnectDelay / 1000}s...`));
        setTimeout(() => startBot({ method: 'saved' }), config.reconnectDelay);
      } else {
        console.log(chalk.red('❌ Sesión cerrada permanentemente. Borra ./session y vuelve a vincular.'));
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('groups.update', updates => {
    for (const u of updates || []) {
      if (u.id && store.groupMetadata.has(u.id)) {
        const current = store.groupMetadata.get(u.id);
        store.groupMetadata.set(u.id, { ...current, ...u, _fetchedAt: Date.now() });
      }
    }
  });

  sock.ev.on('group-participants.update', ({ id }) => {
    if (id) store.groupMetadata.delete(id);
  });

  sock.ev.on('contacts.upsert', contacts => {
    for (const c of contacts || []) {
      if (!c.id) continue;
      const jid = jidNormalizedUser(c.id);
      store.contacts[jid] = { id: jid, name: c.name || c.notify || '', number: extractNumber(jid) };
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;

    const nowSec = Math.floor(Date.now() / 1000);
    const validBatch = [];

    for (const msg of messages || []) {
      const msgId = msg?.key?.id;
      const remoteJid = msg?.key?.remoteJid;
      if (!msgId || !remoteJid || remoteJid === 'status@broadcast') continue;

      // 🔥 Guardamos TODO mensaje entrante en la memoria global al instante (antes de filtros)
      store.messages.set(msgId, msg);
      setTimeout(() => store.messages.delete(msgId), 300000); // 5 minutos de retención

      if (type === 'append') {
        const msgTime = Number(msg.messageTimestamp || 0);
        if (msgTime && (nowSec - msgTime > 45)) continue;
      }

      if (msg.messageStubType) {
        const stubKey = `stub_${msgId}`;
        if (!processedMessages.has(stubKey)) {
          processedMessages.set(stubKey, Date.now());
          setTimeout(() => processedMessages.delete(stubKey), 60000);
          validBatch.push(msg);
        }
        continue;
      }

      const unwrapped = unwrapMessage(msg.message);

      // Detectar si es un mensaje de "Ver una sola vez" para dejarlo pasar sin restricciones
      const isViewOnce = !!(
        unwrapped.viewOnceMessage ||
        unwrapped.viewOnceMessageV2 ||
        unwrapped.viewOnceMessageV2Extension ||
        unwrapped.imageMessage?.viewOnce ||
        unwrapped.videoMessage?.viewOnce ||
        unwrapped.audioMessage?.viewOnce
      );

      if (!isViewOnce && (!msg.message || !unwrapped || Object.keys(unwrapped).length === 0)) {
        continue;
      }

      const proto = unwrapped.protocolMessage || msg.message?.protocolMessage;
      const isDeleteEvent = proto && (proto.type === 0 || proto.type === 'REVOKE' || !!proto.key?.id);
      if (proto && !proto.editedMessage && !isDeleteEvent) {
        continue;
      }

      if (!isViewOnce && processedMessages.has(msgId)) continue;
      processedMessages.set(msgId, Date.now());
      setTimeout(() => processedMessages.delete(msgId), 90000);

      msg.bodyText = getBody(msg);
      validBatch.push(msg);
    }

    if (!validBatch.length) return;

    if (config.readMessages) {
      const keysToRead = validBatch
        .filter(m => m.key && !m.key.fromMe && m.message && !m.message.protocolMessage)
        .map(m => m.key);
      if (keysToRead.length > 0) {
        sock.readMessages(keysToRead).catch(() => {});
      }
    }

    await Promise.allSettled(
      validBatch.map(msg => messageHandler(sock, msg, store))
    );
  });

  return sock;
}

module.exports = { startBot, store };
