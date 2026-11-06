// 规则网格场：用“印章”方式把折线（河道、小路）的距离、弧长、切线写入网格，之后双线性采样。
export class Field {
  constructor(bounds, res) {
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.res = res;
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / res) + 1;
    this.nz = Math.ceil((bounds.z1 - bounds.z0) / res) + 1;
    const n = this.nx * this.nz;
    this.d = new Float32Array(n).fill(1e4);
    this.s = new Float32Array(n);
    this.y = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
  }

  stamp(poly, maxR) {
    const { res, nx, nz, x0, z0 } = this;
    for (let k = 0; k < poly.length - 1; k++) {
      const a = poly[k], b = poly[k + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz || 1e-6, len = Math.sqrt(l2);
      const minx = Math.min(a[0], b[0]) - maxR, maxx = Math.max(a[0], b[0]) + maxR;
      const minz = Math.min(a[1], b[1]) - maxR, maxz = Math.max(a[1], b[1]) + maxR;
      const i0 = Math.max(0, Math.floor((minx - x0) / res)), i1 = Math.min(nx - 1, Math.ceil((maxx - x0) / res));
      const j0 = Math.max(0, Math.floor((minz - z0) / res)), j1 = Math.min(nz - 1, Math.ceil((maxz - z0) / res));
      for (let j = j0; j <= j1; j++) {
        const z = z0 + j * res;
        for (let i = i0; i <= i1; i++) {
          const x = x0 + i * res;
          let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = a[0] + dx * t - x, pz = a[1] + dz * t - z;
          const d = Math.sqrt(px * px + pz * pz);
          const idx = j * nx + i;
          if (d < this.d[idx]) {
            this.d[idx] = d;
            this.s[idx] = a[3] + (b[3] - a[3]) * t;
            this.y[idx] = a[2] + (b[2] - a[2]) * t;
            this.tx[idx] = dx / len; this.tz[idx] = dz / len;
            this.px[idx] = a[0] + dx * t; this.pz[idx] = a[1] + dz * t;
          }
        }
      }
    }
  }

  _bl(arr, x, z) {
    const fx = (x - this.x0) / this.res, fz = (z - this.z0) / this.res;
    let i = Math.floor(fx), j = Math.floor(fz);
    i = Math.max(0, Math.min(this.nx - 2, i)); j = Math.max(0, Math.min(this.nz - 2, j));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const k = j * this.nx + i;
    const a = arr[k], b = arr[k + 1], c = arr[k + this.nx], d = arr[k + this.nx + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  _nn(arr, x, z) {
    const i = Math.max(0, Math.min(this.nx - 1, Math.round((x - this.x0) / this.res)));
    const j = Math.max(0, Math.min(this.nz - 1, Math.round((z - this.z0) / this.res)));
    return arr[j * this.nx + i];
  }
  dist(x, z) { return this._bl(this.d, x, z); }
  param(x, z) { return this._nn(this.s, x, z); }
  elev(x, z) { return this._bl(this.y, x, z); }
  tangent(x, z) { return [this._nn(this.tx, x, z), this._nn(this.tz, x, z)]; }
  // 点位于折线前进方向的左侧(+1)/右侧(-1)
  side(x, z) {
    const tx = this._nn(this.tx, x, z), tz = this._nn(this.tz, x, z);
    const px = this._nn(this.px, x, z), pz = this._nn(this.pz, x, z);
    return tx * (z - pz) - tz * (x - px) > 0 ? 1 : -1;
  }
}

// 标量网格（高度、遮蔽等）
export class Grid {
  constructor(bounds, res, init = 0) {
    this.x0 = bounds.x0; this.z0 = bounds.z0; this.res = res;
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / res) + 1;
    this.nz = Math.ceil((bounds.z1 - bounds.z0) / res) + 1;
    this.a = new Float32Array(this.nx * this.nz).fill(init);
  }
  fill(fn) {
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) this.a[j * this.nx + i] = fn(this.x0 + i * this.res, this.z0 + j * this.res);
  }
  get(x, z) {
    const fx = (x - this.x0) / this.res, fz = (z - this.z0) / this.res;
    let i = Math.floor(fx), j = Math.floor(fz);
    i = Math.max(0, Math.min(this.nx - 2, i)); j = Math.max(0, Math.min(this.nz - 2, j));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const k = j * this.nx + i, A = this.a;
    const a = A[k], b = A[k + 1], c = A[k + this.nx], d = A[k + this.nx + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  cell(x, z) {
    const i = Math.round((x - this.x0) / this.res), j = Math.round((z - this.z0) / this.res);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }
}
