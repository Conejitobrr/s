'use strict';

const { exec } = require('child_process');
const path = require('path');

module.exports = {
  name: 'update',
  aliases: ['actualizar', 'pull'],
  category: 'owner',
  desc: 'Descarga los últimos cambios de GitHub y recarga comandos sin apagar el bot',

  execute: async ({ isOwner, reply }) => {
    if (!isOwner) return reply('❌ Comando exclusivo del dueño.');

    await reply('🔄 Sincronizando con GitHub...');

    exec('git pull origin main', async (error, stdout) => {
      if (error) {
        return reply(`❌ *Error al actualizar:*\n\n${error.message}`);
      }

      const output = String(stdout || '').trim();
      const isUpToDate = output.includes('Already up to date.') || output.includes('Ya está actualizado.');

      try {
        const configPath = path.resolve(process.cwd(), 'config.js');
        delete require.cache[require.resolve(configPath)];
        require('dotenv').config({ override: true });

        const { loadPlugins } = require('../handler');
        loadPlugins();

        if (isUpToDate) {
          return reply('✅ *El repositorio ya estaba en la última versión.*\n♻️ _Plugins y variables .env recargados en memoria._');
        }

        return reply(`✅ *Actualización descargada:*\n\n\`\`\`${output}\`\`\`\n\n♻️ *Comandos recargados en caliente.*`);
      } catch (e) {
        return reply(`⚠️ Error al recargar plugins en caliente: ${e.message}`);
      }
    });
  }
};
