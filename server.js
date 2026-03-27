import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import cookieParser from "cookie-parser";

const app = express();
app.disable("x-powered-by");

const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.json());

// --------------------------------------
// PostgreSQL 接続
// --------------------------------------
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --------------------------------------
// ニコニコ サムネイルURL生成
// --------------------------------------
function getNicoThumbnail(videoId) {
  const numericId = videoId.replace(/^[a-z]+/, "");
  return `https://nicovideo.cdn.nimg.jp/thumbnails/${numericId}/${numericId}`;
}

// --------------------------------------
// ニコニコ 再生数フォーマット
// --------------------------------------
function formatCount(n) {
  if (!n) return "0";
  if (n >= 10000) return Math.floor(n / 10000) + "万";
  return String(n);
}

// --------------------------------------
// 共通CSS（ニコニコテーマ）
// --------------------------------------
const CSS = `
<style>
  body {
    font-family: "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    background: #f5f5f5;
    margin: 0;
    padding: 0;
    color: #333;
  }

  h2 {
    margin-bottom: 20px;
    color: #1a1a1a;
    text-align: center;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 50px;
    height: 100%;
    background: #252525;
    border-right: 3px solid #e6370e;
    padding-top: 60px;
    transition: width 0.25s ease;
    overflow: hidden;
    z-index: 1000;
  }

  .sidebar.open {
    width: 220px;
  }

  .sidebar a {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    font-size: 15px;
    color: #eee;
    text-decoration: none;
    white-space: nowrap;
  }

  .sidebar a:hover {
    background: #3a3a3a;
    color: #ff6633;
  }

  .sidebar-icon {
    font-size: 20px;
    min-width: 20px;
  }

  .main-content {
    margin-left: 80px;
    padding: 20px;
    transition: margin-left 0.25s ease;
  }

  .main-content.shift {
    margin-left: 240px;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
    padding: 16px;
  }

  .card {
    background: white;
    padding: 10px;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    cursor: pointer;
  }

  .card:hover {
    transform: translateY(-3px);
    box-shadow: 0 6px 14px rgba(230,55,14,0.2);
  }

  .thumb {
    width: 100%;
    border-radius: 6px;
    aspect-ratio: 16/9;
    object-fit: cover;
    background: #111;
  }

  .center-box {
    max-width: 380px;
    margin: 80px auto;
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  }

  .site-logo {
    text-align: center;
    margin-bottom: 24px;
    font-size: 26px;
    font-weight: bold;
    color: #e6370e;
    letter-spacing: 1px;
  }

  input, button, select {
    width: 100%;
    padding: 12px 14px;
    font-size: 15px;
    border-radius: 8px;
    border: 1px solid #ccc;
    margin-bottom: 12px;
    box-sizing: border-box;
  }

  button {
    background: #e6370e;
    color: white;
    border: none;
    cursor: pointer;
    font-weight: bold;
  }

  button:hover {
    background: #c02d0b;
  }

  select {
    background: white;
    cursor: pointer;
  }

  select:hover {
    border-color: #e6370e;
  }

  /* 設定ページ */
  .settings-box {
    max-width: 560px;
    margin: 40px auto;
    background: white;
    padding: 32px;
    border-radius: 14px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  }
  .settings-box h3 {
    font-size: 14px;
    color: #666;
    margin-bottom: 18px;
  }
  .mode-card {
    border: 2px solid #ddd;
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 14px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
  }
  .mode-card:hover {
    border-color: #e6370e;
    background: #fff5f3;
  }
  .mode-card.selected {
    border-color: #e6370e;
    background: #fff0ee;
  }
  .mode-card label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
  }
  .mode-card input[type=radio] {
    width: auto;
    margin: 3px 0 0;
    flex-shrink: 0;
  }
  .mode-card strong {
    display: block;
    font-size: 15px;
    margin-bottom: 4px;
    color: #1a1a1a;
  }
  .mode-card p {
    margin: 0;
    font-size: 13px;
    color: #666;
    line-height: 1.5;
  }
  .current-mode-badge {
    display: inline-block;
    background: #e6370e;
    color: white;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 20px;
    margin-left: 8px;
    vertical-align: middle;
  }

  /* 視聴ページ */
  .watch-layout {
    display: flex;
    gap: 24px;
    max-width: 1280px;
    margin: 0 auto;
    padding: 20px;
    align-items: flex-start;
  }
  .watch-player { flex: 1; min-width: 0; }
  .iframe-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
  }
  .iframe-wrap iframe {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    border-radius: 10px;
    border: none;
  }
  .watch-related {
    width: 360px;
    flex-shrink: 0;
    max-height: 90vh;
    overflow-y: auto;
  }
  .watch-related h3 { font-size:14px; margin-bottom:12px; color:#1a1a1a; border-bottom: 2px solid #e6370e; padding-bottom: 6px; }
  .action-bar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
  .action-bar button, .action-bar a {
    width:auto; padding:7px 12px; font-size:13px; border-radius:6px; margin-bottom:0;
    text-decoration:none; display:inline-flex; align-items:center; gap:4px;
  }
  @media (max-width:900px) {
    .watch-layout { flex-direction:column; }
    .watch-related { width:100%; }
  }

  .view-count {
    font-size: 12px;
    color: #999;
    margin-top: 4px;
  }

  .video-title-card {
    font-size: 13px;
    font-weight: bold;
    margin-top: 6px;
    line-height: 1.4;
    color: #333;
  }
</style>
`;

