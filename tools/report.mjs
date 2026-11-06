// 生成 scene_report.json：静态的场景描述 + verification/verify_result.json 中的实测数据 + 截图清单。
import fs from 'fs';

const V = JSON.parse(fs.readFileSync('verification/verify_result.json', 'utf8'));
const shots = fs.readdirSync('screenshots').filter((f) => f.endsWith('.png')).sort();
const M = V.maps;
const pick = (name) => {
  const m = M[name];
  return {
    loadMs: m.loadMs, spawnWalkable: m.spawnWalkable, grassTufts: m.stats.grass, flowers: m.stats.flowers,
    colliders: m.colliders, walkDecks: m.decks, lamps: m.lamps, smokeEmitters: m.smokeEmitters,
    tileCornersInView1920x1080: m.tileInView, tileNdcExtent: m.ndcExtent,
    route: { waypointsReached: `${m.route.reached.filter(Boolean).length}/${m.route.reached.length}`, note: m.routeNote, climb: m.route.climb, maxGroundError: +m.route.maxGroundErr.toFixed(3), framesInsideColliders: m.route.enteredCollider, framesInDeepWater: m.route.deepWater, minEdgeDistance: +m.route.minEdge.toFixed(2), companionDistances: m.route.companionDist, companionGaps: m.route.companionGap, companionsStoppedAfterPlayer: m.route.companionsStill },
    ford: m.ford ? { waypointsReached: `${m.ford.reached.filter(Boolean).length}/${m.ford.reached.length}`, wadingRipplesSpawned: m.ford.ripplesSpawned } : undefined,
    blockingTests: m.push.map((p) => ({ test: p.name, end: p.end, remainingDistance: p.distToTarget, framesInsideColliders: p.enteredCollider, framesInDeepWater: p.deepWater, minEdgeDistance: +p.minEdge.toFixed(2), maxClimb: +p.maxClimb.toFixed(2) })),
  };
};

