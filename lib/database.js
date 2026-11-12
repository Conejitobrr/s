'use strict';

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const chalk = require('chalk');

const LOCAL_DB_PATH = path.join(process.cwd(), 'lib', 'database.json');
const localMemory = { users: {}, groups: {} };
let useMongo = false;
let saveTimer = null;

function loadLocalDisk() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
      if (raw.users) localMemory.users = raw.users;
      if (raw.groups) localMemory.groups = raw.groups;
    }
  } catch {}
}

function scheduleLocalSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const cleanUsers = {};
      for (const [k, v] of Object.entries(localMemory.users)) {
        const { save, ...rest } = v;
        cleanUsers[k] = rest;
      }
      const cleanGroups = {};
      for (const [k, v] of Object.entries(localMemory.groups)) {
        const { save, ...rest } = v;
        cleanGroups[k] = rest;
      }
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify({ users: cleanUsers, groups: cleanGroups }, null, 2));
    } catch {}
  }, 1500);
}

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  banned: { type: Boolean, default: false },
  bot: { type: Boolean, default: true },
  audios: { type: Boolean, default: true },
  premium: { type: Boolean, default: false },
  premiumUntil: { type: Number, default: 0 },
  jailUntil: { type: Number, default: 0 },
  fame: { type: Number, default: 0 },
  partner: { type: String, default: '' },
  inventory: {
    keys: { type: Number, default: 0 },
    spotifyUses: { type: Number, default: 0 }
  }
}, { minimize: false });

const groupSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  welcome: { type: Boolean, default: false },
  bot: { type: Boolean, default: true },
  audios: { type: Boolean, default: true },
  antilink: { type: Boolean, default: false },
  antispam: { type: Boolean, default: false }
}, { minimize: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);

function attachSaveMethod(obj) {
  if (obj && typeof obj.save !== 'function') {
    Object.defineProperty(obj, 'save', {
      value: async function () {
        scheduleLocalSave();
        return this;
      },
      enumerable: false,
      writable: true
    });
  }
  return obj;
}

async function init() {
  loadLocalDisk();

  if (!config.mongoUri) {
    console.log(chalk.bgCyan.black('\n 💾 BASE DE DATOS LOCAL ACTIVA '));
    console.log(chalk.cyan(' ℹ️ Guardando datos permanentemente en lib/database.json\n'));
    return;
  }

  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    useMongo = true;
    console.log(chalk.bgGreen.black('\n 📁 MONGODB CONECTADO '));
    console.log(chalk.green(' ✅ Base de datos sincronizada en la nube.\n'));
  } catch (e) {
    useMongo = false;
    console.log(chalk.bgRed.white('\n ❌ ERROR MONGODB '), chalk.red(e.message));
    console.log(chalk.yellow(' 🔄 Usando respaldo automático en disco local (lib/database.json).\n'));
  }
}

async function getUser(id) {
  if (!useMongo) {
    if (!localMemory.users[id]) {
      localMemory.users[id] = {
        id, xp: 0, level: 1, banned: false, bot: true, audios: true,
        premium: false, premiumUntil: 0, jailUntil: 0, fame: 0, partner: '',
        inventory: { keys: 0, spotifyUses: 0 }
      };
      scheduleLocalSave();
    }
    return attachSaveMethod(localMemory.users[id]);
  }

  let user = await User.findOne({ id });
  if (!user) user = await User.create({ id });
  return user;
}

async function getGroup(id) {
  if (!useMongo) {
    if (!localMemory.groups[id]) {
      localMemory.groups[id] = {
        id, bot: true, welcome: false, audios: true, antilink: false, antispam: false
      };
      scheduleLocalSave();
    }
    return attachSaveMethod(localMemory.groups[id]);
  }

  let group = await Group.findOne({ id });
  if (!group) group = await Group.create({ id });
  return group;
}

async function setGroup(id, data = {}) {
  if (!useMongo) {
    localMemory.groups[id] = attachSaveMethod({ ...(localMemory.groups[id] || {}), ...data, id });
    scheduleLocalSave();
    return localMemory.groups[id];
  }
  return await Group.findOneAndUpdate({ id }, data, { upsert: true, new: true });
}

async function addXP(id, amount) {
  const user = await getUser(id);
  user.xp = Math.max(0, (user.xp || 0) + amount);
  user.level = Math.floor(user.xp / 10000) + 1;
  await user.save();
  return user;
}

async function transferXP(senderId, targetId, amount) {
  const s = await getUser(senderId);
  const t = await getUser(targetId);
  await s.save();
  await t.save();
}

async function isBanned(id) {
  const user = await getUser(id);
  return user.banned === true;
}

module.exports = { init, getUser, getGroup, setGroup, addXP, transferXP, isBanned, User, Group };