// --------------------------------------
// サイドバー HTML
// --------------------------------------
const SIDEBAR_HTML = `
<div id="sidebar" class="sidebar">
  <a href="/"><span class="sidebar-icon">🏠</span> <span class="sidebar-text">ホーム</span></a>
  <a href="/tag-search"><span class="sidebar-icon">🏷️</span> <span class="sidebar-text">タグ検索</span></a>
  <a href="/ranking"><span class="sidebar-icon">📊</span> <span class="sidebar-text">ランキング</span></a>
  <a href="/favorites"><span class="sidebar-icon">⭐</span> <span class="sidebar-text">お気に入り</span></a>
  <a href="/history"><span class="sidebar-icon">🕘</span> <span class="sidebar-text">履歴</span></a>
  <a href="/settings"><span class="sidebar-icon">⚙️</span> <span class="sidebar-text">設定</span></a>
  <a href="/admin"><span class="sidebar-icon">🛡️</span> <span class="sidebar-text">管理者</span></a>
  <a href="/logout"><span class="sidebar-icon">🚪</span> <span class="sidebar-text">ログアウト</span></a>
</div>
`;

// --------------------------------------
// サイドバー JS
// --------------------------------------
const SIDEBAR_JS = `
<script>
const sidebar = document.getElementById("sidebar");
const main = document.getElementById("main-content");

sidebar.addEventListener("mouseenter", () => {
  sidebar.classList.add("open");
  if (main) main.classList.add("shift");
});

sidebar.addEventListener("mouseleave", () => {
  sidebar.classList.remove("open");
  if (main) main.classList.remove("shift");
});
</script>
`;

// --------------------------------------
// ユーザー管理
// --------------------------------------
function loadUsers() {
  if (!fs.existsSync("users.json")) return [];
  return JSON.parse(fs.readFileSync("users.json", "utf8"));
}

async function saveHistory(user, keyword, videoId, title) {
  const params = [user, keyword, videoId, title];
  await Promise.allSettled([
    pool.query(
      "INSERT INTO history (user_id, query, video_id, title) VALUES ($1, $2, $3, $4)",
      params
    ),
    pool.query(
      "INSERT INTO admin_history (user_id, query, video_id, title) VALUES ($1, $2, $3, $4)",
      params
    )
  ]);
}

function formatDateJP(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  const weekdays = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];
  const weekday = weekdays[d.getDay()];
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds} (${weekday})`;
}

// --------------------------------------
// ログイン
// --------------------------------------
app.get("/login", (req, res) => {
  res.send(`
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>ログイン - NicoViewer</title>
    </head>
    <body>
      <div class="center-box">
        <div class="site-logo">▶ NicoViewer</div>
        <h2 style="font-size:18px;">ログイン</h2>
        <form method="POST" action="/login">
          <input name="user" placeholder="ユーザー名" required>
          <input name="pass" type="password" placeholder="パスワード" required>
          <button>ログイン</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post("/login", (req, res) => {
  const { user, pass } = req.body;
  const users = loadUsers();
  const found = users.find(u => u.user === user && u.pass === pass);
  if (!found) return res.send("ユーザー名またはパスワードが違います");
  res.cookie("user", user, { httpOnly: true });
  res.redirect("/");
});

// --------------------------------------
// ホーム（動画検索）
// --------------------------------------
app.get("/", (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");

  res.send(`
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>NicoViewer</title>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <h2>🎬 動画検索</h2>
        <div style="max-width:700px;margin:0 auto;">
          <form action="/search" method="post">
            <input type="text" name="q" placeholder="検索キーワードを入力..." autofocus>
            <select name="sort">
              <option value="-viewCounter">再生数が多い順</option>
              <option value="-startTime">投稿が新しい順</option>
              <option value="+startTime">投稿が古い順</option>
              <option value="-commentCounter">コメントが多い順</option>
              <option value="-mylistCounter">マイリストが多い順</option>
            </select>
            <button type="submit">🔍 検索</button>
          </form>
        </div>
      </div>
      ${SIDEBAR_JS}
    </body>
    </html>
  `);
});

