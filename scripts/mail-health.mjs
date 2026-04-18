#!/usr/bin/env node
// Watchdog: checks crm-api + crm-workers + does an end-to-end IMAP probe
// via sync-once. Alerts to the CRM Telegram group when things break and
// auto-restarts crm-workers if half or more mailboxes fail to connect.
// 30-minute cooldown per issue; recovery is announced once.
//
// Wired to a 5-minute systemd timer (mail-health.timer).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { dirname } from 'node:path';

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID || '-5201397706';
const STATE_FILE = '/var/lib/crm/mail-health.state.json';
const SYNC_ONCE = '/opt/crm.eg.je/apps/api/dist/cli/sync-once.js';
const COOLDOWN_MS = 30 * 60 * 1000;
const SYNC_TIMEOUT_MS = 120_000;

mkdirSync(dirname(STATE_FILE), { recursive: true });
function loadState() { try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } }
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

async function tg(text) {
  if (!BOT) { console.log('[no bot]', text); return; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text }),
    });
    if (!r.ok) console.error('tg send failed:', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error('tg err:', e.message); }
}

function svcActive(svc) {
  try { execSync(`systemctl is-active --quiet ${svc}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function svcRestart(svc) {
  execSync(`systemctl restart ${svc}`, { stdio: 'ignore' });
}

function runSyncOnce() {
  return new Promise((resolve) => {
    const p = spawn('/usr/bin/node', [SYNC_ONCE], {
      env: process.env,
      cwd: '/opt/crm.eg.je/apps/api',
    });
    let out = ''; let err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());

    const timer = setTimeout(() => {
      try { p.kill('SIGKILL'); } catch {}
      resolve({ timedOut: true, out, err, code: -1 });
    }, SYNC_TIMEOUT_MS);

    p.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ timedOut: false, out, err, code: code ?? -1 });
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ timedOut: false, out, err: err + '\nspawn err: ' + e.message, code: -1 });
    });
  });
}

// Parse sync-once output like:
//   "  email@x.ru: +3"
//   "  email@x.ru: ERROR Invalid credentials"
function parseSync(out) {
  const ok = [];
  const failed = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s+([^\s:]+@\S+):\s+(\+\d+|ERROR.*)$/);
    if (!m) continue;
    if (m[2].startsWith('ERROR')) failed.push({ email: m[1], msg: m[2].replace(/^ERROR\s*/, '') });
    else ok.push({ email: m[1], pulled: parseInt(m[2].slice(1), 10) });
  }
  return { ok, failed };
}

async function run() {
  const state = loadState();
  const now = Date.now();
  const issues = [];

  for (const svc of ['crm-api', 'crm-workers']) {
    if (!svcActive(svc)) {
      issues.push({
        key: `svc:${svc}`,
        msg: `🚨 ${svc} остановлен. Перезапускаю…`,
        auto: () => { try { svcRestart(svc); return `✅ ${svc} снова в строю.`; } catch (e) { return `❌ Не смог перезапустить ${svc}: ${e.message}`; } },
      });
    }
  }

  // End-to-end IMAP probe. If the workers are fine, sync-once finds 0 new msgs
  // (workers already pulled them). If IMAP is unreachable or creds are bad, we get ERRORs.
  const probe = await runSyncOnce();

  if (probe.timedOut) {
    issues.push({
      key: 'probe:timeout',
      msg: `🚨 IMAP-проба зависла более ${SYNC_TIMEOUT_MS/1000}с. Перезапускаю crm-workers…`,
      auto: () => { try { svcRestart('crm-workers'); return '✅ crm-workers перезапущен.'; } catch (e) { return `❌ Не смог: ${e.message}`; } },
    });
  } else if (probe.code !== 0) {
    issues.push({
      key: 'probe:crashed',
      msg: `🚨 IMAP-проба упала (код ${probe.code}). stderr:\n${(probe.err || '').slice(-600)}`,
    });
  } else {
    const { ok, failed } = parseSync(probe.out);
    const total = ok.length + failed.length;

    if (total === 0) {
      issues.push({ key: 'probe:no-output', msg: `⚠ IMAP-проба ничего не вернула. stdout:\n${probe.out.slice(-400)}` });
    } else if (failed.length >= Math.ceil(total / 2)) {
      issues.push({
        key: 'probe:half-failed',
        msg: `🚨 ${failed.length}/${total} ящиков не отвечают по IMAP. Перезапускаю crm-workers.\n\n${failed.slice(0,8).map(f => `• ${f.email}: ${f.msg}`).join('\n')}`,
        auto: () => { try { svcRestart('crm-workers'); return '✅ crm-workers перезапущен. Повторная проверка через 5 мин.'; } catch (e) { return `❌ Не смог: ${e.message}`; } },
      });
    } else if (failed.length > 0) {
      issues.push({
        key: 'probe:some-failed',
        msg: `⚠ Часть ящиков не отвечает (${failed.length}/${total}). Проверь пароли приложения на mail.ru.\n\n${failed.map(f => `• ${f.email}: ${f.msg}`).join('\n')}`,
      });
    }
  }

  const activeKeys = new Set(issues.map(i => i.key));
  const recovered = Object.keys(state).filter(k => !activeKeys.has(k));

  for (const issue of issues) {
    const last = state[issue.key] || 0;
    if (now - last < COOLDOWN_MS) continue;
    await tg(issue.msg);
    if (issue.auto) {
      const result = issue.auto();
      if (result) await tg(result);
    }
    state[issue.key] = now;
  }

  const labels = {
    'svc:crm-api': 'crm-api',
    'svc:crm-workers': 'crm-workers',
    'probe:timeout': 'IMAP-проба (таймаут)',
    'probe:crashed': 'IMAP-проба (крэш)',
    'probe:no-output': 'IMAP-проба (пустой вывод)',
    'probe:half-failed': 'массовый отказ ящиков',
    'probe:some-failed': 'отдельные ящики',
  };
  for (const k of recovered) {
    await tg(`✅ Восстановлено: ${labels[k] || k}.`);
    delete state[k];
  }

  saveState(state);
  console.log(`[${new Date().toISOString()}] issues=${issues.length} probe=${probe.timedOut ? 'TIMEOUT' : 'code=' + probe.code}`);
}

run().catch(async (e) => {
  console.error('watchdog crashed:', e);
  await tg(`🚨 mail-health watchdog упал: ${e.message}`);
  process.exit(1);
});
