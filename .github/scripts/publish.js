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

/**
 * URL webhook untuk kirim ulang, DITURUNKAN dari WEBHOOK_URL — bukan secret kedua.
 *
 * Secret kedua berarti satu nilai lagi yang harus diisi tangan dan bisa lupa diisi, dan
 * gejalanya nanti "kirim ulang diam-diam tidak jalan". Dua path itu bersebelahan di
 * instance n8n yang sama (`…/webhook/portofolio` dan `…/webhook/portofolio-ulang`), jadi
 * yang satu bisa dihitung dari yang lain.
 *
 * Bentuknya diperiksa keras: WEBHOOK_URL yang tidak berakhiran `/portofolio` berarti
 * turunan ini pasti salah, dan salahnya berupa 404 yang tidak menjelaskan apa-apa.
 * Host-nya disamarkan di pesan error — ini berjalan di log Action yang bisa dibaca siapa
 * pun yang punya akses repo.
 */
function urlUlang(base) {
  const u = String(base == null ? "" : base);
  if (!/\/portofolio$/.test(u)) {
    throw new Error(
      "WEBHOOK_URL harus berakhiran /portofolio supaya URL kirim-ulang bisa diturunkan " +
        `darinya. Dapat: ${u.replace(/\/\/[^/]+/, "//…")}`
    );
  }
  return `${u}-ulang`;
}

/**
 * Folder ini dikirim ke mana: `baru`, `ulang`, atau null (tidak ke sosmed sama sekali).
 *
 * Dua workflow n8n sekarang aktif bersamaan di path yang berbeda, dan di sinilah bedanya
 * ditentukan — bukan lagi oleh saklar aktif yang bisa bergeser sendiri waktu deploy:
 *
 *   baru  -> `portofolio`        -> LinkedIn + Instagram + Facebook
 *   ulang -> `portofolio-ulang`  -> Instagram + Facebook saja
 *
 * Artikel lama hampir selalu sudah terlanjur ada di LinkedIn, jadi mengirimnya ke jalur
 * normal berarti LinkedIn kena dua kali.
 */
function tujuanFolder(folder, files, only) {
  // Mode sync berisi SEMUA artikel; satu workflow_dispatch tidak boleh mengantre
  // puluhan posting sekaligus.
  if (!only) return null;
  // Folder dianggap baru hanya kalau SEMUA berkas .md yang ada sekarang berstatus A.
  // Menambah terjemahan EN ke artikel lama tidak menghitung ulang sebagai baru.
  const added = only.addedMd.get(folder);
  if (added && files.length > 0 && files.every((f) => added.has(f))) return "baru";
  return only.repost.includes(folder) ? "ulang" : null;
}

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

  // Mode sync mengabaikan [repost:] (alasannya di bawah, di dalam loop). Kalau
  // penandanya ADA tapi kita telanjur jatuh ke sync, yang terjadi adalah no-op senyap:
  // Action hijau, website ter-resync, dan artikel yang mau diposting ulang tidak ke
  // mana-mana. Persis itu yang terjadi 2026-08-13 gara-gara fetch-depth kurang.
  if (!only) {
    const tanda = parseRepost(
      execSync("git log --format=%B -1", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    );
    if (tanda.length) {
      throw new Error(
        `[repost: ${tanda.join(", ")}] diminta tapi mode-nya sync, dan sync tidak pernah ` +
          `memicu sosmed. Penyebab tersering: git diff gagal karena clone-nya dangkal ` +
          `(fetch-depth) atau force push. Perbaiki itu dulu, lalu ulangi commit repost-nya.`
      );
    }
  }

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
  // Dua keranjang, dua tujuan. Alasannya di atas `tujuanFolder`.
  const baru = [];
  const ulang = [];
  // folder -> nama berkas .md-nya. n8n butuh ini kalau harus menulis balik gambar
  // hasil generate ke markdown-nya. Nama berkasnya sengaja tidak ditebak dari nama
  // folder: parseArticle menerima empat bentuk sufiks locale, dan menebak salah
  // berarti commit balik menulis ke berkas yang tidak ada.
  const mdFiles = {};

  for (const folder of folders) {
    const files = fs
      .readdirSync(path.join(dir, folder))
      .filter((f) => f.endsWith(".md"));
    mdFiles[folder] = files;
    for (const file of files) {
      articles.push(parseArticle(dir, folder, file));
    }

    const tujuan = tujuanFolder(folder, files, only);
    if (tujuan === "baru") baru.push(folder);
    else if (tujuan === "ulang") ulang.push(folder);
  }

  const badan = (newFolders) => ({
    mode: only ? "delta" : "sync",
    sha: process.env.SHA || "HEAD",
    repo: process.env.REPO || "",
    new_folders: newFolders,
    md_files: mdFiles,
    // Bentuknya persis CreateArticleDto — n8n meneruskan array ini apa adanya ke
    // API. Jangan tambah field di sini: /articles pakai forbidNonWhitelisted,
    // satu field asing = 400. Metadata pipeline hidup di level atas payload.
    articles,
  });

  /**
   * Satu kiriman per tujuan yang benar-benar punya isi.
   *
   * Push yang membawa artikel baru DAN penanda `[repost:]` sekaligus dikirim dua kali —
   * bukan digabung. Digabung, salah satunya pasti salah alamat: artikel barunya kehilangan
   * LinkedIn, atau artikel lamanya naik ke LinkedIn untuk kedua kali. Artikelnya sendiri
   * ikut di kedua badan, dan itu aman: sisi API-nya upsert.
   */
  const kiriman = [
    [WEBHOOK_URL, baru, "artikel baru → LinkedIn + Instagram + Facebook"],
    [urlUlang(WEBHOOK_URL), ulang, "kirim ulang → Instagram + Facebook"],
  ].filter(([, f]) => f.length);

  // Tidak ada satu pun yang ke sosmed — misalnya perbaikan typo di artikel lama. Tetap
  // dikirim SEKALI ke webhook utama supaya website-nya ikut ter-update; `new_folders`
  // kosong yang membuat cabang sosmed berhenti di gerbang `Ada artikel baru?`.
  if (!kiriman.length) kiriman.push([WEBHOOK_URL, [], "website saja"]);

  console.log(
    `\n>> ${only ? "delta" : "sync"}: ${articles.length} artikel dari ${folders.length} folder` +
      `${baru.length ? `, ${baru.length} baru` : ""}${ulang.length ? `, ${ulang.length} kirim ulang` : ""}\n`
  );

  for (const [url, newFolders, label] of kiriman) {
    console.log(`>> ${label}${newFolders.length ? `: ${newFolders.join(", ")}` : ""}`);
    const res = await axios.post(url, badan(newFolders), {
      headers: HEADERS,
      // Di atas timeout /articles/sync (300s) di sisi n8n, supaya yang menyerah
      // duluan selalu n8n dengan pesan error jelas — bukan axios dengan ECONNABORTED.
      timeout: 310000,
    });
    console.log(`🎉 n8n balas ${res.status}: ${JSON.stringify(res.data)}`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    // Response body dari n8n jauh lebih berguna daripada "Request failed with 500".
    if (e.response) console.error(`HTTP ${e.response.status}:`, e.response.data);
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { parseArticle, classifyDiff, parseRepost, changedFolders, urlUlang, tujuanFolder };
