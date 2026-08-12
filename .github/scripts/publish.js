const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const axios = require("axios");
const { marked } = require("marked");

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const HEADERS = {
  "Content-Type": "application/json",
  // Webhook n8n sekarang tanpa autentikasi, jadi header ini opsional. Tetap dikirim
  // kalau secretnya ada supaya menyalakan Header Auth di n8n cukup satu langkah —
  // dan tidak dikirim sebagai string kosong, yang justru ditolak 403 kalau auth aktif.
  ...(process.env.WEBHOOK_TOKEN ? { "X-Portofolio-Token": process.env.WEBHOOK_TOKEN } : {}),
};

function parseArticle(dir, folder, file) {
  const rawMd = fs.readFileSync(path.join(dir, folder, file), "utf8");

  // Extract locale from filename (e.g. "readme.en.md" or "readme-en.md" -> "en")
  let locale = "id"; // default
  const lowerFile = file.toLowerCase();
  if (lowerFile.endsWith(".en.md") || lowerFile.endsWith("-en.md")) {
    locale = "en";
  } else if (lowerFile.endsWith(".id.md") || lowerFile.endsWith("-id.md")) {
    locale = "id";
  }

  // Extract metadata
  const getMeta = (key) => {
    const regex = new RegExp(`<!--\\s*${key}:\\s*(.*?)\\s*-->`, "i");
    const match = rawMd.match(regex);
    return match ? match[1].trim() : null;
  };

  const title = getMeta("title");
  const excerpt = getMeta("excerpt");
  const date = getMeta("date");
  const image = getMeta("image");
  const posting_date = getMeta("posting_date");
  const tagsStr = getMeta("tags");
  const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()) : [];

  // Gagal di sini lebih jelas daripada 400 dari ValidationPipe di server.
  if (!title || !excerpt || !date) {
    throw new Error(
      `${folder}/${file}: metadata wajib tidak lengkap (title/excerpt/date). ` +
        `Cek komentar <!-- title: ... --> di baris atas file.`
    );
  }

  // Remove metadata comments only
  let md = rawMd.replace(/<!--[\s\S]*?-->/g, "").trim();

  // Fix list formatting (very important)
  md = md.replace(/([^\n])\n(\s*[-*]\s)/g, "$1\n\n$2");

  // Convert Markdown → HTML
  let html = marked(md);

  // Clean unwanted HTML wrappers
  html = html
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?head[^>]*>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .trim();

  console.log(`✔ Parsed [${locale.toUpperCase()}]: ${title}`);

  return {
    id: folder, // Common ID across locales
    title,
    excerpt,
    date,
    image,
    posting_date,
    tags,
    content: html,
    locale,
  };
}

/**
 * Baca output `git diff --name-status` jadi:
 *   folders  — semua folder yang tersentuh, dipakai untuk memilih apa yang di-publish
 *   addedMd  — folder -> Set nama file .md yang statusnya A (baru dibuat)
 *
 * Dipisah dari changedFolders() supaya bisa diuji tanpa repo git.
 */
function classifyDiff(out) {
  const folders = new Set();
  const addedMd = new Map();

  for (const line of out.split("\n")) {
    const parts = line.trim().split("\t");
    if (parts.length < 2) continue;

    const status = parts[0][0]; // "R100" -> "R"
    const file = parts[parts.length - 1]; // rename: pakai path tujuan
    const match = file.match(/^articles\/([^/]+)\/(.+)$/);
    if (!match) continue;

    const [, folder, name] = match;
    // Granularitas folder, bukan file: commit yang cuma ganti gambar tetap
    // memicu re-publish kedua locale-nya supaya thumbnail ikut ter-refresh.
    folders.add(folder);

    // Hanya "A" yang dihitung baru. Rename (R) sengaja tidak — memindahkan artikel
    // lama ke folder lain bukan alasan untuk mem-posting ulang ke sosmed.
    if (name.toLowerCase().endsWith(".md") && status === "A") {
      if (!addedMd.has(folder)) addedMd.set(folder, new Set());
      addedMd.get(folder).add(name);
    }
  }
  return { folders, addedMd };
}

/**
 * Nama folder dari penanda `[repost: nama-folder]` di pesan commit.
 *
 * Git bisa menjawab "artikel ini baru?" tapi tidak "artikel ini sudah berhasil
 * diposting?". Tiga jalur di n8n berakhir buntu — approval ditolak, render menyerah
 * setelah 8 ronde, dan artikel yang masuk `dilewat` saat satu push membawa beberapa
 * artikel baru. Tanpa penanda ini ketiganya hangus permanen: push berikutnya statusnya
 * M, bukan A.
 *
 * Penandanya di pesan commit, bukan di file artikel. Flag di dalam .md harus dibalik
 * jadi "sudah" setelah posting berhasil, dan yang tahu itu cuma n8n — yang tidak punya
 * akses tulis ke repo ini. Jadi pembalikannya manual, dan sekali lupa flag tersangkut
 * di "belum" sampai suatu hari perbaikan typo ikut mem-posting ulang. Pesan commit
 * tidak bisa basi: dia milik satu commit dan tidak ada yang perlu dibersihkan.
 */
