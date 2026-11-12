'use strict';

const PRIMARY_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const FALLBACK_MODEL = 'llama-3.3-70b-versatile';

const memoryCache = new Map();
const MAX_HISTORY = 10;

function getMemory(chatId) {
  if (!memoryCache.has(chatId)) memoryCache.set(chatId, []);
  return memoryCache.get(chatId);
}

function saveToMemory(chatId, role, content) {
  const history = getMemory(chatId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY * 2) {
    history.splice(0, 2);
  }
}

async function requestGroqCompletion(apiKey, model, messages) {
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: 500,
      messages
    })
  });
}

async function askGroq(text, senderName, chatHistory, config) {
  const apiKey = process.env.GROQ_API_KEY || config?.apis?.grok || '';
  if (!apiKey) return '❌ *ERROR:* Falta configurar `GROQ_API_KEY` en tu archivo `.env` de Termux.';

  const systemPrompt = `Eres SiriusBot, un bot de WhatsApp peruano creado por Jose Velazco.
Tu personalidad es divertida, natural, algo troll, sarcástica y muy sociable.
Hablas con jerga peruana moderna (pe, causa, mano, firme, etc.) pero sin exagerar para que se sienta natural.
Usas emojis naturalmente 😹😎🔥.
REGLAS ESTRICTAS:
- NUNCA hables de forma formal o robótica.
- NUNCA digas que eres una IA, un modelo de lenguaje o un asistente virtual. Eres SiriusBot.
- Responde como si fueras un amigo más del grupo de WhatsApp.
- Si te preguntan algo serio o te piden información/resúmenes, responde de forma útil y clara, pero mantén tu toque relajado.
- Haz respuestas cortas y directas, a menos que te pidan explicaciones largas.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: `${senderName} dice: ${text}` }
  ];

  try {
    let response = await requestGroqCompletion(apiKey, PRIMARY_MODEL, messages);
    if (!response.ok && PRIMARY_MODEL !== FALLBACK_MODEL) {
      response = await requestGroqCompletion(apiKey, FALLBACK_MODEL, messages);
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Error en Groq');

    return data.choices[0].message.content.trim();
  } catch (err) {
    console.log('❌ Error en IA:', err.message);
    return 'Tmr mi cerebro de silicio se acaba de saturar 😹, pregúntame de nuevo en un toque.';
  }
}

module.exports = {
  name: 'ai',
  aliases: ['bot', 'ia', 'sirius', 'chatgpt', 'chatbot'],
  category: 'inteligencia artificial',
  desc: 'Habla con la IA de SiriusBot (Conversación fluida)',

  execute: async ({ sock, msg, remoteJid, args, commandName, pushName, quoted, fromGroup, isAdmin, isOwner, db, config, reply }) => {
    try {
      // Modo activar/desactivar chatbot automático en el grupo (.chatbot on / off)
      if (commandName === 'chatbot') {
        if (!fromGroup) return reply('❌ El modo chatbot de grupo solo se configura en grupos.');
        if (!isAdmin && !isOwner) return reply('❌ Solo los administradores pueden activar o desactivar el modo chatbot.');
        const opt = (args[0] || '').toLowerCase();
        if (!['on', 'off'].includes(opt)) {
          return reply('🤖 *MODO CHATBOT*\n\nUsa:\n*.chatbot on* (Responde a todo)\n*.chatbot off* (Solo con .ai o mención)');
        }
        const state = opt === 'on';
        await db.setGroup(remoteJid, { chatbot: state });
        return reply(state ? '✅ *Chatbot activado:* Ahora hablaré libremente en el grupo.' : '🔇 *Chatbot desactivado:* Solo responderé cuando me mencionen o usen *.ai*.');
      }

      const text = args.join(' ').trim();
      const quotedText = quoted?.text || '';

      if (!text && !quotedText) {
        return reply('🤖 Habla causa 😹\n\n📌 *Ejemplos:*\n.ai hola\n.ai (respondiendo a un mensaje) resúmeme esto');
      }

      let promptFinal = text;
      if (quotedText) {
        promptFinal = text
          ? `[El usuario citó este mensaje: "${quotedText}"]\n\nResponde a esto: ${text}`
          : `[El usuario citó este mensaje: "${quotedText}"]\n\n¿Qué opinas o qué me dices de esto?`;
      }

      await sock.sendPresenceUpdate('composing', remoteJid);

      const senderName = pushName || 'Usuario';
      const history = getMemory(remoteJid);

      const aiReply = await askGroq(promptFinal, senderName, history, config);

      saveToMemory(remoteJid, 'user', `${senderName} dice: ${promptFinal}`);
      saveToMemory(remoteJid, 'assistant', aiReply);

      await sock.sendMessage(remoteJid, { text: aiReply }, { quoted: msg });

    } catch (err) {
      console.log('❌ Error en comando IA:', err);
      return reply('❌ Ocurrió un error al procesar tu mensaje.');
    }
  },

  onMessage: async ({ sock, remoteJid, body, msg, botJid, pushName, quoted, mentionedJid, groupData, userData, config }) => {
    if (!body || msg.key?.fromMe) return;
    if (body.trim().startsWith('.')) return;

    const history = getMemory(remoteJid);
    const quotedText = quoted?.text || '';

    let isReplyToBotHistory = false;
    if (quotedText) {
      const cleanQuoted = quotedText.trim().toLowerCase();
      isReplyToBotHistory = history.some(
        h => h.role === 'assistant' && h.content.toLowerCase().trim() === cleanQuoted
      );
    }

    const botNum = String(botJid || '').split('@')[0].split(':')[0];
    const isReplyToBotId = botNum && quoted?.sender ? quoted.sender.includes(botNum) : false;
    const isMentioned = botNum && Array.isArray(mentionedJid) ? mentionedJid.some(j => j.includes(botNum)) : false;
    const isChatbotEnabled = (groupData && groupData.chatbot === true) || (userData && userData.chatbot === true);

    if (isReplyToBotHistory || isReplyToBotId || isMentioned || isChatbotEnabled) {
      let cleanText = body;
      if (botNum) cleanText = cleanText.replace(new RegExp(`@${botNum}`, 'g'), '');
      cleanText = cleanText.trim() || 'Hola';

      await sock.sendPresenceUpdate('composing', remoteJid);

      const senderName = pushName || 'Usuario';
      const aiReply = await askGroq(cleanText, senderName, history, config);

      saveToMemory(remoteJid, 'user', `${senderName} dice: ${cleanText}`);
      saveToMemory(remoteJid, 'assistant', aiReply);

      await sock.sendMessage(remoteJid, { text: aiReply }, { quoted: msg });
    }
  }
};
