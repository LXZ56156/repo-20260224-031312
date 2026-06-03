#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const shareCard = require('../miniprogram/core/shareCard');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp', 'share-card-preview');
const DPR = 2;

const bgPathByCloudId = {
  [shareCard.BG_CLOUD_PATHS[1]]: path.join(ROOT, 'miniprogram/assets/share-bg-gold.png'),
  [shareCard.BG_CLOUD_PATHS[2]]: path.join(ROOT, 'miniprogram/assets/share-bg-silver.png'),
  [shareCard.BG_CLOUD_PATHS[3]]: path.join(ROOT, 'miniprogram/assets/share-bg-bronze.png')
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function makeAvatarDataUrl(name, fill, options = {}) {
  const width = Number(options.width) || 180;
  const height = Number(options.height) || 180;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(width * 0.76, height * 0.2, Math.min(width, height) * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffdf6';
  ctx.font = `800 ${Math.round(Math.min(width, height) * 0.4)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(name || '球').slice(0, 1), width / 2, height / 2 + 4);
  return canvas.toDataURL('image/png');
}

function makeQrDataUrl() {
  const canvas = createCanvas(220, 220);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 220, 220);
  ctx.fillStyle = '#103b2a';
  drawFinder(ctx, 18, 18);
  drawFinder(ctx, 142, 18);
  drawFinder(ctx, 18, 142);
  for (let y = 26; y < 190; y += 18) {
    for (let x = 28; x < 190; x += 18) {
      if ((x < 82 && y < 82) || (x > 126 && y < 82) || (x < 82 && y > 126)) continue;
      if (((x * 7 + y * 11) % 5) < 2) ctx.fillRect(x, y, 10, 10);
    }
  }
  return canvas.toDataURL('image/png');
}

function drawFinder(ctx, x, y) {
  ctx.fillRect(x, y, 60, 60);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 10, y + 10, 40, 40);
  ctx.fillStyle = '#103b2a';
  ctx.fillRect(x + 21, y + 21, 18, 18);
}

function buildCases() {
  const qrCodeUrl = makeQrDataUrl();
  return [
    {
      name: 'preview-rank1',
      data: {
        userName: '林夏',
        eventName: '周三羽毛球夜赛',
        mode: '个人榜',
        wins: 8,
        losses: 2,
        winRate: '0%',
        totalMatches: 10,
        maxWinStreak: 5,
        avgScore: 18.2,
        rank: 1,
        avatarUrl: makeAvatarDataUrl('林', '#0b7f5b'),
        qrCodeUrl
      }
    },
    {
      name: 'preview-rank2',
      data: {
        userName: 'Alex Chen',
        eventName: '滨江球馆双打赛',
        mode: '固定搭档',
        wins: 6,
        losses: 3,
        winRate: '66.7%',
        totalMatches: 9,
        maxWinStreak: 4,
        avgScore: 16,
        rank: 2,
        avatarUrl: makeAvatarDataUrl('A', '#3e6f91', { width: 260, height: 140 }),
        qrCodeUrl
      }
    },
    {
      name: 'preview-rank3',
      data: {
        userName: '赵小羽',
        eventName: '春季俱乐部轮转赛',
        mode: '多人轮转',
        wins: 5,
        losses: 4,
        winRate: '',
        totalMatches: 9,
        maxWinStreak: 3,
        avgScore: 15.7,
        rank: 3,
        avatarUrl: makeAvatarDataUrl('赵', '#8a5a1f', { width: 140, height: 260 }),
        qrCodeUrl
      }
    },
    {
      name: 'preview-stress1',
      data: {
        userName: '昵称特别特别长的参赛选手',
        eventName: '2026年度城市羽毛球俱乐部超级长名称积分挑战赛',
        mode: '超级长模式标签测试',
        wins: 126,
        losses: 18,
        winRate: '87.5%',
        totalMatches: 144,
        maxWinStreak: 28,
        avgScore: 108.42,
        rank: 1,
        avatarUrl: makeAvatarDataUrl('长', '#115c48'),
        qrCodeUrl
      }
    },
    {
      name: 'preview-stress2',
      data: {
        userName: 'VeryLongEnglishNickname',
        eventName: 'International Badminton Rotation Championship 2026',
        mode: 'fixed_pair_round_robin',
        wins: 100,
        losses: 0,
        winRate: '100%',
        totalMatches: 100,
        maxWinStreak: 100,
        avgScore: 99.95,
        rank: 2,
        avatarUrl: makeAvatarDataUrl('V', '#4f6470'),
        qrCodeUrl
      }
    },
    {
      name: 'preview-stress3',
      data: {
        userName: '',
        eventName: '无头像无昵称边界场景测试',
        mode: '队伍榜',
        wins: 0,
        losses: 0,
        winRate: 0,
        totalMatches: 0,
        maxWinStreak: 0,
        avgScore: '',
        rank: 3,
        avatarUrl: '',
        qrCodeUrl
      }
    }
  ];
}

async function renderCase(item) {
  const canvas = createCanvas(shareCard.DRAW_SIZE.width, shareCard.DRAW_SIZE.height);
  const outputPath = path.join(OUT_DIR, `${item.name}.png`);
  await shareCard.drawShareCard(canvas, item.data, {
    dpr: DPR,
    loadImage,
    resolveImageSource(src) {
      return bgPathByCloudId[src];
    },
    exportCanvas(targetCanvas) {
      fs.writeFileSync(outputPath, targetCanvas.toBuffer('image/png'));
      return outputPath;
    }
  });
  return outputPath;
}

async function main() {
  ensureDir(OUT_DIR);
  const outputs = [];
  for (const item of buildCases()) {
    outputs.push(await renderCase(item));
  }
  outputs.forEach((file) => {
    const relative = path.relative(ROOT, file);
    const size = fs.statSync(file).size;
    console.log(`${relative} ${size} bytes`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
