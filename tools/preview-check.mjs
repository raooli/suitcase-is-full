/**
 * Cocos 预览验证夹具（无 GUI 环境的「跑一次预览」）。
 *
 * 做什么：
 *   1. （可选，`--scene <Name>`）先调 Cocos CLI 把指定场景设为启动场景重新构建
 *   2. 起一个本地静态服务器托管构建产物（默认 `build/web-mobile`）
 *   3. 用 CDP 驱动本机 Google Chrome 无头打开它（SwiftShader 软件 WebGL）
 *   4. 捕获 Console 全部输出 + 页面异常 + 一张截图
 *   5. 有 error 就 exit 1
 *
 * 为什么需要它：`05-实施计划` 要求每个任务收尾「手动在 Cocos 预览验证」，
 * 但自动化环境下没有 GUI 编辑器，只能这样拿到等价证据（引擎真的跑起来了、
 * 组件真的 onLoad 了、Console 真的没报错）。
 *
 * 用法（需要 Node ≥ 22，用到内置 WebSocket）：
 *   node tools/preview-check.mjs --scene Game            # 构建 Game.scene 再预览（推荐）
 *   node tools/preview-check.mjs --scene Game --grep [GameController]
 *   node tools/preview-check.mjs --shot /tmp/p.png --quiet   # 只复用现有构建产物
 *
 * 环境变量：COCOS_CREATOR 覆盖编辑器可执行文件路径。
 *
 * 零第三方依赖：只用 Node 内置 http / fs / child_process / WebSocket。
 */

import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CREATOR =
  process.env.COCOS_CREATOR ??
  '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';

