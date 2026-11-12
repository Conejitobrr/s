'use strict';

require('dotenv').config();

// ==========================================
// 🔇 FILTRO RÁPIDO DE LOGS BASURA (BAILEYS/SIGNAL)
// ==========================================
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const BLOCKED_REGEX = /Closing session|SessionEntry|_chains|chainKey|ephemeralKeyPair|registrationId|currentRatchet|pendingPreKey|messageKeys|remoteIdentityKey|Bad MAC|Failed to decrypt/i;

function shouldHideConsole(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg === 'string' && BLOCKED_REGEX.test(arg)) return true;
    if (arg && typeof arg === 'object') {
      if (arg._chains || arg.currentRatchet || arg.pendingPreKey || arg.remoteIdentityKey) return true;
      if (arg.message && BLOCKED_REGEX.test(arg.message)) return true;
    }
  }
  return false;
}

console.log = (...args) => {
  if (!shouldHideConsole(args)) originalConsoleLog(...args);
};
console.error = (...args) => {
  if (!shouldHideConsole(args)) originalConsoleError(...args);
};
console.warn = (...args) => {
  if (!shouldHideConsole(args)) originalConsoleWarn(...args);
};

const chalk = require('chalk');
const figlet = require('figlet');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// ==========================================
// 🛠️ AUTO-INICIALIZADOR DE INSTANCIAS DESDE CERO
// ==========================================
function ensureBotInstances() {
  const dirs = [
    'lib',
    'plugins',
    'session',
    path.join('assets', 'data'),
    'media'
  ];

  for (const dir of dirs) {
    const fullDir = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }
  }

  const defaultJsonFiles = {
    'lib/banned.json': {},
    'lib/warns.json': {},
    'lib/inventario.json': {},
    'lib/database.json': { users: {}, groups: {} },
    'assets/data/preguntas_trivia.json': [
      { "q": "¿Cuál es la capital del Perú?", "a": ["lima"] },
      { "q": "¿Cuántos planetas tiene el sistema solar?", "a": ["8", "ocho"] },
      { "q": "¿Qué gas respiramos para vivir?", "a": ["oxigeno"] },
      { "q": "¿Cuál es el océano más grande del mundo?", "a": ["pacifico", "oceano pacifico"] },
      { "q": "¿En qué continente queda Egipto?", "a": ["africa"] }
    ]
  };

  for (const [relativePath, defaultData] of Object.entries(defaultJsonFiles)) {
    const filePath = path.resolve(process.cwd(), relativePath);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf8');
    }
  }
}

function showBanner() {
  console.clear();
  const botName = config.botName;
  const lines = figlet.textSync(botName, { font: 'Big' }).split('\n');
  lines.forEach(line => console.log(chalk.cyan.bold(line)));

  const prefixes = Array.isArray(config.prefix) ? config.prefix.join(' ') : config.prefix;
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log(chalk.white('  🤖 Bot     : ') + chalk.green(botName));
  console.log(chalk.white('  📦 Versión : ') + chalk.yellow(config.botVersion));
  console.log(chalk.white('  ⚙️ Prefijo : ') + chalk.yellow(prefixes));
  console.log(chalk.gray('  ─────────────────────────────────────────\n'));
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function hasSavedSession() {
  const sessionDir = path.resolve(process.cwd(), config.sessionPath);
  const credsFile = path.join(sessionDir, 'creds.json');
  return fs.existsSync(credsFile);
}

async function askConnectionMethod() {
  if (hasSavedSession()) {
    console.log(chalk.green('✅ Sesión encontrada. Conectando automáticamente...\n'));
    return { method: 'saved', phone: null };
  }

  console.log(chalk.cyan('¿Cómo deseas conectar WhatsApp?\n'));
  console.log(chalk.white('[1] Código QR'));
  console.log(chalk.white('[2] Código de 8 dígitos (Pairing Code)\n'));

  let choice = '';
  while (!['1', '2'].includes(choice)) {
    choice = (await ask(chalk.yellow('→ Opción (1 o 2): '))).trim();
  }

  if (choice === '1') {
    return { method: 'qr', phone: null };
  }

  const defaultPhone = process.env.DEFAULT_PHONE || '';
  if (defaultPhone) {
    console.log(chalk.gray('\nNúmero por defecto detectado: ' + defaultPhone));
  }

  let phone = await ask(chalk.yellow('→ Ingresa el número con código de país (o ENTER para usar el por defecto): '));
  phone = phone.trim() ? phone.replace(/\D/g, '') : defaultPhone.replace(/\D/g, '');

  if (!phone) {
    console.log(chalk.red('\n❌ No ingresaste ningún número. Saliendo...'));
    process.exit(1);
  }

  return { method: 'code', phone };
}

async function main() {
  ensureBotInstances();
  showBanner();

  try {
    const { method, phone } = await askConnectionMethod();
    rl.close();

    console.log(chalk.cyan('\n🚀 Iniciando motor de alta velocidad con WhatsApp...'));

    const { startBot } = require('./main');
    await startBot({ method, phone });
  } catch (error) {
    console.error(chalk.red('❌ Error fatal al iniciar:'), error);
    process.exit(1);
  }
}

process.on('uncaughtException', err => {
  console.error(chalk.red('⚠️ Excepción capturada (el bot sigue activo):'), err?.message || err);
});

process.on('unhandledRejection', err => {
  console.error(chalk.red('⚠️ Promesa rechazada (el bot sigue activo):'), err?.message || err);
});

main();
