// 简洁中文控件：地图、天气、季节、视角与动画开关、操作提示、地图标题与互动提示。
const MAPS = [
  { id: 'shrine', name: '月夜林间神社', sub: '夜 · 溪流 · 灯笼' },
  { id: 'village', name: '晴日田园村庄', sub: '午后 · 农舍 · 池塘' },
  { id: 'riverside', name: '日落河岸小镇', sub: '黄昏 · 河岸 · 路灯' },
  { id: 'mountain', name: '云雾山间小径', sub: '清晨 · 梯田 · 云海' },
];
const WEATHERS = [['clear', '晴天'], ['rain', '下雨'], ['snow', '下雪']];
const SEASONS = [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']];

export class UI {
  constructor(app) {
    this.app = app;
    const root = document.getElementById('ui');
    root.innerHTML = `
      <section class="panel" id="panel">
        <header class="brand">
          <div class="brand-title">微缩童话世界</div>
          <button class="collapse" id="collapse" title="收起/展开面板">–</button>
        </header>
        <div class="panel-body">
          <div class="label">地图</div>
          <div class="maps" id="maps">${MAPS.map((m, i) => `<button class="map-btn" data-i="${i}"><span class="num">${i + 1}</span><span class="mname">${m.name}</span><span class="msub">${m.sub}</span></button>`).join('')}</div>
          <div class="row2">
            <div>
              <div class="label">天气</div>
              <div class="seg" id="weather">${WEATHERS.map(([k, n]) => `<button data-k="${k}">${n}</button>`).join('')}</div>
            </div>
            <div>
              <div class="label">季节</div>
              <div class="seg" id="season">${SEASONS.map(([k, n]) => `<button data-k="${k}">${n}</button>`).join('')}</div>
            </div>
          </div>
          <div class="label">视角与动画</div>
          <div class="tools">
            <button id="btn-reset">重置视角</button>
            <button id="btn-orbit" class="toggle">自动环绕</button>
            <button id="btn-pause" class="toggle">暂停环境</button>
            <button id="btn-paint" class="toggle on">绘画滤镜</button>
          </div>
        </div>
      </section>
      <div class="hint" id="hint">
        <span><b>WASD</b>/<b>方向键</b> 移动</span><span><b>Shift</b> 奔跑</span><span><b>E</b>/<b>空格</b> 互动</span>
        <span><b>左键拖动</b> 旋转</span><span><b>右键</b> 平移</span><span><b>滚轮</b> 缩放</span><span><b>R</b> 重置</span><span><b>1–4</b> 切换地图</span>
      </div>
      <div class="title-card" id="title"><div class="t-main"></div><div class="t-sub"></div></div>
      <div class="toast" id="toast"></div>
      <div class="stat" id="stat"></div>
      <div class="loading" id="loading"><div class="spinner"></div><div>正在搭建微缩世界…</div></div>
    `;
    this.$ = (s) => root.querySelector(s);
    root.querySelectorAll('.map-btn').forEach((b) => b.addEventListener('click', () => app.requestMap(+b.dataset.i)));
    root.querySelectorAll('#weather button').forEach((b) => b.addEventListener('click', () => app.setWeather(b.dataset.k)));
    root.querySelectorAll('#season button').forEach((b) => b.addEventListener('click', () => app.setSeason(b.dataset.k)));
    this.$('#btn-reset').addEventListener('click', () => app.resetView());
    this.$('#btn-orbit').addEventListener('click', () => app.toggleOrbit());
    this.$('#btn-pause').addEventListener('click', () => app.togglePause());
    this.$('#btn-paint').addEventListener('click', () => app.togglePaint());
    this.$('#collapse').addEventListener('click', () => {
      const p = this.$('#panel');
      p.classList.toggle('collapsed');
      this.$('#collapse').textContent = p.classList.contains('collapsed') ? '+' : '–';
    });
    // 按钮点击后释放焦点，避免空格键再次触发按钮
    root.querySelectorAll('button').forEach((b) => b.addEventListener('mouseup', () => b.blur()));
  }

  sync() {
    const s = this.app.state;
    document.querySelectorAll('.map-btn').forEach((b) => b.classList.toggle('on', +b.dataset.i === s.map));
    document.querySelectorAll('#weather button').forEach((b) => b.classList.toggle('on', b.dataset.k === s.weather));
    document.querySelectorAll('#season button').forEach((b) => b.classList.toggle('on', b.dataset.k === s.season));
    this.$('#btn-orbit').classList.toggle('on', s.orbit);
    this.$('#btn-pause').classList.toggle('on', s.paused);
    this.$('#btn-pause').textContent = s.paused ? '继续环境' : '暂停环境';
    this.$('#btn-paint').classList.toggle('on', s.paint);
  }

  showTitle(i) {
    const m = MAPS[i];
    const el = this.$('#title');
    el.querySelector('.t-main').textContent = m.name;
    el.querySelector('.t-sub').textContent = m.sub;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  toast(msg) {
    const el = this.$('#toast');
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  loading(on) { this.$('#loading').classList.toggle('show', on); }
  stat(text) { this.$('#stat').textContent = text; }
}

export { MAPS };