// --------------------------------------
// ニコニコ Snapshot Search API
// --------------------------------------
async function searchNicovideo(query, sort = "-viewCounter", targets = "title,description,tags", limit = 60) {
  const params = new URLSearchParams({
    q: query,
    targets,
    fields: "contentId,title,viewCounter,commentCounter,thumbnailUrl,userId,channelId,startTime,tags",
    _sort: sort,
    _limit: String(Math.min(limit, 100)),
    _context: "NicoViewer"
  });

  const url = `https://snapshot.nicovideo.jp/api/v2/snapshot/video/contents/search?${params}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "NicoViewer/1.0" },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) throw new Error(`Snapshot API エラー: ${res.status}`);

  const data = await res.json();
  return data.data || [];
}

// --------------------------------------
// 動画検索結果
// --------------------------------------
app.post("/search", async (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");

  const q = req.body.q;
  const sort = req.body.sort || "-viewCounter";
  if (!q) return res.send("検索ワードがありません");

  let videos = [];
  let errorMsg = "";

  try {
    videos = await searchNicovideo(q, sort);
  } catch (e) {
    console.error("検索エラー:", e);
    errorMsg = `<p style="color:#e6370e;text-align:center;">検索に失敗しました: ${e.message}</p>`;
  }

  const sortLabels = {
    "-viewCounter": "再生数が多い順",
    "-startTime": "投稿が新しい順",
    "+startTime": "投稿が古い順",
    "-commentCounter": "コメントが多い順",
    "-mylistCounter": "マイリストが多い順"
  };

  const cards = videos.map(v => {
    const thumb = v.thumbnailUrl || getNicoThumbnail(v.contentId);
    const views = formatCount(v.viewCounter);
    const comments = formatCount(v.commentCounter);
    return `
      <div class="card" onclick="postWatch('${v.contentId}')">
        <img class="thumb" src="${thumb}" loading="lazy"
             onerror="this.src='https://nicovideo.cdn.nimg.jp/thumbnails/0/0'">
        <div class="video-title-card">${escapeHtml(v.title)}</div>
        <div class="view-count">▶ ${views}  💬 ${comments}</div>
      </div>
    `;
  }).join("");

  res.send(`
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>「${escapeHtml(q)}」の検索結果 - NicoViewer</title>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <h2>「${escapeHtml(q)}」の検索結果（${sortLabels[sort] || sort}）</h2>
        ${errorMsg}
        <div class="card-grid">${cards}</div>
        ${videos.length === 0 && !errorMsg ? '<p style="text-align:center;color:#999;">動画が見つかりませんでした</p>' : ""}
      </div>
      ${SIDEBAR_JS}
      <script>
        function postWatch(id) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/watch";
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "id";
          input.value = id;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
        }
      </script>
    </body>
    </html>
  `);
});

// --------------------------------------
// タグ検索ページ
// --------------------------------------
app.get("/tag-search", (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");

  res.send(`
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>タグ検索 - NicoViewer</title>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <h2>🏷️ タグ検索</h2>
        <div style="max-width:700px;margin:0 auto;">
          <form action="/tag-search/result" method="post">
            <input type="text" name="tag" placeholder="タグ名を入力（例: VOCALOID、MMD）" autofocus>
            <select name="sort">
              <option value="-viewCounter">再生数が多い順</option>
              <option value="-startTime">投稿が新しい順</option>
              <option value="-commentCounter">コメントが多い順</option>
              <option value="-mylistCounter">マイリストが多い順</option>
            </select>
            <button type="submit">🔍 タグで検索</button>
          </form>
        </div>
      </div>
      ${SIDEBAR_JS}
    </body>
    </html>
  `);
});

app.post("/tag-search/result", async (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");

  const tag = req.body.tag;
  const sort = req.body.sort || "-viewCounter";
  if (!tag) return res.send("タグが入力されていません");

  let videos = [];
  let errorMsg = "";

  try {
    videos = await searchNicovideo(tag, sort, "tags");
  } catch (e) {
    errorMsg = `<p style="color:#e6370e;text-align:center;">検索に失敗しました: ${e.message}</p>`;
  }

  const cards = videos.map(v => {
    const thumb = v.thumbnailUrl || getNicoThumbnail(v.contentId);
    return `
      <div class="card" onclick="postWatch('${v.contentId}')">
        <img class="thumb" src="${thumb}" loading="lazy">
        <div class="video-title-card">${escapeHtml(v.title)}</div>
        <div class="view-count">▶ ${formatCount(v.viewCounter)}  💬 ${formatCount(v.commentCounter)}</div>
      </div>
    `;
  }).join("");

  res.send(`
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>タグ「${escapeHtml(tag)}」- NicoViewer</title>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <h2>🏷️ タグ「${escapeHtml(tag)}」の動画</h2>
        ${errorMsg}
        <div class="card-grid">${cards}</div>
        ${videos.length === 0 && !errorMsg ? '<p style="text-align:center;color:#999;">動画が見つかりませんでした</p>' : ""}
      </div>
      ${SIDEBAR_JS}
      <script>
        function postWatch(id) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/watch";
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "id";
          input.value = id;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
        }
      </script>
    </body>
    </html>
  `);
});

// --------------------------------------
// ランキングページ
// --------------------------------------
const RANKING_GENRES = [
  { id: "all", label: "総合" },
  { id: "entertainment", label: "エンタメ・音楽" },
  { id: "radio", label: "ラジオ" },
  { id: "music_sound", label: "音楽・サウンド" },
  { id: "dance", label: "ダンス" },
  { id: "animal", label: "動物" },
  { id: "nature", label: "自然" },
  { id: "cooking", label: "料理" },
  { id: "traveling_outdoor", label: "旅行・アウトドア" },
  { id: "sports", label: "スポーツ" },
  { id: "society_politics_news", label: "社会・政治・時事" },
  { id: "technology_craft", label: "技術・工作" },
  { id: "commentary_lecture", label: "解説・講座" },
  { id: "anime", label: "アニメ" },
  { id: "game", label: "ゲーム" },
  { id: "other", label: "その他" }
];

app.get("/ranking", async (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");

  const genre = req.query.genre || "all";
  const genreLabel = RANKING_GENRES.find(g => g.id === genre)?.label || "総合";

  // Snapshot APIでランキング相当（再生数が多い・直近30日）
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] + "T00:00:00+09:00";

  let videos = [];
  let errorMsg = "";

  try {
    const params = new URLSearchParams({
      q: genre === "all" ? "" : genreLabel,
      targets: genre === "all" ? "tags" : "tags",
      fields: "contentId,title,viewCounter,commentCounter,thumbnailUrl,startTime",
      _sort: "-viewCounter",
      _limit: "60",
      _context: "NicoViewer"
    });

    // ジャンル絞り込み（全体の場合は人気動画を広く取る）
    if (genre === "all") {
      params.set("q", "a");  // ダミーワードでヒット数最大化、実際はフィルターなし
      params.set("targets", "title");
    }

    const apiRes = await fetch(
      `https://snapshot.nicovideo.jp/api/v2/snapshot/video/contents/search?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await apiRes.json();
    videos = data.data || [];
  } catch (e) {
    errorMsg = `<p style="color:#e6370e;text-align:center;">取得に失敗しました: ${e.message}</p>`;
  }

  const genreOptions = RANKING_GENRES.map(g =>
    `<option value="${g.id}"${g.id === genre ? " selected" : ""}>${g.label}</option>`
  ).join("");

  const cards = videos.map((v, i) => {
    const thumb = v.thumbnailUrl || getNicoThumbnail(v.contentId);
    return `
      <div class="card" onclick="postWatch('${v.contentId}')">
        <div style="position:relative;">
          <img class="thumb" src="${thumb}" loading="lazy">
          <div style="position:absolute;top:4px;left:4px;background:rgba(230,55,14,0.9);color:white;font-size:12px;font-weight:bold;padding:2px 6px;border-radius:4px;">${i + 1}</div>
        </div>
        <div class="video-title-card">${escapeHtml(v.title)}</div>
        <div class="view-count">▶ ${formatCount(v.viewCounter)}  💬 ${formatCount(v.commentCounter)}</div>
      </div>
    `;
  }).join("");

  res.send(`
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>ランキング - NicoViewer</title>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <h2>📊 ランキング</h2>
        <div style="max-width:400px;margin:0 auto 20px;">
          <form method="get" action="/ranking">
            <select name="genre" onchange="this.form.submit()">${genreOptions}</select>
          </form>
        </div>
        ${errorMsg}
        <div class="card-grid">${cards}</div>
      </div>
      ${SIDEBAR_JS}
      <script>
        function postWatch(id) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/watch";
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "id";
          input.value = id;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
        }
      </script>
    </body>
    </html>
  `);
});

