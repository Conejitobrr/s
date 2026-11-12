'use strict';

const PRIMARY_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const FALLBACK_MODEL = 'llama-3.3-70b-versatile';

async function callGroq(apiKey, model, prompt) {
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: 400,
      messages: [
        { role: 'system', content: 'Eres un reescritor de textos experto en jergas.' },
        { role: 'user', content: prompt }
      ]
    })
  });
}

module.exports = {
  name: 'acento',
  aliases: ['modo', 'habla', 'traducir'],
  category: 'inteligencia artificial',
  desc: 'Reescribe un mensaje en diferentes acentos o jergas',

  execute: async ({ sock, msg, remoteJid, args, quoted, config, reply }) => {
    try {
      const estilosValidos = ['pituco', 'choro', 'peruano', 'argentino', 'mexicano', 'chileno', 'otaku', 'elegante'];

      if (!args.length) {
        return reply(`❌ Debes elegir un acento y escribir o responder a un mensaje.\n\n📌 *Opciones:* ${estilosValidos.join(', ')}\n\n*Ejemplo:* .acento choro ¿Cómo están todos?`);
      }

      const acento = args[0].toLowerCase();
      if (!estilosValidos.includes(acento)) {
        return reply(`❌ Acento no válido.\n📌 *Elige uno de estos:* ${estilosValidos.join(', ')}`);
      }

      let texto = args.slice(1).join(' ').trim();
      if (!texto && quoted?.text) {
        texto = quoted.text.trim();
      }

      if (!texto) {
        return reply('❌ Debes escribir un texto o responder al mensaje de alguien para traducirlo.');
      }

      const apiKey = process.env.GROQ_API_KEY || config?.apis?.grok || '';
      if (!apiKey) return reply('❌ Falta configurar `GROQ_API_KEY` en tu archivo `.env` de Termux.');

      await sock.sendPresenceUpdate('composing', remoteJid);

      const prompt = `Actúa como un traductor cultural experto. Reescribe el siguiente texto adoptando la personalidad, jerga y modismos de un estilo "${acento}".

REGLAS ESTRICTAS:
1. Mantén el significado original del texto, pero cambia totalmente el vocabulario.
2. Si es "pituco": usa jerga de clase alta limeña (manyas, alucina, bro, pucha, literal).
3. Si es "choro": usa jerga callejera peruana (batería, causa, misio, yara, firme).
4. Si es "peruano": usa jerga peruana estándar (pe, causa, asu, roche, chévere).
5. Si es "argentino": usa acento porteño muy marcado (che, boludo, pibe, re, posta).
6. Si es "mexicano": usa slang chilango (wey, no mames, chido, neta, a huevo).
7. Si es "chileno": usa jerga chilena (po, weon, fome, cachai, bacán).
8. Si es "otaku": usa términos japoneses mezclados (kawaii, senpai, nani, uwu, onii-chan).
9. Si es "elegante": usa español del siglo XIX, extremadamente refinado y poético.
10. DEVUELVE SOLO EL TEXTO TRADUCIDO. Sin comillas, sin explicaciones.

TEXTO ORIGINAL: "${texto}"`;

      let res = await callGroq(apiKey, PRIMARY_MODEL, prompt);
      if (!res.ok && PRIMARY_MODEL !== FALLBACK_MODEL) {
        res = await callGroq(apiKey, FALLBACK_MODEL, prompt);
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Error en Groq');

      const respuesta = data.choices?.[0]?.message?.content?.trim() || 'No pude traducirlo pe.';

      await sock.sendMessage(remoteJid, {
        text: `🗣️ *MODO ${acento.toUpperCase()}*\n\n${respuesta}`
      }, { quoted: msg });

    } catch (err) {
      console.log('❌ Error en Acento:', err.message || err);
      return reply('❌ Ocurrió un error al intentar cambiar el acento.');
    }
  }
};
