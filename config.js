'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Lee el .env local creado en Termux sin que git pull lo borre
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const defaultOwners = [
  '51958959882',
  '42696337031354',
  '132482980696170'
];

const envOwners = process.env.OWNERS
  ? process.env.OWNERS.split(',').map(n => n.trim()).filter(Boolean)
  : [];

module.exports = {
  // 👤 PROPIETARIOS DEL BOT
  owner: [...new Set([...defaultOwners, ...envOwners])],

  // 🤖 INFORMACIÓN DEL BOT
  botName: process.env.BOT_NAME || 'SiriusBot Pro',
  botVersion: process.env.BOT_VERSION || '3.0.0',
  footer: process.env.BOT_FOOTER || 'SiriusBot © 2026',

  // ⚙️ CONFIGURACIÓN GENERAL
  prefix: process.env.PREFIX || ['.', '!', '#', '/'],
  mongoUri: process.env.MONGO_URI || '',

  // 🔑 API KEYS (Se leen desde el .env de tu Termux)
  apis: {
    gemini: process.env.GEMINI_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    grok: process.env.GROK_API_KEY || '',
    custom: process.env.CUSTOM_API_KEY || ''
  },

  // 🔌 CONEXIÓN Y VELOCIDAD
  sessionPath: './session',
  readMessages: true,
  autoReconnect: true,
  reconnectDelay: 2500,
  sendDelay: 250,

  // 🛡️ SISTEMAS DE SEGURIDAD Y CONSOLA
  debug: true,
  antiSpam: true,
  maxMessagesPerMinute: 30
};