// --------------------------------------
// 動画視聴
// --------------------------------------
app.post("/watch", async (req, res) => {
  const id = req.body.id;
  if (!id) return res.send("動画IDがありません");

  // ニコニコ動画IDバリデーション（sm, nm, so, lv, user 等）
  if (!/^[a-z]{2}\d+$/.test(id)) return res.send("動画IDが正しくありません");

  const user = req.cookies.user;
  if (!user) return res.redirect("/login");

  const playbackMode = req.cookies.playbackMode || "embed";

  // ニコニコへリダイレクトモード
  if (playbackMode === "nicovideo") {
    // 履歴だけ保存してリダイレクト
    let title = id;
    try {
      const info = await getNicoVideoInfo(id);
      title = info.title;
    } catch (e) { /* ignore */ }
    saveHistory(user, "watch", id, title).catch(console.error);
    return res.redirect(`https://www.nicovideo.jp/watch/${id}`);
  }

  // 埋め込みモード（デフォルト）
  let videoInfo = { title: id, tags: [], viewCounter: 0, commentCounter: 0, userId: null, channelId: null };
  try {
    videoInfo = await getNicoVideoInfo(id);
    saveHistory(user, "watch", id, videoInfo.title).catch(console.error);
  } catch (e) {
    console.error("動画情報取得失敗:", e.message);
  }

  // 関連動画（最初のタグで検索）
  let related = [];
  try {
    if (videoInfo.tags && videoInfo.tags.length > 0) {
      const firstTag = videoInfo.tags[0];
      const relatedVideos = await searchNicovideo(firstTag, "-viewCounter", "tags", 20);
      related = relatedVideos.filter(v => v.contentId !== id);
    }
  } catch (e) { /* ignore */ }

  const relatedHTML = related.length > 0
    ? related.map(v => {
        const thumb = v.thumbnailUrl || getNicoThumbnail(v.contentId);
        return `
          <div onclick="postWatch('${v.contentId}')" style="display:flex;gap:8px;margin-bottom:10px;cursor:pointer;align-items:flex-start;">
            <img src="${thumb}" loading="lazy"
                 style="width:140px;height:79px;border-radius:6px;object-fit:cover;flex-shrink:0;background:#111;">
            <div>
              <div style="font-size:12px;font-weight:bold;line-height:1.4;color:#333;">${escapeHtml(v.title)}</div>
              <div style="font-size:11px;color:#999;margin-top:3px;">▶ ${formatCount(v.viewCounter)}</div>
            </div>
          </div>
        `;
      }).join("")
    : `<p style="color:#999;font-size:12px;">関連動画を取得できませんでした</p>`;

  const thumb = getNicoThumbnail(id);
  const embedUrl = `https://embed.nicovideo.jp/watch/${id}?jsapi=1&noRelatedVideo=0`;
  const titleEscaped = videoInfo.title.replace(/`/g, "\\`");

  res.send(`
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(videoInfo.title)} - NicoViewer</title>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <div class="watch-layout">
          <!-- 左：プレイヤー -->
          <div class="watch-player">
            <h2 style="font-size:17px;margin-bottom:8px;text-align:left;">${escapeHtml(videoInfo.title)}</h2>
            <div class="action-bar">
              <button onclick="addFav('${id}', \`${titleEscaped}\`)"
                style="background:#f0a500;color:#000;">
                ⭐ お気に入り追加
              </button>
              <a href="https://www.nicovideo.jp/watch/${id}" target="_blank"
                style="background:#252525;color:white;">
                🔗 ニコニコで開く
              </a>
              <a href="/settings" style="background:#888;color:white;">
                ⚙️ 設定
              </a>
            </div>

            <div style="font-size:13px;color:#666;margin-bottom:10px;">
              ▶ ${formatCount(videoInfo.viewCounter)} 再生　
              💬 ${formatCount(videoInfo.commentCounter)} コメント
              ${videoInfo.startTime ? "　📅 " + videoInfo.startTime.substring(0, 10) : ""}
            </div>

            <div class="iframe-wrap">
              <iframe src="${embedUrl}"
                allowfullscreen
                allow="autoplay; fullscreen">
              </iframe>
            </div>

            <div style="margin-top:12px;font-size:13px;">
              <a href="/" style="color:#e6370e;">← ホームへ戻る</a>
            </div>

            ${videoInfo.tags && videoInfo.tags.length > 0 ? `
              <div style="margin-top:14px;">
                <div style="font-size:13px;font-weight:bold;margin-bottom:6px;color:#555;">🏷️ タグ</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                  ${videoInfo.tags.slice(0, 12).map(tag => `
                    <a href="/tag-search/result" onclick="tagSearch('${escapeHtml(tag)}');return false;"
                       style="background:#f0f0f0;color:#555;padding:3px 10px;border-radius:20px;font-size:12px;text-decoration:none;cursor:pointer;">
                      ${escapeHtml(tag)}
                    </a>
                  `).join("")}
                </div>
              </div>
            ` : ""}
          </div>

          <!-- 右：関連動画 -->
          <div class="watch-related">
            <h3>関連動画</h3>
            ${relatedHTML}
          </div>
        </div>
      </div>
      ${SIDEBAR_JS}
      <script>
        function addFav(id, title) {
          fetch("/favorite/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: id, title: title })
          })
          .then(r => r.json())
          .then(data => {
            if (data.ok) alert("お気に入りに追加しました");
            else if (data.duplicate) alert("すでにお気に入り登録済みです");
            else alert("エラーが発生しました");
          })
          .catch(() => alert("通信エラー"));
        }

        function postWatch(id) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/watch";
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "id";
          input.value = id;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
        }

        function tagSearch(tag) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/tag-search/result";
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "tag";
          input.value = tag;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
        }
      </script>
    </body>
    </html>
  `);
});

// --------------------------------------
// ニコニコ動画情報取得（Snapshot API）
// --------------------------------------
async function getNicoVideoInfo(videoId) {
  const params = new URLSearchParams({
    q: videoId,
    targets: "contentId",
    fields: "contentId,title,viewCounter,commentCounter,mylistCounter,tags,startTime,userId,channelId",
    _limit: "1",
    _context: "NicoViewer"
  });

  const res = await fetch(
    `https://snapshot.nicovideo.jp/api/v2/snapshot/video/contents/search?${params}`,
    { signal: AbortSignal.timeout(6000) }
  );

  const data = await res.json();
  const item = (data.data || [])[0];
  if (!item) throw new Error("動画が見つかりません");

  return {
    title: item.title || videoId,
    viewCounter: item.viewCounter || 0,
    commentCounter: item.commentCounter || 0,
    mylistCounter: item.mylistCounter || 0,
    tags: (item.tags || "").split(" ").filter(Boolean),
    startTime: item.startTime || "",
    userId: item.userId || null,
    channelId: item.channelId || null
  };
}

// --------------------------------------
// 設定ページ
// --------------------------------------
app.get("/settings", (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");

  const currentMode = req.cookies.playbackMode || "embed";

  const modes = [
    {
      value: "embed",
      icon: "▶",
      label: "埋め込み再生（推奨）",
      desc: "このサイト内でニコニコ動画を埋め込んで再生します。コメントも表示されます。"
    },
    {
      value: "nicovideo",
      icon: "🔗",
      label: "ニコニコ動画で開く",
      desc: "動画をニコニコ動画の公式サイトで開きます。ニコニコアカウントが必要です。"
    }
  ];

  const modeCards = modes.map(m => `
    <div class="mode-card${currentMode === m.value ? " selected" : ""}" onclick="selectMode('${m.value}')">
      <label>
        <input type="radio" name="playbackMode" value="${m.value}"${currentMode === m.value ? " checked" : ""}>
        <div>
          <strong>${m.icon} ${m.label}${currentMode === m.value ? '<span class="current-mode-badge">現在</span>' : ''}</strong>
          <p>${m.desc}</p>
        </div>
      </label>
    </div>
  `).join("");

  res.send(`
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>設定 - NicoViewer</title>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <div class="settings-box">
          <h2>⚙️ 設定</h2>
          <h3>再生方法を選択してください。設定はブラウザのCookieに保存されます。</h3>
          ${modeCards}
          <button onclick="saveSettings()" style="margin-top:10px;background:#27ae60;">
            💾 設定を保存
          </button>
          <div id="msg" style="margin-top:12px;color:#27ae60;font-size:14px;display:none;"></div>
        </div>
      </div>
      ${SIDEBAR_JS}
      <script>
        function selectMode(val) {
          document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
          const card = document.querySelector('.mode-card input[value="' + val + '"]');
          if (card) {
            card.checked = true;
            card.closest('.mode-card').classList.add('selected');
          }
        }

        function saveSettings() {
          const selected = document.querySelector('input[name="playbackMode"]:checked');
          if (!selected) return;
          const mode = selected.value;
          document.cookie = "playbackMode=" + mode + "; path=/; max-age=31536000";
          const msg = document.getElementById("msg");
          msg.style.display = "block";
          const labels = { embed: "埋め込み再生", nicovideo: "ニコニコ動画で開く" };
          msg.textContent = "✅ 再生方法を「" + (labels[mode] || mode) + "」に保存しました。";
          setTimeout(() => { msg.style.display = "none"; }, 3000);
        }
      </script>
    </body>
    </html>
  `);
});

// --------------------------------------
// お気に入り機能
// --------------------------------------
app.get("/favorites", async (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");

  const result = await pool.query(
    "SELECT * FROM favorites WHERE user_id = $1 ORDER BY created_at DESC",
    [user]
  );

  const list = result.rows.map(v => {
    const thumb = getNicoThumbnail(v.video_id);
    return `
      <div class="card" onclick="postWatch('${v.video_id}')">
        <img class="thumb" src="${thumb}" loading="lazy"
             onerror="this.src='https://nicovideo.cdn.nimg.jp/thumbnails/0/0'">
        <div class="video-title-card">${escapeHtml(v.title)}</div>
        <form action="/favorite/remove" method="post" style="margin-top:6px;">
          <input type="hidden" name="videoId" value="${v.video_id}">
          <button style="background:#e74c3c;font-size:12px;padding:6px;">🗑️ 削除</button>
        </form>
      </div>
    `;
  }).join("");

  res.send(`
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>お気に入り - NicoViewer</title>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <h2>⭐ お気に入り（${result.rows.length}件）</h2>
        ${result.rows.length === 0 ? '<p style="text-align:center;color:#999;">お気に入りはまだありません</p>' : ""}
        <div class="card-grid">${list}</div>
      </div>
      ${SIDEBAR_JS}
      <script>
        function postWatch(id) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/watch";
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "id";
          input.value = id;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
        }
      </script>
    </body>
    </html>
  `);
});

app.post("/favorite/add", async (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });

  const { videoId, title } = req.body;
  if (!videoId || !title) return res.status(400).json({ ok: false, error: "missing params" });

  try {
    const existing = await pool.query(
      "SELECT 1 FROM favorites WHERE user_id = $1 AND video_id = $2",
      [user, videoId]
    );
    if (existing.rows.length > 0) {
      return res.json({ ok: false, duplicate: true });
    }
    await pool.query(
      "INSERT INTO favorites (user_id, video_id, title) VALUES ($1, $2, $3)",
      [user, videoId, title]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("お気に入り追加エラー:", e);
    res.json({ ok: false, error: e.message });
  }
});

