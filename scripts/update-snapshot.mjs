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
      avatar: row.characterImgURL || prev.avatar || '',
      d: d
    }],
    history: hist
  };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
  console.log('OK ' + d + ' Lv' + row.level + ' exp=' + expT.toFixed(3) + 'T');
}

// A failed fetch must not break the repo: keep yesterday's snapshot.
main().catch(e => { console.error('SKIP (kept previous snapshot): ' + e.message); process.exit(0); });