const report = {
  project: '微缩童话世界（Three.js）',
  generatedAt: new Date().toISOString(),
  run: {
    install: 'npm install',
    dev: 'npm run dev  →  http://127.0.0.1:5173/',
    production: 'npm start（= vite build + vite preview）→  http://127.0.0.1:4173/',
    offline: '运行时不依赖任何远程 CDN；three.js 由 Vite 打包进 dist/，纹理全部运行时用 Canvas/着色器生成。',
    urlParams: { map: '?map=0..3 指定初始地图', manual: '?manual 手动步进模式（自动化截图/验证使用）' },
  },
  dependencies: { three: '0.186.1', vite: '7.3.7（开发依赖）', verificationOnly: 'Playwright + Chromium（未写入依赖，使用本机已安装版本）' },
  maps: [
    {
      id: 'shrine', name: '月夜林间神社', seed: 101, footprint: '40×40 方形地块，厚 5.5，石块+土层剖面',
      defaultEnvironment: { time: '夜晚（月光）', weather: '晴', season: '夏', palette: '冷蓝/青绿 + 暖黄灯笼' },
      camera: { azimuthDeg: 45, elevationDeg: 40, composition: '菱形斜俯视，神社在后角、溪流横穿中部、小路自前角蜿蜒而上' },
      components: ['红色鸟居（笠木/岛木/贯/额束/注连绳与纸垂）', '小型神社本殿（石台、台阶、回廊、格子门、茅草屋顶、千木与鲣木、赛钱箱与铃）', '神社高台与石砌挡墙（坡道入口）', '弯曲铺石小径 + 分支踏迹', '穿过地图的溪流（远岸石砌陡岸、近岸缓坡）', '朱红拱桥（可通行桥面）', '浅滩踏石（可涉水，产生涟漪）', '4 座石灯笼 + 2 盏木杆纸灯笼（点光源 + 光晕 + 水面倒影）', '约 30 棵阔叶树/杉树 + 灌木丛', '溪岸苔石、溪中卵石（带泡沫）与巨石群', '石像（地藏）', '草丛与白色/黄色小花', '萤火虫 90 只', '溪面低雾'],
      measured: pick('月夜林间神社'),
    },
    {
      id: 'village', name: '晴日田园村庄', seed: 202, footprint: '48×38 长方形地块，厚 4.5，赭黄土层 + 灰石剖面',
      defaultEnvironment: { time: '午后', weather: '晴', season: '春', palette: '明亮草绿 / 米黄 / 天蓝' },
      camera: { azimuthDeg: 34, elevationDeg: 39, composition: '土路 S 形纵贯，左侧农舍与菜圃，右侧小屋与钟楼' },
      components: ['茅草四坡顶农舍（木构转角、腰线、窗与门、石基）', '门廊小屋（双坡顶、烟囱、百叶窗、花箱、门灯）', '蓝色小屋（老虎窗 ×2、双烟囱、门廊）', '三层钟楼客栈（石砌底层、阳台栏杆、钟面、四坡红瓦顶）——地标建筑', '木板小仓库', '贯穿村落的土路与 5 条支路', '小池塘（石岸、睡莲、芦苇）', '菜圃（垄沟、卷心菜/葱/胡萝卜）与四周栅栏（留门）', '路边栅栏', '水井（石圈、辘轳、小屋顶）', '草垛、路牌、长椅、木杆灯', '约 22 棵树（含 3 棵春季樱花）+ 灌木', '三处烟囱炊烟'],
      measured: pick('晴日田园村庄'),
    },
    {
      id: 'riverside', name: '日落河岸小镇', seed: 303, footprint: '52×34 长方形地块，厚 4.2，前缘露出河水横截面',
      defaultEnvironment: { time: '日落', weather: '晴', season: '夏', palette: '蜜桃 / 紫粉 / 暖橙 与 蓝绿 的冷暖对比' },
      camera: { azimuthDeg: 11, elevationDeg: 42, composition: '正面构图：后排台地房屋、中部步道与灯串、前景大面积河面' },
      components: ['台地上 4 栋形态各异的沿岸房屋 + 屋后小屋（老虎窗、石板/瓦屋顶、烟囱、门廊、木构）', '台地石砌挡墙与 3 条坡道', '铺石河岸步道', '6 盏暖色路灯 + 路灯之间的悬垂灯串（每段 10 颗灯泡）', '木制推车摊位（车轮、条纹遮阳棚、货箱与水果、挂灯）', '长椅、花箱、木桶、货箱', '河堤石沿', '木栈桥（可行走）与随水起伏的小船', '河中岩石（泡沫环）', '水面：流动笔触高光、岸线泡沫、视角相关闪光、路灯倒影'],
      measured: pick('日落河岸小镇'),
    },
    {
      id: 'mountain', name: '云雾山间小径', seed: 404, footprint: '直径约 44 的不规则悬浮山岛，底部为锥形岩土',
      defaultEnvironment: { time: '清晨', weather: '晴', season: '夏', palette: '草绿 / 浅灰石墙 / 天蓝云海' },
      camera: { azimuthDeg: -32, elevationDeg: 31, composition: '侧斜视角突出高差与悬浮岩体，背景为云海' },
      components: ['约 12.6 高的阶梯山体，6 层石砌梯田挡墙', '顺时针盘绕 1.33 圈的盘山道（切填坡道，全程可走）', '切穿岛缘的峡谷 + 连接两侧的木板吊桥（绳索护栏、可行走）', '山顶平台与凉亭（可站上）、石灯笼', '路旁石桩、起点路牌', '零星树木（阔叶/杉）、灌木、岩石', '43 团在地形间缓慢漂移的云雾（靠近角色自动变淡）', '背景云海'],
      measured: pick('云雾山间小径'),
    },
  ],
  environmentEffects: {
    vegetationWind: '顶点着色器风动：草丛/花朵按高度平方摆动，树冠卡片按高度与实例位置相位摆动，相位来自世界坐标与实例序号，避免同步',
    water: '基于 Lambert 的透明水体（接收阴影）：深浅色、流向图驱动的三层笔触高光（闪烁）、岸线/岩石泡沫、法线扰动的视角相关闪光、天空反射、雨滴涟漪、角色/互动涟漪（10 个槽位）、灯光拉长倒影；河道穿出地块时绘制水体横截面',
    smoke: '烟囱烟为 GPU 粒子（每烟囱 18 粒），随时间上升、扩散、随风偏移',
    mist: '实例化面片云雾，fbm 噪声轮廓，按水平漂移循环，贴近地面处与靠近角色处自动淡出',
    particles: '夜间萤火虫（闪烁 + 漂移），春季花瓣/秋季落叶飘落，互动光点（CPU 粒子池 96）',
    characters: '腿/臂摆动、身体起伏、平滑转向、减速停步；伙伴沿足迹跟随并在停下后转向玩家；灯笼精灵悬浮摆动',
  },
  weather: {
    clear: '地图默认光照',
    rain: '4200 条按速度方向拉长的雨丝（近处更长更亮、远处更短更淡）+ 700 个地面溅落环；太阳光降至约 28%，天光/背景/雾偏灰，雾加浓，饱和度降低，地表与植被湿润变暗，水面雨滴涟漪，灯光与窗光增强，萤火虫隐藏，风加强',
    snow: '3200 片带深度大小变化的雪花；积雪随时间在朝上表面累积（地表、屋顶、树冠、岩石），停止下雪后缓慢融化；光照偏冷、背景与雾偏白',
    note: '雨丝与雪花在绘画滤镜之后的叠加层绘制，避免细线被 Kuwahara 抹平；粒子在地形以下自动裁剪',
  },
  seasons: {
    linked: ['树叶颜色（春新绿+樱花 / 夏浓绿 / 秋橙红黄 / 冬灰褐）', '落叶量（冬季保留约 22% 叶片，露出枝干）', '地表草色与枯草斑块', '花朵数量与颜色（实例显隐）与地表花点', '草丛颜色', '积雪基础覆盖（冬季 0.82）', '飘落粒子（春花瓣 / 秋落叶）', '光照色温与饱和度'],
    transition: '地表顶点色在 0.9 秒内插值过渡，叶量/积雪/粒子量平滑过渡',
  },
  interaction: {
    movement: 'WASD/方向键（相对相机方向），Shift 奔跑；角色朝向与移动方向一致',
    walkable: '0.25 网格的可通行图：地块边缘留边、深水（>0.3）不可走、坡度 >0.95 不可走、建筑/树干/岩石/灯柱等碰撞体不可走；桥面/栈桥/凉亭为高度覆盖的可行走平台；单帧高差 >0.55 拒绝移动',
    terrainFollow: '角色高度平滑贴合地形或桥面',
    companions: '3 名伙伴（橡果精、红兜帽、灯笼精灵）按足迹弧长 0.85 间距跟随',
    camera: '左键拖动旋转（方位 + 仰角限制）、右键/Shift 拖动平移、滚轮/双指缩放（0.75–6 倍）、R 或按钮重置、自动环绕开关；越放大越紧跟角色',
    feedback: ['靠近灯笼：点光源与光晕平滑增强（约 1.65 倍）', 'E/空格：角色周围光点爆发；附近灯笼闪亮；附近水面产生涟漪；中文提示', '涉水/靠近水边行走：持续产生涟漪'],
    pause: '暂停仅冻结环境时间（风、水、粒子、天气、雾、船、灯焰闪烁），角色仍可操作；恢复后环境时间从暂停值继续，无跳变',
    mapSwitch: '切换地图时释放旧地图的几何/材质/纹理，角色在该地图出生点（自动吸附到最近可通行处），相机恢复该地图的默认构图，天气季节恢复该地图默认值',
  },
  implementation: {
    rendering: ['正交斜俯视相机，按当前角度把地块包围盒投影到屏幕自动取景', 'MeshLambertMaterial + onBeforeCompile 注入：柔和明暗分区光照、世界空间笔触噪声、积雪、湿润、风动、建筑图集采样', '地形着色器：草地笔触、程序化花点、Voronoi 铺石小路、陡坡自动石墙纹理', '剖面着色器：草皮唇边/深色表土/赭黄土层/石块层', '方向光 4096 阴影 + 半球光 + 每图最多约 8 个点光源', '多重采样 HalfFloat 渲染 → UnrealBloom（只让灯泡/月亮等高亮泛光）→ 八扇区广义 Kuwahara 绘画滤镜 + 调色/暗角/纸纹 → 天气叠加层 → Neutral 色调映射输出', '背景着色器：渐变、地平光、星空、月牙、云海'],
    assets: ['树冠：面向相机的叶簇卡片（球面法线、扇贝状叶团贴图、Alpha 裁剪、受光边缘高光），自定义深度材质用于阴影', '建筑：GeoBuilder 将盒体、柱体、双坡/四坡屋顶等合并为单一网格，世界尺度 UV + 4×4 灰度图集（灰泥、木板、茅草、瓦片、石墙、砖块、障子、条纹布等）'],
    performance: ['InstancedMesh：树冠/树干按变体实例化，草丛（2600–4200）、花朵（1100–1700）、岩石均为实例', '材质全局共享，切换地图不重新编译', '粒子数量固定上限，全部 GPU 驱动（雨 4200、雪 3200、溅落 700、萤火虫 ≤90、烟 18/烟囱、云雾 ≤43、落叶 ≤140、光点池 96）', '像素比上限 1.5；绘画滤镜可关闭', '静态建筑与道具合并为 3 个网格（建筑/玻璃/灯泡）'],
    determinism: '所有布局使用 mulberry32 固定种子（每图 seed 101/202/303/404），噪声为确定性哈希，场景可复现',
    resourceManagement: '事件监听只在启动时注册一次；地图对象 dispose() 释放非共享几何、材质与 DataTexture；共享资源以 userData.shared 标记',
  },
  verification: {
    method: '在 Chromium（Playwright）中加载 vite preview 构建产物，?manual 模式按固定步长推进真实主循环；移动测试用自动驾驶生成与相机相对的输入，经由真实的 Party.update / 碰撞 / 可通行网格代码；相机、暂停、天气、季节、地图切换通过真实鼠标、键盘与按钮点击触发',
    renderer: V.renderer,
    camera: V.camera,
    pause: V.pause,
    interaction: V.interaction,
    weather: V.weather,
    season: V.season,
    keyboard: V.keyboard,
    mapSwitching: { stableAcrossCycles: V.switching.stableAcrossCycles, listenerAddsDuringSwitching: V.switching.listenerAddsDuringSwitching, samples: V.switching.samples },
    viewport1366x768: V.viewports['1366x768'],
    consoleErrors: V.console.errors,
    consoleWarnings: V.console.warnings,
    rawResult: 'verification/verify_result.json',
    screenshotsReviewed: '所有截图均来自真实运行页面并已逐张人工查看（无黑屏/占位内容）；发现的问题（夜间地表过亮、雨丝被滤镜抹平、背景泛光造成雾化、村庄低洼处误出现水面、浮岛底部开口、山顶树木挡路、浅滩远岸过陡无法上岸等）已修正后重新截图',
  },
  screenshots: shots.map((f) => 'screenshots/' + f),
  knownIssues: [
    '验证环境只有 SwiftShader 软件渲染（无 GPU），因此没有真实 GPU 下的帧率数据；SwiftShader 下 1920×1080 单帧约需数百毫秒，交互流畅度需在有显卡的机器上确认',
    '绘画滤镜（24 采样 × 8 扇区）在高分屏/集成显卡上开销较大，可在面板中关闭“绘画滤镜”',
    '雨丝与雪花在叠加层绘制，不会被建筑或树冠遮挡（仅在地形以下裁剪）',
    '云雾是面片，与陡峭岩壁相交处仍可能出现轻微硬边',
    '伙伴沿足迹跟随，不做彼此避让；急转弯时可能短暂贴近',
    '角色与道具为简单几何造型，没有骨骼动画；没有音效',
    '背景渐变/云海是屏幕空间绘制，旋转相机时不随视角产生透视变化',
    '季节切换时树冠颜色为即时切换（地表为 0.9 秒渐变）',
    '移动端仅做了基础的触控旋转/缩放适配，没有虚拟摇杆',
  ],
};
fs.writeFileSync('scene_report.json', JSON.stringify(report, null, 2));
console.log('scene_report.json written,', shots.length, 'screenshots');