app.post("/favorite/remove", async (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");
  const { videoId } = req.body;
  await pool.query("DELETE FROM favorites WHERE user_id = $1 AND video_id = $2", [user, videoId]);
  res.redirect("/favorites");
});

// --------------------------------------
// 履歴ページ
// --------------------------------------
app.get("/history", async (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");

  const result = await pool.query(
    `SELECT query, video_id, title, created_at
     FROM history
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [user]
  );

  const data = result.rows;

  let html = `
    <html>
    <head>
      ${CSS}
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>視聴履歴 - NicoViewer</title>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <h2>${escapeHtml(user)} さんの視聴履歴（${data.length}件）</h2>
        <form action="/history/delete" method="POST" style="text-align:center;margin-bottom:16px;">
          <button style="width:200px;background:#e74c3c;">🗑️ 履歴をすべて削除</button>
        </form>
  `;

  html += data.map(item => {
    const thumb = getNicoThumbnail(item.video_id);
    return `
      <div style="background:white;border-radius:8px;padding:10px;margin-bottom:10px;display:flex;gap:12px;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);cursor:pointer;"
           onclick="postWatch('${item.video_id}')">
        <img src="${thumb}" loading="lazy"
             style="width:120px;height:68px;border-radius:6px;object-fit:cover;flex-shrink:0;background:#111;">
        <div>
          <div style="font-size:11px;color:#999;">${formatDateJP(item.created_at)}</div>
          <div style="font-weight:bold;color:#1a1a1a;font-size:14px;margin-top:2px;">${escapeHtml(item.title)}</div>
          <div style="font-size:11px;color:#aaa;margin-top:2px;">${item.video_id}</div>
        </div>
      </div>
    `;
  }).join("");

  html += `
      </div>
      ${SIDEBAR_JS}
      <script>
        function postWatch(id) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/watch";
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "id";
          input.value = id;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
        }
      </script>
    </body>
    </html>
  `;

  res.send(html);
});

app.post("/history/delete", async (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.redirect("/login");
  await pool.query("DELETE FROM history WHERE user_id = $1", [user]);
  res.redirect("/history");
});

// --------------------------------------
// 管理者ページ
// --------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

app.get("/admin", (req, res) => {
  const user = req.cookies.user;
  const pass = req.query.pass;

  if (!user) return res.redirect("/login");
  if (user !== "hinata") return res.send("あなたには管理者ページへのアクセス権がありません");

  if (pass !== ADMIN_PASSWORD) {
    return res.send(`
      <html>
      <head>${CSS}</head>
      <body>
        ${SIDEBAR_HTML}
        <div id="main-content" class="main-content">
          <div class="center-box">
            <h2>🛡️ 管理者ログイン</h2>
            <form>
              <input name="pass" type="password" placeholder="管理者パスワード" required>
              <button>ログイン</button>
            </form>
          </div>
        </div>
        ${SIDEBAR_JS}
      </body>
      </html>
    `);
  }

  res.send(`
    <form id="f" method="POST" action="/admin">
      <input type="hidden" name="pass" value="${ADMIN_PASSWORD}">
    </form>
    <script>document.getElementById("f").submit();</script>
  `);
});

app.post("/admin", async (req, res) => {
  const pass = req.body.pass;
  if (pass !== ADMIN_PASSWORD) return res.send("パスワードが違います");

  const result = await pool.query(
    `SELECT user_id, query, video_id, title, created_at FROM admin_history ORDER BY created_at DESC`
  );

  const historyByUser = {};
  for (const row of result.rows) {
    if (!historyByUser[row.user_id]) historyByUser[row.user_id] = [];
    historyByUser[row.user_id].push(row);
  }

  let allHistoryHTML = "";
  let deleteButtonsHTML = "";

  for (const userName in historyByUser) {
    const data = historyByUser[userName];
    allHistoryHTML += `<h3 style="color:#e6370e;margin-top:20px;">${escapeHtml(userName)}（${data.length}件）</h3>`;
    allHistoryHTML += data.map(item => {
      const thumb = getNicoThumbnail(item.video_id);
      return `
        <div style="background:white;border-radius:8px;padding:10px;margin-bottom:8px;display:flex;gap:12px;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <img src="${thumb}" style="width:100px;height:56px;border-radius:4px;object-fit:cover;flex-shrink:0;background:#111;">
          <div>
            <div style="font-size:11px;color:#999;">${formatDateJP(item.created_at)}</div>
            <div style="font-weight:bold;font-size:13px;">${escapeHtml(item.title)}</div>
            <div style="font-size:11px;color:#aaa;">${item.video_id}</div>
          </div>
        </div>
      `;
    }).join("");

    deleteButtonsHTML += `
      <form method="POST" action="/admin/delete-user">
        <input type="hidden" name="user" value="${userName}">
        <input type="hidden" name="pass" value="${ADMIN_PASSWORD}">
        <button style="width:220px;background:#e74c3c;">${escapeHtml(userName)} の履歴を削除</button>
      </form>
      <br>
    `;
  }

  res.send(`
    <html>
    <head>
      ${CSS}
      <style>
        .tabs { display:flex; gap:8px; margin-bottom:20px; }
        .tab { padding:10px 20px; border-radius:8px; cursor:pointer; background:#eee; font-weight:bold; }
        .tab.active { background:#e6370e; color:white; }
        .tab-content { display:none; }
        .tab-content.active { display:block; }
      </style>
    </head>
    <body>
      ${SIDEBAR_HTML}
      <div id="main-content" class="main-content">
        <h2>🛡️ 管理者ページ</h2>
        <p style="color:#e74c3c;font-size:13px;text-align:center;">※ユーザーが自分の履歴を削除しても、この画面の記録は消えません</p>
        <div class="tabs">
          <div class="tab active" id="tab-all" onclick="openTab('all')">全履歴</div>
          <div class="tab" id="tab-delete" onclick="openTab('delete')">記録削除</div>
        </div>
        <div class="tab-content active" id="content-all">
          ${allHistoryHTML || '<p style="color:#999;">履歴がありません</p>'}
        </div>
        <div class="tab-content" id="content-delete">
          ${deleteButtonsHTML || '<p style="color:#999;">ユーザーがいません</p>'}
        </div>
        <script>
          function openTab(name) {
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            document.getElementById("tab-" + name).classList.add("active");
            document.getElementById("content-" + name).classList.add("active");
          }
        </script>
      </div>
      ${SIDEBAR_JS}
    </body>
    </html>
  `);
});

app.post("/admin/delete-user", async (req, res) => {
  const pass = req.body.pass;
  const user = req.body.user;
  if (pass !== ADMIN_PASSWORD) return res.send("パスワードが違います");
  await pool.query("DELETE FROM admin_history WHERE user_id = $1", [user]);
  res.redirect(`/admin?pass=${ADMIN_PASSWORD}`);
});

// --------------------------------------
// ユーティリティ
// --------------------------------------
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --------------------------------------
// ヘルスチェック
// --------------------------------------
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// --------------------------------------
// ログアウト
// --------------------------------------
app.get("/logout", (req, res) => {
  res.clearCookie("user");
  res.redirect("/login");
});

// --------------------------------------
// サーバー起動
// --------------------------------------
app.listen(PORT, () => {
  console.log("NicoViewer running on port " + PORT);
});
