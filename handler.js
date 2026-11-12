'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const config = require('./config');
const db = require('./lib/database');
const {
  getBody,
  normalizeJid,
  detectPrefix,
  cleanNumber,
  getReadableType,
  getContextInfo,
  unwrapMessage
} = require('./lib/utils');

const BANNED_PATH = path.join(process.cwd(), 'lib', 'banned.json');
const recentGroupEvents = new Map();

function isDuplicateGroupEvent(groupId, userJid, action) {
  const key = `${groupId}_${cleanNumber(userJid)}_${action}`;
  const now = Date.now();
  const last = recentGroupEvents.get(key) || 0;
  if (now - last < 8000) return true;
  recentGroupEvents.set(key, now);
  return false;
}

function cleanJid(jid = '') {
  return String(jid).split(':')[0];
}

function getTime() {
  return new Date().toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

async function checkBannedUser(sock, remoteJid, sender, msg, isOwner) {
  if (isOwner) return false;
  try {
    const senderPure = cleanJid(sender);
    if (!fs.existsSync(BANNED_PATH)) return false;

    const bannedDB = JSON.parse(fs.readFileSync(BANNED_PATH, 'utf8'));
    const banInfo = bannedDB[senderPure];

    if (banInfo) {
      if (!banInfo.notified) {
        bannedDB[senderPure].notified = true;
        fs.writeFileSync(BANNED_PATH, JSON.stringify(bannedDB, null, 2));

        const pureNumber = cleanNumber(senderPure);
        await sock.sendMessage(remoteJid, {
          text: `⛔ *ACCESO DENEGADO*\n\n@${pureNumber}, estás baneado del bot.\n\n📝 Razón: ${banInfo.reason}\n_Este es el único aviso que recibirás._`,
          mentions: [senderPure]
        }, { quoted: msg });
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const sendQueue = [];
let isSending = false;
const SEND_DELAY = Number(config.sendDelay) || 250;

async function processSendQueue() {
  if (isSending || sendQueue.length === 0) return;
  isSending = true;

  while (sendQueue.length > 0) {
    const task = sendQueue.shift();
    try { await task(); } catch {}
    if (sendQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, SEND_DELAY));
    }
  }
  isSending = false;
}

const PLUGINS_DIR = path.join(process.cwd(), 'plugins');
if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });

const commands = new Map();
const aliases = new Map();
const messageListeners = [];
const groupListeners = [];

async function dispatchGroupUpdate(sock, id, participants, action) {
  if (!id || !Array.isArray(participants) || !participants.length) return;
  const validParticipants = participants.filter(p => {
    const jid = typeof p === 'string' ? p : (p?.id || p?.jid || '');
    return jid && !isDuplicateGroupEvent(id, jid, action);
  });
  if (!validParticipants.length) return;

  for (const listener of groupListeners) {
    try {
      await listener.onGroupUpdate({ sock, conn: sock, id, participants: validParticipants, action, db, config });
    } catch (e) {
      console.log(chalk.red(`❌ Error en onGroupUpdate: ${e?.message || e}`));
    }
  }
}

function attachSendLogger(sock) {
  if (!sock._groupEventsAttached) {
    sock._groupEventsAttached = true;
    sock.ev.on('group-participants.update', async (update) => {
      try {
        if (update?.id && (update.action === 'add' || update.action === 'remove')) {
          await dispatchGroupUpdate(sock, update.id, update.participants || [], update.action);
        }
      } catch {}
    });
  }

  if (sock._loggerAttached) return;
  sock._loggerAttached = true;

  const originalSend = sock.sendMessage.bind(sock);

  sock.sendMessage = async (jid, content = {}, options = {}) => {
    return new Promise((resolve, reject) => {
      sendQueue.push(async () => {
        try {
          if (config.debug) {
            const isGroup = String(jid).endsWith('@g.us');
            let type = '📝 Texto';
            let preview = content.text || '';

            if (content.image) { type = '📸 Imagen'; preview = content.caption || '[Imagen]'; }
            else if (content.video) { type = '🎥 Video'; preview = content.caption || '[Video]'; }
            else if (content.audio) { type = '🎵 Audio'; preview = '[Audio]'; }
            else if (content.sticker) { type = '🧩 Sticker'; preview = '[Sticker]'; }
            else if (content.document) { type = '📄 Documento'; preview = content.fileName || '[Documento]'; }

            const labelType = isGroup ? chalk.magenta('👥 GRUPO') : chalk.blue('👤 PRIVADO');
            const time = getTime();

            console.log(chalk.gray(`╭─── 📤 `) + chalk.cyan.bold(`BOT ENVÍA`) + chalk.cyan(` [${time}]`) + chalk.gray(` ───────────────`));
            console.log(chalk.gray(`│ 🏷️  Destino : `) + labelType + chalk.yellow(` (+${cleanNumber(jid)})`));
            console.log(chalk.gray(`│ 📦  Tipo    : `) + chalk.white(type));
            if (preview) console.log(chalk.gray(`│ 💬  Msg     : `) + chalk.green(String(preview).slice(0, 70).replace(/\n/g, ' ')));
            console.log(chalk.gray(`╰──────────────────────────────────────────\n`));
          }
          const result = await originalSend(jid, content, options);
          resolve(result);
        } catch (err) {
          const time = getTime();
          console.log(chalk.gray(`╭─── ❌ `) + chalk.red.bold(`ERROR ENVÍO`) + chalk.cyan(` [${time}]`) + chalk.gray(` ─────────────`));
          console.log(chalk.gray(`│ ⚠️  Detalle : `) + chalk.red(err?.message || err));
          console.log(chalk.gray(`╰──────────────────────────────────────────\n`));
          reject(err);
        }
      });
      processSendQueue();
    });
  };

  if (!sock.reply) {
    sock.reply = (jid, text, quoted, options = {}) => {
      return sock.sendMessage(jid, { text: String(text), ...options }, { quoted });
    };
  }
}

function loadPlugins() {
  commands.clear();
  aliases.clear();
  messageListeners.length = 0;
  groupListeners.length = 0;

  const files = fs.readdirSync(PLUGINS_DIR).filter(file => file.endsWith('.js'));
  let cmdCount = 0;
  let listenerCount = 0;

  for (const file of files) {
    try {
      const filepath = path.join(PLUGINS_DIR, file);
      delete require.cache[require.resolve(filepath)];
      const rawPlugin = require(filepath);

      const executeFn =
        typeof rawPlugin === 'function'
          ? (ctx) => rawPlugin(ctx.m, ctx)
          : (rawPlugin.execute || rawPlugin.run || rawPlugin.handler);

      const cmdNameRaw = rawPlugin.name || (Array.isArray(rawPlugin.command) ? rawPlugin.command[0] : rawPlugin.command);

      if (cmdNameRaw && typeof executeFn === 'function') {
        const cmdName = String(cmdNameRaw).toLowerCase();
        const normalizedPlugin = typeof rawPlugin === 'function'
          ? { name: cmdName, execute: executeFn }
          : { ...rawPlugin, name: cmdName, execute: executeFn };

        commands.set(cmdName, normalizedPlugin);

        const pluginAliases = [
          ...(Array.isArray(rawPlugin.aliases) ? rawPlugin.aliases : []),
          ...(Array.isArray(rawPlugin.alias) ? rawPlugin.alias : []),
          ...(Array.isArray(rawPlugin.command) ? rawPlugin.command.slice(1) : [])
        ];

        for (const alias of pluginAliases) {
          if (typeof alias === 'string') aliases.set(alias.toLowerCase(), cmdName);
        }
        cmdCount++;
      }

      if (typeof rawPlugin.onMessage === 'function') {
        messageListeners.push(rawPlugin);
        listenerCount++;
      } else if (typeof rawPlugin.before === 'function') {
        messageListeners.push({ onMessage: (ctx) => rawPlugin.before(ctx.m, ctx) });
        listenerCount++;
      }

      if (typeof rawPlugin.onGroupUpdate === 'function') {
        groupListeners.push(rawPlugin);
      }
    } catch (err) {
      console.log(chalk.bgRed.white(' ❌ ERROR PLUGIN '), chalk.red(`Fallo en ${file}: ${err?.message}`));
    }
  }
  console.log(chalk.bgGreen.black('\n ♻️ PLUGINS LISTOS '), chalk.green(`${cmdCount} comandos y ${listenerCount} detectores activos.\n`));
}

loadPlugins();

async function messageHandler(sock, msg, store = {}) {
  try {
    attachSendLogger(sock);

    if (msg?.messageStubType && msg?.key?.remoteJid?.endsWith('@g.us')) {
      const stub = msg.messageStubType;
      const params = Array.isArray(msg.messageStubParameters) ? msg.messageStubParameters : [];
      if (stub === 27 || stub === 31) {
        await dispatchGroupUpdate(sock, msg.key.remoteJid, params, 'add');
      } else if (stub === 28 || stub === 32) {
        await dispatchGroupUpdate(sock, msg.key.remoteJid, params, 'remove');
      }
    }

    if (!msg?.message) return;

    const key = msg.key || {};
    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    const fromGroup = remoteJid.endsWith('@g.us');
    let sender = fromGroup ? (key.participant || msg.participant) : remoteJid;
    sender = normalizeJid(sender || remoteJid);

    const botJid = normalizeJid(sock.user?.id || '');
    const body = getBody(msg);
    const pushName = msg.pushName || store.contacts?.[sender]?.name || 'Usuario';
    const senderNumber = cleanNumber(sender);

    const ownerNumbers = Array.isArray(config.owner) ? config.owner.map(n => String(n).replace(/\D/g, '')) : [];
    const isOwner = !!key.fromMe || ownerNumbers.includes(senderNumber);

    let groupName = 'Privado';
    let chatLabel = chalk.blue('👤 PRIVADO');
    let isAdmin = false;
    let isBotAdmin = false;
    let participants = [];

    if (fromGroup) {
      chatLabel = chalk.magenta('👥 GRUPO');
      try {
        const metadata = sock.getCachedGroupMetadata
          ? await sock.getCachedGroupMetadata(remoteJid)
          : await sock.groupMetadata(remoteJid);

        if (metadata) {
          groupName = metadata.subject || 'Grupo';
          participants = metadata.participants || [];
          const admins = participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => normalizeJid(p.id));
          isAdmin = admins.includes(sender);
          isBotAdmin = admins.includes(botJid);
        }
      } catch {
        groupName = 'Grupo';
      }
    }

    // Impresión inmediata en consola para que ningún mensaje se pierda jamás
    if (config.debug) {
      const msgType = getReadableType(msg);
      const adminStatus = isAdmin ? chalk.green('Sí') : chalk.red('No');
      const ownerStatus = isOwner ? chalk.green('Sí') : chalk.red('No');
      const time = getTime();

      console.log(chalk.gray(`╭─── 📥 `) + chalk.green.bold(`MENSAJE ENTRANTE`) + chalk.cyan(` [${time}]`) + chalk.gray(` ──────────`));
      console.log(chalk.gray(`│ 🏷️  Chat    : `) + chatLabel + (fromGroup ? chalk.white(` ${groupName}`) : ''));
      console.log(chalk.gray(`│ 👤  De      : `) + chalk.white(pushName) + chalk.yellow(` (+${senderNumber})`));
      console.log(chalk.gray(`│ 🛡️  Admin   : `) + adminStatus + chalk.gray(` | 👑 Owner: `) + ownerStatus);
      console.log(chalk.gray(`│ 📦  Tipo    : `) + chalk.white(msgType));
      console.log(chalk.gray(`│ 💬  Texto   : `) + chalk.white(String(body || '[Multimedia/Sticker]').slice(0, 100).replace(/\n/g, ' ')));
      console.log(chalk.gray(`╰──────────────────────────────────────────`));
    }

    if (await checkBannedUser(sock, remoteJid, sender, msg, isOwner)) return;

    const contextInfo = getContextInfo(msg) || {};
    const mentionedJid = (contextInfo.mentionedJid || []).map(jid => normalizeJid(jid));
    const quotedSender = contextInfo.participant ? normalizeJid(contextInfo.participant) : null;

    if (contextInfo && (mentionedJid.length || quotedSender)) {
      msg.message.extendedTextMessage = msg.message.extendedTextMessage || {};
      msg.message.extendedTextMessage.contextInfo = {
        ...(msg.message.extendedTextMessage.contextInfo || {}),
        participant: contextInfo.participant || quotedSender,
        mentionedJid: contextInfo.mentionedJid || mentionedJid
      };
    }

    msg.chat = remoteJid;
    msg.sender = sender;
    msg.text = body;
    msg.isGroup = fromGroup;
    msg.mentionedJid = mentionedJid;
    msg.quoted = contextInfo.quotedMessage ? {
      key: {
        remoteJid,
        fromMe: quotedSender === botJid,
        id: contextInfo.stanzaId,
        participant: quotedSender
      },
      message: unwrapMessage(contextInfo.quotedMessage),
      sender: quotedSender,
      text: getBody({ message: contextInfo.quotedMessage })
    } : null;

    const replyFn = (text, options = {}) => sock.sendMessage(remoteJid, { text: String(text), ...options }, { quoted: msg });
    msg.reply = replyFn;

    const [groupData, userData] = await Promise.all([
      fromGroup ? db.getGroup(remoteJid) : Promise.resolve(null),
      db.getUser(sender)
    ]);

    try {
      const sorteoPlugin = commands.get('sorteo');
      if (sorteoPlugin && typeof sorteoPlugin.autoCheck === 'function') {
        await sorteoPlugin.autoCheck(sock, db);
      }
    } catch {}

    const baseCtx = {
      sock, conn: sock,
      msg, m: msg,
      remoteJid, chat: remoteJid,
      sender, botJid, pushName, body, text: body,
      config, db, store,
      fromGroup, isGroup: fromGroup,
      isOwner, isAdmin, isBotAdmin,
      participants, groupData, userData,
      mentionedJid, quoted: msg.quoted,
      reply: replyFn
    };

    if (!fromGroup || (groupData && groupData.bot !== false) || isOwner) {
      await Promise.allSettled(
        messageListeners.map(listener => listener.onMessage(baseCtx))
      );
    }

    if (!body) return;

    const parsed = detectPrefix(body, config.prefix);
    if (!parsed) return;

    const args = parsed.body.trim().split(/\s+/).filter(Boolean);
    const rawCommand = args.shift()?.toLowerCase();
    if (!rawCommand) return;

    const cmdKey = aliases.has(rawCommand) ? aliases.get(rawCommand) : rawCommand;
    const plugin = commands.get(cmdKey);

    if (!plugin) return;

    if (userData && !isOwner) {
      const jailTimeLeft = Number(userData.jailUntil || 0) - Date.now();
      if (jailTimeLeft > 0) {
        const permitidos = ['carcel', 'fianza', 'sobornar', 'usar', 'perfil', 'inventario', 'estado'];
        if (!permitidos.includes(rawCommand)) {
          const min = Math.floor(jailTimeLeft / 60000);
          const sec = Math.floor((jailTimeLeft % 60000) / 1000);
          return replyFn(`🚨 *ESTÁS ARRESTADO*\n\nNo puedes usar comandos desde la cárcel.\n\n⏳ Condena restante: *${min}m ${sec}s*\n📌 Opciones permitidas: *.usar llave* | *.fianza pagar* | *.sobornar pagar*`);
        }
      }
    }

    if (fromGroup && groupData && groupData.bot === false && !isOwner && !['config'].includes(cmdKey)) return;

    if (config.debug) {
      const time = getTime();
      console.log(chalk.gray(`╭─── ⚡ `) + chalk.yellow.bold(`EJECUTANDO COMANDO`) + chalk.cyan(` [${time}]`) + chalk.gray(` ────────`));
      console.log(chalk.gray(`│ 🚀  Cmd     : `) + chalk.yellow(`${parsed.prefix}${rawCommand}`));
      console.log(chalk.gray(`│ 👤  Por     : `) + chalk.white(pushName));
      console.log(chalk.gray(`╰──────────────────────────────────────────`));
    }

    try {
      await plugin.execute({
        ...baseCtx,
        args,
        text: args.join(' '),
        usedPrefix: parsed.prefix,
        commandName: rawCommand,
        command: rawCommand
      });

      if (!isOwner) await db.addXP(sender, Math.floor(Math.random() * 10) + 5);

      if (config.debug) {
        const time = getTime();
        console.log(chalk.gray(`╭─── ✅ `) + chalk.green.bold(`ÉXITO`) + chalk.cyan(` [${time}]`) + chalk.gray(` ─────────────────────`));
        console.log(chalk.gray(`│ ⚙️  Comando completado sin errores.`));
        console.log(chalk.gray(`╰──────────────────────────────────────────\n`));
      }
    } catch (e) {
      console.log(chalk.red(`❌ Error en comando ${rawCommand}: ${e?.message || e}`));
      await replyFn('❌ Ocurrió un error interno al ejecutar este comando.');
    }
  } catch (err) {
    console.log(chalk.red(`❌ Error crítico en handler: ${err?.message || err}`));
  }
}

module.exports = { messageHandler, loadPlugins, commands, aliases };
