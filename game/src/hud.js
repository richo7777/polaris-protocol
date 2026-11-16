// Polaris Protocol — the HUD: health, armor, ammo, money, timer, scores,
// crosshair with live spread, kill feed, hitmarker, minimap, buy menu and
// every screen (start, round end, match end, pause). Pure DOM + 2D canvas.
import { WEAPONS, ECON, BUY_ORDER, CAPTURE_RADIUS } from './state.js';
import { WALLS } from './map.js';

export class HUD {
  constructor(world) {
    this.w = world;
    this.el = {};
    for (const id of ['hud', 'health', 'armor', 'ammo', 'money', 'timer', 'scoreP', 'scoreG', 'round', 'feed', 'cross', 'hitmark', 'banner', 'minimap', 'buyMenu', 'startScreen', 'endScreen', 'pauseScreen', 'capBar', 'capFill', 'capLabel', 'flash', 'scope', 'hint', 'buyList', 'buyMoney', 'endTitle', 'endSub', 'spec', 'weaponName']) {
      this.el[id] = document.getElementById(id);
    }
    this.mm = this.el.minimap.getContext('2d');
    this.hitAt = -9; this.hitHead = false;
    this._buildBuyMenu();
    this.el.buyMenu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-buy]');
      if (b) this.w.buyAction(b.dataset.buy);
    });
  }
  _buildBuyMenu() {
    let html = '';
    for (const id of BUY_ORDER) {
      const w = WEAPONS[id];
      html += `<div class="buy-item" data-buy="weapon:${id}"><b>${w.name}</b><span>${w.kind} · ${w.dmg} dmg · ${w.mag} rnd</span><i>$${w.price}</i></div>`;
    }
    html += `<div class="buy-item" data-buy="armor"><b>Thermal Vest</b><span>100 armor · absorbs half</span><i>$${ECON.armor}</i></div>`;
    html += `<div class="buy-item" data-buy="flash"><b>Flash Charge</b><span>blinds on detonation · key 4 + G</span><i>$${ECON.flash}</i></div>`;
    html += `<div class="buy-item" data-buy="smoke"><b>Smoke Canister</b><span>blocks sight · key 5 + G</span><i>$${ECON.smoke}</i></div>`;
    this.el.buyList.innerHTML = html;
  }
  showStart() {
    this.el.startScreen.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.buyMenu.classList.add('hidden');
  }
  hideStart() {
    this.el.startScreen.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }
  showBuy(open) {
    this.el.buyMenu.classList.toggle('hidden', !open);
    if (open) this.el.buyMoney.textContent = '$' + this.w.player.money;
  }
  showBanner(text, sub, ms = 3200) {
    this.el.banner.innerHTML = `<b>${text}</b><span>${sub}</span>`;
    this.el.banner.classList.remove('hidden');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.el.banner.classList.add('hidden'), ms);
  }
  showEnd(title, sub) {
    this.el.endTitle.textContent = title;
    this.el.endSub.textContent = sub;
    this.el.endScreen.classList.remove('hidden');
  }
  hideEnd() { this.el.endScreen.classList.add('hidden'); }
  showPause(open) { this.el.pauseScreen.classList.toggle('hidden', !open); }
  hitmark(head) { this.hitAt = performance.now(); this.hitHead = head; }
  feed(entries) {
    this.el.feed.innerHTML = entries.map(e =>
      `<div><span style="color:${e.killerTeam === 'polaris' ? '#5db4ff' : '#ff6a5e'}">${e.killer}</span> ${e.head ? '◉' : '✕'} <span style="color:${e.victimTeam === 'polaris' ? '#5db4ff' : '#ff6a5e'}">${e.victim}</span></div>`
    ).join('');
  }
  update() {
    const w = this.w, m = w.match, p = w.player;
    if (m.phase === 'menu') return;
    const t = Math.max(0, Math.ceil(m.timer));
    this.el.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.el.scoreP.textContent = m.score.polaris;
    this.el.scoreG.textContent = m.score.glacier;
    this.el.round.textContent = 'ROUND ' + m.round + ' / 13';
    this.el.health.textContent = Math.ceil(p.hp);
    this.el.health.style.color = p.hp <= 30 ? '#ff6a5e' : '#fff';
    this.el.armor.textContent = Math.ceil(p.armor);
    const wd = WEAPONS[p.weapon];
    this.el.weaponName.textContent = wd.name.toUpperCase() + (p.flash + p.smoke ? `  ·  FLASH ${p.flash}  SMOKE ${p.smoke}` : '');
    this.el.ammo.innerHTML = p.reloading ? 'RELOADING' : `${p.ammo} <small>/ ${p.reserve}</small>`;
    this.el.money.textContent = '$' + p.money;
    this.el.hint.textContent = p.alive ? '' : 'YOU ARE DOWN — spectating your squad';
    this.el.spec.classList.toggle('hidden', p.alive);
    // Crosshair gap follows spread; hidden while scoped or in menus.
    const gap = 6 + (wd.spread + p.spread + p.speed * 0.5) * 3;
    this.el.cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
    this.el.cross.classList.toggle('hidden', !p.alive || m.phase !== 'live' || p.scoped);
    this.el.scope.classList.toggle('hidden', !p.scoped);
    // Hitmarker flash.
    const hAge = performance.now() - this.hitAt;
    this.el.hitmark.style.opacity = hAge < 220 ? '1' : '0';
    this.el.hitmark.style.color = this.hitHead ? '#ff5a4d' : '#fff';
    // Capture bar.
    const cap = m.capture;
    if (cap.team) {
      this.el.capBar.classList.remove('hidden');
      this.el.capFill.style.width = (cap.progress * 100).toFixed(0) + '%';
      this.el.capFill.style.background = cap.team === 'polaris' ? '#5db4ff' : '#ff6a5e';
      this.el.capLabel.textContent = (cap.team === 'polaris' ? 'POLARIS' : 'GLACIER') + ' CAPTURING REACTOR';
    } else {
      this.el.capBar.classList.add('hidden');
    }
    // Flash blindness overlay.
    const blind = Math.max(0, p.blindUntil - w.time);
    this.el.flash.style.opacity = blind > 0 ? Math.min(0.95, blind / 2.4).toFixed(2) : '0';
    this.feed(m.killfeed);
    this.drawMinimap();
  }
  drawMinimap() {
    const c = this.mm, S = 132, k = S / 68;
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(8,14,22,0.72)';
    c.fillRect(0, 0, S, S);
    const X = (x) => (x + 34) * k, Z = (z) => (z + 34) * k;
    c.fillStyle = '#5a6b7d';
    for (const wl of WALLS) c.fillRect(X(wl.x1), Z(wl.z1), (wl.x2 - wl.x1) * k, (wl.z2 - wl.z1) * k);
    // Reactor.
    c.strokeStyle = '#35d5ff'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(X(0), Z(0), CAPTURE_RADIUS * k, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#35d5ff';
    c.beginPath(); c.arc(X(0), Z(0), 2.5, 0, Math.PI * 2); c.fill();
    // Agents.
    for (const a of this.w.agents) {
      if (!a.alive) continue;
      c.fillStyle = a.team === 'polaris' ? '#5db4ff' : '#ff6a5e';
      c.beginPath(); c.arc(X(a.x), Z(a.z), a.isPlayer ? 3.4 : 2.4, 0, Math.PI * 2); c.fill();
      if (a.isPlayer) {
        c.strokeStyle = '#fff'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(X(a.x), Z(a.z));
        c.lineTo(X(a.x) - Math.sin(a.yaw) * 7, Z(a.z) - Math.cos(a.yaw) * 7); c.stroke();
      }
    }
    // Smoke clouds.
    c.fillStyle = 'rgba(200,210,220,0.5)';
    for (const s of this.w.match.smokes) { c.beginPath(); c.arc(X(s.x), Z(s.z), s.r * k, 0, Math.PI * 2); c.fill(); }
  }
}