function parseRepost(text) {
  return [...String(text == null ? "" : text).matchAll(/\[repost:\s*([^\]]+)\]/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

/**
 * Folder artikel yang berubah sejak commit sebelumnya, plus folder yang diminta
 * di-posting ulang lewat `[repost: ...]`.
 * Return null = harus full sync (workflow_dispatch, branch baru, force push,
 * atau shallow clone yang tidak punya commit pembanding).
 */
function changedFolders() {
  const before = process.env.BEFORE_SHA;
  const sha = process.env.SHA || "HEAD";

  if (!before || /^0+$/.test(before)) return null;

  let out;
  let pesan;
  try {
    out = execSync(`git diff --name-status ${before} ${sha} -- articles/`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Rentang, bukan `-1`: satu push bisa berisi beberapa commit dan penandanya
    // belum tentu di yang terakhir.
    pesan = execSync(`git log --format=%B ${before}..${sha}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    console.log("⚠️ git diff gagal (shallow clone / force push) → full sync.");
    return null;
  }

  return { ...classifyDiff(out), repost: parseRepost(pesan) };
}

async function main() {
  if (!WEBHOOK_URL) {
    throw new Error("WEBHOOK_URL kosong. Set secret WEBHOOK_URL di Settings → Secrets → Actions.");
  }

  const dir = path.join(process.cwd(), "articles");
  const only = changedFolders();

  // Nama yang salah ketik akan jadi no-op diam: `newFolders` dibangun di dalam loop
  // `folders`, jadi nama yang tidak cocok tidak pernah sampai ke sana dan kelihatannya
  // seolah repost sudah jalan. Lebih baik gagal di sini.
  for (const f of (only && only.repost) || []) {
    if (!fs.existsSync(path.join(dir, f))) {
      throw new Error(`[repost: ${f}] — folder articles/${f} tidak ada. Cek ejaannya.`);
    }
  }

  const folders = fs
    .readdirSync(dir)
    .filter((f) => fs.statSync(path.join(dir, f)).isDirectory())
    // Folder yang di-repost ikut dikirim ulang ke API (upsert, aman) supaya slug-nya
    // pasti ada di respons — siapkan-brief.js butuh itu untuk menyusun URL.
    .filter((f) => !only || only.folders.has(f) || only.repost.includes(f));

  if (only && folders.length === 0) {
    console.log("Tidak ada artikel yang berubah — tidak ada yang dikirim.");
    return;
  }

  const articles = [];
  const newFolders = [];

  for (const folder of folders) {
    const files = fs
      .readdirSync(path.join(dir, folder))
      .filter((f) => f.endsWith(".md"));
    for (const file of files) {
      articles.push(parseArticle(dir, folder, file));
    }

    // Folder dianggap baru hanya kalau SEMUA file .md yang ada sekarang berstatus A.
    // Menambah terjemahan EN ke artikel lama karena itu tidak menghitung ulang sebagai
    // baru — file ID-nya tidak muncul di diff, jadi `every` gagal dan sosmed dilewati.
    const added = only && only.addedMd.get(folder);
    if (added && files.length > 0 && files.every((f) => added.has(f))) {
      newFolders.push(folder);
    } else if (only && only.repost.includes(folder)) {
      // Sengaja hanya di mode delta. Di mode sync `folders` berisi SEMUA artikel,
      // jadi satu workflow_dispatch bisa mengantre puluhan posting sekaligus.
      newFolders.push(folder);
    }
  }

  const payload = {
    mode: only ? "delta" : "sync",
    sha: process.env.SHA || "HEAD",
    repo: process.env.REPO || "",
    new_folders: newFolders,
    // Bentuknya persis CreateArticleDto — n8n meneruskan array ini apa adanya ke
    // API. Jangan tambah field di sini: /articles pakai forbidNonWhitelisted,
    // satu field asing = 400. Metadata pipeline hidup di level atas payload.
    articles,
  };

  console.log(
    `\n>> ${payload.mode}: ${articles.length} artikel dari ${folders.length} folder` +
      `${newFolders.length ? `, ${newFolders.length} folder baru → sosmed` : ""}\n`
  );

  const res = await axios.post(WEBHOOK_URL, payload, {
    headers: HEADERS,
    // Di atas timeout /articles/sync (300s) di sisi n8n, supaya yang menyerah
    // duluan selalu n8n dengan pesan error jelas — bukan axios dengan ECONNABORTED.
    timeout: 310000,
  });

  console.log(`🎉 n8n balas ${res.status}: ${JSON.stringify(res.data)}`);
}

if (require.main === module) {
  main().catch((e) => {
    // Response body dari n8n jauh lebih berguna daripada "Request failed with 500".
    if (e.response) console.error(`HTTP ${e.response.status}:`, e.response.data);
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { parseArticle, classifyDiff, parseRepost, changedFolders };