function parseArgs(argv) {
  const out = {
    dir: 'build/web-mobile',
    wait: 12000,
    shot: null,
    quiet: false,
    grep: null,
    scene: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') out.dir = argv[++i];
    else if (a === '--wait') out.wait = Number(argv[++i]);
    else if (a === '--shot') out.shot = argv[++i];
    else if (a === '--grep') out.grep = argv[++i];
    else if (a === '--scene') out.scene = argv[++i];
    else if (a === '--quiet') out.quiet = true;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 调 Cocos CLI 构建，并把 `--scene` 指定的场景设为启动场景。
 *
 * 两个坑（本机实测）：
 * - 环境里继承了 `ELECTRON_RUN_AS_NODE=1`（宿主是 Electron 应用），会让 Cocos
 *   二进制退化成 node 而拒收参数 → 必须删掉这个环境变量。
 * - Chromium 的 GPU 沙箱在非交互环境下初始化失败 → 需要 `ELECTRON_DISABLE_SANDBOX=1`。
 * - 编辑器退出码恒为 36（关闭期 worker 收 SIGTERM），**不是**构建失败，
 *   所以判定成功看日志里的 "build Task (... ) Finished in"。
 */
async function cocosBuild(scene) {
  const metaPath = join(process.cwd(), 'assets/scenes', `${scene}.scene.meta`);
  if (!existsSync(metaPath)) throw new Error(`找不到场景 ${scene} 的 .meta：${metaPath}`);
  const uuid = JSON.parse(await readFile(metaPath, 'utf8')).uuid;
  if (!existsSync(CREATOR)) throw new Error(`找不到 Cocos 编辑器：${CREATOR}`);

  const env = { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' };
  delete env.ELECTRON_RUN_AS_NODE;

  const logPath = join(tmpdir(), 'cocos-preview-build.log');
  const logChunks = [];
  console.log(`🔨 构建 ${scene}（startScene=${uuid}）…`);
  const code = await new Promise((ok) => {
    const child = spawn(
      CREATOR,
      ['--project', process.cwd(), '--build', `platform=web-mobile;debug=true;startScene=${uuid}`],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (b) => logChunks.push(b));
    child.stderr.on('data', (b) => logChunks.push(b));
    const timer = setTimeout(() => child.kill('SIGKILL'), 10 * 60 * 1000);
    child.on('close', (c) => {
      clearTimeout(timer);
      ok(c);
    });
  });

  const log = Buffer.concat(logChunks).toString('utf8');
  await writeFile(logPath, log);
  if (!/build Task \(web-mobile\) Finished in/.test(log)) {
    console.error(`❌ 构建失败（退出码 ${code}），完整日志：${logPath}`);
    const tail = log.split('\n').filter((l) => /error|Error|fail/.test(l)).slice(-12);
    for (const l of tail) console.error(`  ${l.trim().slice(0, 200)}`);
    process.exit(2);
  }
  console.log(`✅ 构建完成（退出码 ${code}，日志 ${logPath}）`);
}


const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

function startServer(root) {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, '');
      const file = join(root, rel);
      if (!file.startsWith(root)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const s = await stat(file);
      if (s.isDirectory()) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function cdp(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, bad) => {
    ws.onopen = ok;
    ws.onerror = () => bad(new Error('CDP WebSocket 连接失败'));
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? bad(new Error(JSON.stringify(msg.error))) : ok(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  return {
    send(method, params = {}) {
      const mid = ++id;
      return new Promise((ok, bad) => {
        pending.set(mid, { ok, bad });
        ws.send(JSON.stringify({ id: mid, method, params }));
        setTimeout(() => {
          if (pending.has(mid)) {
            pending.delete(mid);
            bad(new Error(`${method} 超时`));
          }
        }, 30000);
      });
    },
    on(fn) {
      listeners.push(fn);
    },
    close() {
      try {
        ws.close();
      } catch {}
    },
  };
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (Number.isNaN(major) || major < 22) {
    console.error(`❌ 需要 Node ≥ 22（用到内置 WebSocket），当前 ${process.versions.node}`);
    process.exit(2);
  }

  const args = parseArgs(process.argv.slice(2));
  if (args.scene) await cocosBuild(args.scene);

  const root = resolve(process.cwd(), args.dir);
  if (!existsSync(join(root, 'index.html'))) {
    console.error(`❌ 预览目录里没有 index.html：${root}\n   先跑一次 Cocos 构建（platform=web-mobile）`);
    process.exit(2);
  }
  if (!existsSync(CHROME)) {
    console.error(`❌ 未找到 Chrome：${CHROME}`);
    process.exit(2);
  }

  const server = await startServer(root);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;

  const profile = join(tmpdir(), `cocos-preview-${Date.now()}`);
  const debugPort = 9200 + Math.floor(Math.random() * 300);
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--mute-audio',
      '--window-size=720,1280',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const logs = [];
  const errors = [];
  /** 待展开的对象参数（Console 里传对象时只能拿到 objectId，要回一趟 CDP 序列化） */
  const expansions = [];
  let session = null;

  /** 把一条 Console 参数渲染成可读文本；对象参数走 CDP 序列化 */
  function renderArg(arg) {
    if (arg.value !== undefined) return String(arg.value);
    if (arg.unserializableValue !== undefined) return arg.unserializableValue;
    if (arg.objectId !== undefined) {
      if (arg.subtype === 'null') return 'null';
      const p = session
        .send('Runtime.callFunctionOn', {
          objectId: arg.objectId,
          functionDeclaration: 'function () { try { return JSON.stringify(this); } catch (e) { return String(this); } }',
          returnByValue: true,
        })
        .then((r) => r.result?.value ?? arg.description ?? '«object»')
        .catch(() => arg.description ?? '«object»');
      expansions.push(p);
      return p;
    }
    return arg.description ?? '';
  }

  /** 把参数里的 Promise 展开后拼成一行 */
  async function renderLine(parts) {
    const resolved = await Promise.all(parts);
    return resolved.join(' ');
  }

  const cleanup = () => {
    try {
      session?.close();
    } catch {}
    try {
      chrome.kill('SIGKILL');
    } catch {}
    try {
      server.close();
    } catch {}
  };

  try {
    // 等 CDP 端口起来
    let version = null;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        version = await r.json();
        break;
      } catch {
        await sleep(250);
      }
    }
    if (!version) throw new Error('Chrome 调试端口未就绪');

    const put = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
      method: 'PUT',
    });
    const target = await put.json();
    session = await cdp(target.webSocketDebuggerUrl);

    session.on((msg) => {
      if (msg.method === 'Runtime.consoleAPICalled') {
        const parts = (msg.params.args || []).map(renderArg);
        logs.push({ type: msg.params.type, benign: msg.params.type !== 'error', parts });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        const text = `${d.text ?? ''} ${d.exception?.description ?? ''}`.trim();
        logs.push({ type: 'exception', benign: false, parts: [text] });
      } else if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry || {};
        // favicon.ico 的 404 是浏览器行为，不是游戏的问题，忽略
        if ((e.url ?? '').endsWith('/favicon.ico')) return;
        if (e.level === 'error') {
          logs.push({ type: 'log', benign: false, parts: [e.text ?? '', e.url ?? ''] });
        }
      }
    });

    await session.send('Runtime.enable');
    await session.send('Log.enable');
    await session.send('Page.enable');
    await session.send('Page.navigate', { url });

    await sleep(args.wait);

    if (args.shot) {
      const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
      const { writeFile } = await import('node:fs/promises');
      await writeFile(args.shot, Buffer.from(data, 'base64'));
      console.log(`📷 截图：${args.shot}`);
    }
  } catch (e) {
    console.error(`❌ 预览失败：${e.message}`);
    cleanup();
    process.exit(2);
  }

  cleanup();

  // 展开对象参数（Console 传的是 objectId）后渲染成文本
  const rendered = [];
  for (const entry of logs) {
    rendered.push({ text: `[${entry.type}] ${await renderLine(entry.parts)}`, benign: entry.benign });
  }
  const failed = rendered.filter((l) => !l.benign);

  const interesting = args.grep ? rendered.filter((l) => l.text.includes(args.grep)) : rendered;
  if (!args.quiet) {
    console.log(
      `—— Console（${rendered.length} 行${args.grep ? `，匹配 ${args.grep} 的 ${interesting.length} 行` : ''}）——`,
    );
    for (const l of interesting.slice(-80)) console.log(`  ${l.text}`);
  }

  if (failed.length > 0) {
    console.error(`\n❌ 预览 Console 有 ${failed.length} 条错误：`);
    for (const l of failed.slice(0, 20)) console.error(`  ${l.text}`);
    process.exit(1);
  }
  console.log(`✅ 预览无 Console 错误（捕获 ${rendered.length} 行日志）`);
  process.exit(0);
}

main();
