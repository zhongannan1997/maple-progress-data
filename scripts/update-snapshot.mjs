// Daily EXP snapshot from Nexon's public no-auth ranking endpoint.
// No credentials, no dependencies. Runs in GitHub Actions, output is served via jsDelivr.
import { readFileSync, writeFileSync } from 'node:fs';

const NAME = 'PaLaDingZhen';
const API = 'https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na'
  + '?type=overall&id=weekly&reboot_index=0&page_index=1&character_name=' + encodeURIComponent(NAME);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const REFERER = 'https://www.nexon.com/maplestory/rankings/north-america/overall/weekly?world_type=both';
const FILE = 'snapshot.json';
const KEY = NAME.toLowerCase();

// The ranking response carries characterImgURL: a 96x96 PNG of the character's
// CURRENT hair / cash outfit / weapon. Embed it as a data URI so the app never
// has to reach msavatar*.nexon.net (which is unreliable on some CN networks).
async function fetchAvatar(url, fallback) {
  if (!url || !/^https:\/\/msavatar\d*\.nexon\.net\//.test(url)) return fallback;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'image/png,image/*' },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store'
    });
    if (!r.ok) return fallback;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 100 || b.length > 200000) return fallback;
    if (b[0] !== 0x89 || b.toString('ascii', 1, 4) !== 'PNG') return fallback;
    return 'data:image/png;base64,' + b.toString('base64');
  } catch (e) {
    console.warn('avatar fetch skipped: ' + e.message);
    return fallback;
  }
}

async function main() {
  const old = JSON.parse(readFileSync(FILE, 'utf8'));
  const res = await fetch(API, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: REFERER },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const row = (j.ranks || []).find(r => String(r.characterName || '').toLowerCase() === KEY);
  if (!row) throw new Error('character not found in ranking response');
  const expT = Number(row.exp) / 1e12;
  if (!isFinite(expT) || expT <= 0) throw new Error('unexpected exp value ' + row.exp);

  const d = new Date().toISOString().slice(0, 10);
  const hist = { ...(old.history || {}) };
  const arr = (hist[NAME] || hist[KEY] || []).filter(p => p.d !== d);
  arr.push({ d: d, exp: +expT.toFixed(6), level: +row.level });
  arr.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  hist[NAME] = arr.slice(-180);

  const prev = (old.characters || [])[0] || {};
  const out = {
    updatedAt: new Date().toISOString(),
    stale: false,
    source: 'Nexon no-auth ranking v2 via GitHub Actions -> jsDelivr mirror',
    characters: [{
      name: NAME,
      level: +row.level,
      exp: +expT.toFixed(6),
      job: prev.job || 'Paladin',
      worldID: +row.worldID || prev.worldID || 0,
      legionLevel: +row.legionLevel || prev.legionLevel || 0,
      rank: +row.rank || 0,
      region: 'NA',
      avatar: await fetchAvatar(row.characterImgURL, prev.avatar || ''),
      avatarSource: row.characterImgURL || '',
      d: d
    }],
    history: hist
  };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
  console.log('OK ' + d + ' Lv' + row.level + ' exp=' + expT.toFixed(3) + 'T');
}

// A failed fetch must NOT look like a green run. Exit non-zero so GitHub
// reports the failed run (and sends its failure notification), keep yesterday's
// snapshot untouched, and let the app's freshness badge warn on the phone once
// the data is >30h old. No silent success, no fake timestamp.
main().catch(e => { console.error('FAILED (kept previous snapshot): ' + e.message); process.exit(1); });
