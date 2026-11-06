// 季节调色板：地表、树叶、花草、积雪基础覆盖。每张地图可在此基础上做色偏。
import * as THREE from 'three';

const C = (h) => new THREE.Color(h);

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAMES = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

const BASE = {
  spring: {
    grassA: '#74b447', grassB: '#9fd05a', grassDry: '#bcc477', dryAmt: 0.07,
    leaf: ['#86c257', '#9fd067', '#6aac48', '#b5d86e'],
    blossom: ['#f3b6c9', '#f7cfdc', '#eea5bf'],
    conifer: ['#4e7f4a', '#5b8c50'],
    bush: ['#7fbb52', '#98c95c'],
    tuftA: '#7bb24a', tuftB: '#b4d468',
    flowers: ['#ffffff', '#f6c1d6', '#ffe170', '#c4dcff', '#ffffff'],
    flowerDensity: 1.0, flowerSpeck: 0.2,
    flowerA: '#ffffff', flowerB: '#f6bfd3',
    leafAmount: 1.0, snowBase: 0.0, petals: 'blossom',
  },
  summer: {
    grassA: '#5c9c3b', grassB: '#86b94b', grassDry: '#b2b45e', dryAmt: 0.12,
    leaf: ['#4f8f3a', '#64a343', '#3f7e34', '#7aae47'],
    blossom: ['#4f8f3a', '#64a343'],
    conifer: ['#3e6e3e', '#4b7b45'],
    bush: ['#5d9b3d', '#76ad45'],
    tuftA: '#5a983a', tuftB: '#93c050',
    flowers: ['#ffffff', '#ffd84a', '#ff9b6b', '#ffffff', '#b9a6ff'],
    flowerDensity: 0.8, flowerSpeck: 0.14,
    flowerA: '#ffffff', flowerB: '#ffd84a',
    leafAmount: 1.0, snowBase: 0.0, petals: null,
  },
  autumn: {
    grassA: '#9a9550', grassB: '#b7a35c', grassDry: '#c08d4c', dryAmt: 0.3,
    leaf: ['#d9752d', '#e9a43a', '#c4502a', '#e8c24a'],
    blossom: ['#d65e2c', '#e3883a'],
    conifer: ['#4a6a40', '#5a7446'],
    bush: ['#b98a3a', '#c6693a'],
    tuftA: '#a0954a', tuftB: '#d0ad5c',
    flowers: ['#f1d38a', '#e9874a', '#f5e9c8'],
    flowerDensity: 0.35, flowerSpeck: 0.06,
    flowerA: '#f4e4b8', flowerB: '#e8914c',
    leafAmount: 0.88, snowBase: 0.0, petals: 'leaves',
  },
  winter: {
    grassA: '#9ea489', grassB: '#b8b79c', grassDry: '#a39780', dryAmt: 0.3,
    leaf: ['#a8998a', '#b5a796', '#9c8d7d', '#bfb3a4'],
    blossom: ['#8d7b66', '#9b8a74'],
    conifer: ['#33584a', '#3d6152'],
    bush: ['#6f7d63', '#7d8a6c'],
    tuftA: '#9a9b7d', tuftB: '#b9b596',
    flowers: ['#ffffff'],
    flowerDensity: 0.0, flowerSpeck: 0.0,
    flowerA: '#ffffff', flowerB: '#ffffff',
    leafAmount: 0.22, snowBase: 0.82, petals: null,
  },
};

// tint: {mul: [r,g,b], hue?} 地图色偏
export function seasonPalette(season, mapTint) {
  const b = BASE[season];
  const out = {};
  const mul = mapTint?.mul || [1, 1, 1];
  const toward = mapTint?.toward ? C(mapTint.toward) : null;
  const amt = mapTint?.amt ?? 0;
  const tc = (h) => {
    const c = C(h);
    if (toward) {
      // 保留明度，向目标色相靠拢
      const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
      const tl = toward.r * 0.3 + toward.g * 0.55 + toward.b * 0.15;
      const t2 = toward.clone().multiplyScalar(l / Math.max(0.01, tl));
      c.lerp(t2, amt);
    }
    c.r *= mul[0]; c.g *= mul[1]; c.b *= mul[2];
    return c;
  };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'string' && v.startsWith('#')) out[k] = tc(v);
    else if (Array.isArray(v)) out[k] = v.map((h) => tc(h));
    else out[k] = v;
  }
  out.season = season;
  return out;
}
