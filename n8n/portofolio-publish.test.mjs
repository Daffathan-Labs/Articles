// Self-check workflow n8n. Jalankan: node --test n8n/portofolio-publish.test.mjs
//
// Membaca portofolio-publish.json apa adanya — tidak ada salinan logika di sini.
// Yang dikunci adalah kelas kesalahan yang tidak kelihatan sampai workflow-nya
// jalan di produksi: referensi $('Nama Node') ke node yang sudah di-rename,
// koneksi ke node yang tidak ada, dan Code node yang tidak lolos parse.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const wf = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "portofolio-publish.json"), "utf8")
);
const nama = new Set(wf.nodes.map((n) => n.name));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

/** Semua string di dalam parameters sebuah node, direkursi. */
function strings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
}

/**
 * Buang komentar sebelum memeriksa isi kode. Tanpa ini, kalimat penjelas yang
 * kebetulan menyebut $input atau $('Nama Node') ikut terbaca sebagai pemakaian
 * sungguhan — dan test gagal karena komentarnya, bukan karena kodenya.
 *
 * Hanya `//` di awal baris yang dibuang, supaya `https://` di tengah baris aman.
 */
const tanpaKomentar = (js) =>
  js
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((b) => !b.trimStart().startsWith("//"))
    .join("\n");

test("setiap target koneksi menunjuk node yang ada", () => {
  for (const [dari, tipe] of Object.entries(wf.connections)) {
    assert.ok(nama.has(dari), `sumber koneksi tidak ada: ${dari}`);
    for (const grup of Object.values(tipe)) {
      for (const keluaran of grup) {
        for (const c of keluaran) {
          assert.ok(nama.has(c.node), `${dari} -> node tidak ada: ${c.node}`);
        }
      }
    }
  }
});

test("setiap $('Nama Node') menunjuk node yang ada", () => {
  for (const n of wf.nodes) {
    for (const s of strings(n.parameters)) {
      for (const m of tanpaKomentar(s).matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        assert.ok(nama.has(m[1]), `node "${n.name}" mereferensi "${m[1]}" yang tidak ada`);
      }
    }
  }
});

test("Code node lolos parse sebagai JavaScript", () => {
  // n8n membungkus isi Code node dalam fungsi async, jadi `await` di level teratas sah
  // di sana — `new Function` biasa menolaknya. Diparse dengan pembungkus yang sama
  // supaya test ini menilai kode yang benar-benar akan dijalankan.
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const n of wf.nodes.filter((x) => x.type === "n8n-nodes-base.code")) {
    assert.doesNotThrow(
      () => new AsyncFunction(n.parameters.jsCode),
      `Code node "${n.name}" tidak bisa di-parse`
    );
  }
});

test("setiap node terjangkau dari Webhook", () => {
  const lihat = new Set();
  (function jalan(n) {
    if (lihat.has(n)) return;
    lihat.add(n);
    for (const cabang of wf.connections[n]?.main ?? []) for (const c of cabang) jalan(c.node);
  })("Webhook");

  // Sub-node LangChain menyambung KE induknya lewat ai_*, jadi tidak pernah muncul
  // sebagai tujuan main — dicek terpisah di bawah, bukan lewat penelusuran ini.
  const subNode = new Set(
    wf.nodes
      .filter((n) => Object.keys(wf.connections[n.name] ?? {}).some((t) => t.startsWith("ai_")))
      .map((n) => n.name)
  );
  // Node nonaktif memang sengaja tidak tersambung — lihat test cabang Facebook di
  // bawah, yang mengunci bahwa nonaktif berarti nonaktif DAN terputus.
  const putus = wf.nodes
    .map((n) => n.name)
    .filter((n) => !lihat.has(n) && !subNode.has(n) && !byName[n].disabled);
  assert.deepEqual(putus, [], `node tidak terjangkau: ${putus.join(", ")}`);
});

test("sub-node LangChain tersambung ke induk yang ada", () => {
  const wajib = { "Gemini copy": ["ai_languageModel", "ai_outputParser"] };
  const terpasang = {};
  for (const [dari, tipe] of Object.entries(wf.connections)) {
    for (const [t, grup] of Object.entries(tipe)) {
      if (!t.startsWith("ai_")) continue;
      for (const cabang of grup) {
        for (const c of cabang) (terpasang[c.node] ??= []).push(t);
      }
    }
    void dari;
  }
  for (const [induk, tipe] of Object.entries(wajib)) {
    assert.deepEqual((terpasang[induk] ?? []).sort(), tipe.sort(), `sub-node ${induk}`);
  }
});

test("webhook POST dan membalas lewat Respond node", () => {
  const w = byName["Webhook"];
  assert.equal(w.parameters.httpMethod, "POST");
  assert.equal(w.parameters.path, "portofolio");
  // responseNode: GitHub Actions tetap menerima status asli publish website.
  assert.equal(w.parameters.responseMode, "responseNode");
  // Tanpa autentikasi, atas permintaan. Dikunci di sini supaya kalau suatu saat
  // headerAuth dinyalakan lagi, credential-nya tidak lupa ikut dipasang — node
  // dengan authentication tapi tanpa credentials gagal di eksekusi pertama.
  if (w.parameters.authentication) {
    assert.ok(w.credentials, "authentication menyala tapi credentials kosong");
  }
});

test("kedua cabang mode membalas webhook tepat sekali", () => {
  const respond = wf.nodes.filter((n) => n.type === "n8n-nodes-base.respondToWebhook");
  assert.equal(respond.length, 2, "harus ada satu Respond per cabang mode");
});

test("Publish artikel gagal keras, supaya Actions ikut merah", () => {
  // Ini satu-satunya umpan balik CI yang tersisa setelah n8n mengambil alih publishing.
  assert.equal(byName["Publish artikel"].onError, undefined);
  assert.match(byName["Publish artikel"].parameters.jsonBody, /JSON\.stringify\(\$json\)/);
});

test("node sosmed tidak mematikan eksekusi saat gagal", () => {
  // Satu platform gagal tidak boleh menyeret platform lain ikut mati.
  for (const n of ["LinkedIn post", "IG publish", "IG item container", "IG permalink"]) {
    assert.equal(byName[n].onError, "continueRegularOutput", n);
  }
});

test("LinkedIn memakai person URN, bukan organization", () => {
  for (const n of ["LinkedIn init upload", "LinkedIn post"]) {
    const s = strings(byName[n].parameters).join(" ");
    assert.match(s, /json\.linkedin_urn/, n);
    assert.doesNotMatch(s, /urn:li:organization/, `${n} masih pakai organization URN`);
  }
});

/** Nilai satu field di node Kredensial. */
const kred = (f) =>
  byName["Kredensial"].parameters.assignments.assignments.find((a) => a.name === f).value;

// [A-Z0-9_], bukan [A-Z_]: tanpa angka, ISI_N8N_API_KEY tidak dikenali sebagai
// placeholder dan pemeriksaan rahasia di bawah melewatinya diam-diam.
const PLACEHOLDER = /^ISI_[A-Z0-9_]+$/;

test("LinkedIn-Version aktif dan sama persis di kedua node", () => {
  const versi = ["LinkedIn init upload", "LinkedIn post"].map(
    (n) =>
      byName[n].parameters.headerParameters.parameters.find(
        (p) => p.name === "LinkedIn-Version"
      ).value
  );
  // Kalau keduanya sempat beda, initializeUpload berhasil tapi /rest/posts gagal 426
  // — kegagalan separuh jalan yang paling membingungkan untuk dilacak.
  assert.equal(versi[0], versi[1], "versi kedua node harus identik");
  assert.match(versi[0], /Kredensial'\)\.first\(\)\.json\.linkedin_version/);

  // 202411 (warisan workflow Belimbing) sudah tidak aktif per 2026-08;
  // jendela aktif diverifikasi 2026-08-12 = 202508..202607.
  const v = Number(kred("linkedin_version"));
  assert.ok(v >= 202508 && v <= 202607, `versi ${v} di luar jendela aktif`);
});

test("semua konfigurasi lewat node Kredensial, bukan env var", () => {
  // Satu tempat untuk mengganti token yang kedaluwarsa tiap 60 hari. Kalau ada
  // yang masih membaca $env, nilainya diam-diam kosong dan node-nya gagal 401.
  const sisa = wf.nodes
    .filter((n) => strings(n.parameters).some((s) => /\$env\./.test(s)))
    .map((n) => n.name);
  assert.deepEqual(sisa, []);
});

test("nilai di .local.json masuk akal (kalau file-nya ada)", () => {
  // File ini yang di-import ke n8n. Isinya tidak pernah masuk git, jadi tidak ada
  // review — pemeriksaan bentuknya dikerjakan di sini.
  const p = path.join(import.meta.dirname, "portofolio-publish.local.json");
  if (!fs.existsSync(p)) return; // belum di-build, bukan kegagalan

  const lokal = JSON.parse(fs.readFileSync(p, "utf8"));
  const v = (f) =>
    lokal.nodes
      .find((n) => n.name === "Kredensial")
      .parameters.assignments.assignments.find((a) => a.name === f).value;

  // Workflow menyusun `{{ render_url }}/render`. Kalau field-nya sudah memuat
  // /render, hasilnya /render/render -> 404, dan errornya tidak menyebut sebabnya.
  for (const f of ["render_url", "article_api_url", "site_url"]) {
    if (v(f).startsWith("ISI_")) continue;
    assert.doesNotMatch(v(f), /\/$/, `${f} tidak boleh diakhiri garis miring`);
    assert.match(v(f), /^https?:\/\//, `${f} harus URL lengkap`);
  }
  if (!v("render_url").startsWith("ISI_")) {
    assert.doesNotMatch(v("render_url"), /\/render$/, "render_url harus base URL saja");
  }
  if (!v("linkedin_urn").startsWith("ISI_")) {
    assert.match(v("linkedin_urn"), /^urn:li:person:/, "person URN wajib lengkap dengan prefiks");
  }
  if (!v("ig_user_id").startsWith("ISI_")) {
    // user_id IG selalu 17 digit; field "id" dari /me lebih pendek dan sering tertukar.
    assert.match(v("ig_user_id"), /^\d{16,18}$/, "ig_user_id harus user_id, bukan id");
  }
});

/**
 * Pola token yang bentuknya khas dan tidak mungkin muncul kebetulan. Sengaja TIDAK
 * memuat nilai rahasia mana pun — daftar "jangan sampai bocor" yang berisi rahasianya
 * sendiri adalah kebocoran, dan itu pernah kejadian di berkas ini.
 */
const POLA_TOKEN = [
  ["token Instagram/Facebook", /\b(IGAA|EAA)[A-Za-z0-9]{20,}/],
  ["token LinkedIn", /\bAQ[A-Za-z0-9_-]{60,}/],
  ["JWT (API key n8n)", /\beyJhbGciOi[A-Za-z0-9_-]{10,}/],
  ["PAT GitHub", /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
];

test("tidak ada berkas ter-commit di n8n/ dan .github/ yang membawa token hidup", () => {
  // Definisi "akan ter-commit" diambil dari git sendiri, bukan dari daftar nama berkas:
  // kebocoran kemarin justru lewat berkas yang belum ada waktu test ini ditulis.
  const akar = path.resolve(import.meta.dirname, "..");
  const daftar = execSync(
    "git ls-files --cached --others --exclude-standard -- n8n .github",
    { cwd: akar, encoding: "utf8" }
  )
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);

  assert.ok(daftar.length > 0, "git tidak mengembalikan berkas apa pun — perintahnya salah");

  const temuan = [];
  for (const berkas of daftar) {
    let isi;
    try {
      isi = fs.readFileSync(path.join(akar, berkas), "utf8");
    } catch {
      continue; // berkas biner atau sudah terhapus
    }
    for (const [nama, pola] of POLA_TOKEN) {
      if (pola.test(isi)) temuan.push(`${berkas}: ${nama}`);
    }
  }
  assert.deepEqual(temuan, [], `kredensial hidup di berkas yang akan ter-commit:\n${temuan.join("\n")}`);
});

test("node Kredensial tidak boleh menyimpan app secret", () => {
  // Secret bisa MENCETAK token baru, jadi bocornya jauh lebih parah daripada token.
  // Dia cuma dipakai sekali saat menukar token, di terminal, di luar n8n.
  for (const berkas of ["portofolio-publish.json", "refresh-ig-token.json"]) {
    const w = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, berkas), "utf8"));
    const set = w.nodes.find((n) => n.name === "Kredensial");
    const nakal = set.parameters.assignments.assignments
      .map((a) => a.name)
      .filter((n) => /secret/i.test(n));
    assert.deepEqual(nakal, [], `${berkas} menyimpan secret di node Kredensial`);
  }
});

test("file ter-commit tidak membawa kredensial hidup", () => {
  // Repo ini publik: token hidup di sini akan di-scrape bot dalam hitungan menit.
  // Nilai asli hidup di portofolio-publish.local.json yang di-gitignore.
  // Daftar ini ditulis tangan, jadi rahasia baru yang lupa didaftarkan TIDAK dijaga
  // siapa pun. Tiap tambah field rahasia di FIELD, tambah juga namanya di sini.
  for (const f of ["article_api_key", "render_url", "render_token", "linkedin_token", "ig_user_id", "ig_token", "notify_email", "tmdb_api_key"]) {
    assert.match(kred(f), PLACEHOLDER, `${f} membawa nilai asli`);
  }
  // Yang boleh nyata: bukan rahasia, dan mengisinya menghemat langkah setup.
  assert.equal(kred("linkedin_urn"), "urn:li:person:B1oVXChp7v");
  assert.match(kred("site_url"), /^https:\/\/daffathan-labs\.my\.id$/);
});

test("IG memakai host graph.instagram.com (jalur login Instagram)", () => {
  // Dua jalur Instagram API Meta tidak saling kompatibel. Token dari jalur
  // "login Instagram" dibalas #190 kalau ditembakkan ke graph.facebook.com.
  const igNodes = ["IG item container", "IG carousel container", "IG publish", "IG permalink"];
  for (const n of igNodes) {
    const url = byName[n].parameters.url;
    assert.match(url, /graph\.instagram\.com/, n);
    assert.doesNotMatch(url, /graph\.facebook\.com/, `${n} masih pakai host jalur login Facebook`);
  }
});

test("caption IG dikirim sebagai form body, bukan query string", () => {
  // Caption berisi baris baru, emoji, dan URL: encoding query string gagalnya sesekali.
  const n = byName["IG carousel container"];
  assert.equal(n.parameters.contentType, "form-urlencoded");
  assert.ok(!n.parameters.sendQuery, "caption tidak boleh lewat query string");
});

test("render dipanggil dengan brand portofolio dan token dari Kredensial", () => {
  const s = strings(byName["Render"].parameters).join(" ");
  assert.match(s, /brand: 'portofolio'/);
  assert.match(s, /json\.render_token/);
  // Token hardcoded di parameter node ikut ter-export tiap kali workflow disimpan.
  assert.doesNotMatch(s, /Bearer\s+(?!\{\{)\S+/, "token render ter-hardcode di node");
});

test("tidak ada sisa identitas Belimbing/Cepat di file ter-commit", () => {
  const semua = JSON.stringify(wf).toLowerCase();
  // Token render-svc kebetulan memuat kata "belimbing", jadi pencarian ini sudah
  // menangkapnya — tokennya sendiri sengaja TIDAK ditulis di sini. File ini
  // ter-commit ke repo publik; menaruh rahasia di daftar "jangan sampai bocor"
  // justru membocorkannya.
  for (const jejak of ["belimbing", "cepat-ai", "34.128.95.69", "LINKEDIN_ORG_ID"]) {
    assert.ok(!semua.includes(jejak.toLowerCase()), `masih ada jejak: ${jejak}`);
  }
});

test("Wait node punya webhookId dan batas waktu", () => {
  const w = byName["Tunggu approval"];
  assert.equal(w.parameters.resume, "webhook");
  assert.equal(w.parameters.limitWaitTime, true);
  // Tanpa webhookId, tautan Approve di e-mail tidak pernah terbentuk.
  assert.match(w.webhookId, /^[0-9a-f-]{36}$/);
});

// ── Menjalankan sumber Code node "Rakit slide" apa adanya dari JSON, dengan
// global n8n yang dipalsukan. Tidak ada salinan template di file test ini.
// Ukuran h1 di ronde 0. Satu tempat, dipakai dua test — kalau desainnya diubah,
// yang menyesuaikan satu baris, bukan berburu angka telanjang di beberapa assert.
const H1_RONDE0 = 74;

// Isi `binary.data.data` di instance yang menyimpan binary di filesystem. Bukan base64,
// dan bukan kebetulan: berkas aslinya di disk, ditunjuk `binary.data.id`.
const RUJUKAN = "filesystem-v2";

function rakit({
  ronde = 0,
  gambar = 5,
  heading,
  body,
  hashtags = ["#a"],
  accent = "#1B4FA8",
  layout = "blok-bawah",
  // null = artikel tanpa gambar, atau unduhan cover yang gagal. Dua-duanya jalur
  // yang sama dari sisi Rakit slide.
  cover = null,
  // true = artikel film, gambarnya still asli dari TMDB. Ini yang memaksa layout.
  fotoAsli = false,
  // Indeks slide yang fotonya POTRET pemain (2:3), bukan still 16:9.
  potretDi = [],
} = {}) {
  const slide = {
    heading: heading ?? "Satu dua tiga empat lima enam",
    body: body ?? Array.from({ length: 32 }, (_, i) => `kata${i}`).join(" "),
    pakai_foto: fotoAsli,
  };
  const palsu = {
    "Siapkan brief": {
      json: {
        folder: "artikel-uji",
        code: "artikel-uji",
        url_id: "https://daffathan-labs.my.id/id/articles/uji",
        url_en: "https://daffathan-labs.my.id/en/articles/uji",
        cover: cover ? "https://api.contoh/uploads/articles/abc.webp" : null,
        tags: "Movie Review, Marvel",
        repo: "Daffathan-Labs/Articles",
        berkas_md: ["artikel-uji-id.md", "artikel-uji-en.md"],
        dilewat: [],
      },
    },
    "Gemini copy": {
      json: {
        output: {
          linkedin_caption: "LI", ig_caption: "IG", fb_caption: "FB",
          hashtags, accent, layout,
        },
      },
    },
    // Node HTTP responseFormat:file. Instance ini menyimpan binary di FILESYSTEM, jadi
    // `binary.data.data` berisi string literal "filesystem-v2" — bukan base64. Ditiru
    // apa adanya di sini: kode yang membaca `.data` akan menghasilkan
    // <img src="data:…;base64,filesystem-v2"> dan test di bawah menangkapnya.
    // mimeType tetap utuh di binary; yang jadi rujukan cuma `.data`.
    "Ambil cover": cover
      ? { json: {}, binary: { data: { data: RUJUKAN, mimeType: cover.mime, id: "filesystem-v2:…" } } }
      : { json: {} },
    // Hasil `Cover base64`: SELALU satu item, `b64` null kalau tidak ada gambar.
    "Cover base64": { json: cover ? { b64: cover.b64, mime: cover.mime } : { b64: null, mime: null } },
  };
  const $ = (n) => ({
    isExecuted: true,
    first: () => palsu[n],
    all: () => {
      if (n === "Pecah slide") {
        return Array.from({ length: 5 }, (_, i) => ({
          json: { ...slide, foto_potret: potretDi.includes(i) },
        }));
      }
      // `Slide base64` SELALU mengeluarkan satu item per slide, termasuk yang gagal
      // (`b64: null`). Itu yang menjaga slide ke-4 tidak memakai gambar milik slide
      // ke-1 saat sebagian gambar gagal.
      //
      // Raster diberi nomor per slide. Kalau semuanya string yang sama, test tidak bisa
      // membedakan "tiap slide punya gambarnya sendiri" dari "satu gambar dipasang lima
      // kali" — dan itu persis keluhan yang memicu perubahan ini.
      return Array.from({ length: 5 }, (_, i) => ({
        json: { b64: i < gambar ? `QUJD${i}` : null, mime: "image/jpeg" },
      }));
    },
  });
  const fn = new Function("$runIndex", "$", byName["Rakit slide"].parameters.jsCode);
  return fn(ronde, $)[0].json;
}

test("Rakit slide: ronde 0 menghasilkan 5 slide dengan teks penuh", () => {
  const r = rakit({ ronde: 0 });
  assert.equal(r.slides.length, 5);
  assert.equal(r.ronde, 1);
  assert.equal(r.gambar_gagal, 0);
  assert.match(r.slides[0], new RegExp(`h1\\{font-size:${H1_RONDE0}px`), "ronde 0 pakai ukuran penuh");
  assert.doesNotMatch(r.slides[0], /…/, "ronde 0 tidak memangkas kata");
});

test("tidak satu slide pun memuat URL", () => {
  // URL di gambar Instagram tidak bisa diklik, dan yang panjang justru terpotong
  // elipsis seperti di render pertama. Alamat hidup di caption saja.
  for (const [i, s] of rakit().slides.entries()) {
    const isi = s.replace(/src="data:[^"]*"/g, ""); // base64 boleh memuat apa saja
    assert.doesNotMatch(isi, /https?:|daffathan-labs\.my\.id|…/, `slide ${i + 1}`);
  }
});

test("slide terakhir memakai CTA tetap, slide lain tidak", () => {
  const r = rakit();
  assert.match(r.slides[4], /link bio/i, "slide 5 harus mengajak ke bio");
  for (const i of [0, 1, 2, 3]) {
    assert.doesNotMatch(r.slides[i], /link bio/i, `slide ${i + 1} tidak boleh membawa CTA`);
  }
  // Teks model untuk slide terakhir memang dibuang; ini yang menguncinya.
  assert.doesNotMatch(r.slides[4], /Satu dua tiga empat/, "teks model harus ditimpa");
});

test("logo hexagon tertanam di tiap slide", () => {
  for (const [i, s] of rakit().slides.entries()) {
    const m = s.match(/<img class="logo" src="data:image\/png;base64,([^"]*)"/);
    assert.ok(m, `slide ${i + 1} tanpa logo`);
    // Placeholder {{LOGO}} yang gagal terisi menghasilkan src kosong dan lolos diam-diam.
    assert.ok(m[1].length > 1000, `slide ${i + 1}: base64 logo cuma ${m[1].length} char`);
  }
});

// -- gambar artikel: satu identitas untuk website, LinkedIn, dan slide 1 ----------
const COVER = { b64: "Q09WRVI=", mime: "image/webp" };

test("nol slide memasang rujukan filesystem sebagai isi gambar", () => {
  // Bug yang paling lama hidup di pipeline ini, dan paling sunyi: instance menyimpan
  // binary di disk, jadi `binary.data.data` = "filesystem-v2". Dipasang ke
  // <img src="data:image/webp;base64,filesystem-v2"> hasilnya ikon gambar rusak — di
  // SETIAP slide, tanpa satu pun error di n8n, tanpa satu pun test merah. Ketahuan cuma
  // dengan mengunduh JPEG hasil render dan melihatnya.
  for (const opsi of [{}, { cover: COVER }, { cover: COVER, gambar: 0 }]) {
    for (const [i, s] of rakit(opsi).slides.entries()) {
      assert.ok(!s.includes(RUJUKAN), `slide ${i + 1}: rujukan filesystem masuk ke HTML`);
    }
  }
});

test("node pengubah binary ke base64 terpasang di dua jalur gambar", () => {
  for (const [dari, node, ke] of [
    ["Ambil cover", "Cover base64", "Gemini copy"],
    ["Jadi JPEG", "Slide base64", "Rakit slide"],
  ]) {
    const n = byName[node];
    assert.ok(n, `${node} tidak ada`);
    // Harus helper, bukan `binary.data.data` — yang terakhir cuma berisi "filesystem-v2".
    assert.match(n.parameters.jsCode, /getBinaryDataBuffer/, `${node}: tidak membaca dari disk`);
    assert.deepEqual(wf.connections[dari].main[0].map((c) => c.node), [node], `${dari} -> ${node}`);
    assert.deepEqual(wf.connections[node].main[0].map((c) => c.node), [ke], `${node} -> ${ke}`);
  }
});

// Menjalankan sumber Code node "Slide base64" apa adanya dari JSON. `this.helpers`
// dipalsukan, dan isinya sengaja diturunkan dari INDEKS yang diminta — kalau kodenya
// meminta indeks yang salah, isi base64-nya ikut salah dan test di bawah menangkapnya.
async function keB64(masuk, node = "Slide base64") {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction("$input", byName[node].parameters.jsCode);
  const helpers = { getBinaryDataBuffer: async (i) => Buffer.from(`RASTER${i}`) };
  return fn.call({ helpers }, { all: () => masuk });
}
const b64dari = (i) => Buffer.from(`RASTER${i}`).toString("base64");

test("ke-base64: satu item keluar per item masuk, indeks tidak bergeser", async () => {
  // Slide 1 dan 3 berhasil, sisanya gagal. Kalau yang gagal dibuang (perilaku
  // `Extract From File`), gambar slide 3 diam-diam terpasang di slide 2.
  const masuk = [0, 1, 2, 3, 4].map((i) =>
    i === 0 || i === 2
      ? { json: {}, binary: { data: { data: RUJUKAN, mimeType: "image/webp" } } }
      : { json: { error: "The service is receiving too many requests from you" } }
  );
  const keluar = await keB64(masuk);

  assert.equal(keluar.length, 5, "item hilang — pasangan slide↔gambar bergeser");
  assert.deepEqual(
    keluar.map((x) => x.json.b64),
    [b64dari(0), null, b64dari(2), null, null],
    "isi tidak duduk di slot slide-nya sendiri"
  );
  // Yang dipasang harus isi berkas dari disk, bukan rujukan "filesystem-v2".
  for (const x of keluar) assert.notEqual(x.json.b64, RUJUKAN);
  assert.equal(keluar[0].json.mime, "image/webp", "mime hilang — WebP ditulis jadi jpeg");
});

test("ke-base64: nol gambar tetap mengembalikan lima slot, bukan nol item", async () => {
  // Kuota gambar habis = kelima item masuk tanpa binary. Nol item keluar berarti
  // cabangnya berhenti diam-diam dan n8n tetap melaporkan "success" (eksekusi 4216).
  const keluar = await keB64(Array.from({ length: 5 }, () => ({ json: { error: "gagal" } })));
  assert.equal(keluar.length, 5, "cabang mati saat semua gambar gagal");
  assert.deepEqual(keluar.map((x) => x.json.b64), [null, null, null, null, null]);
});

test("ke-base64: node cover memakai kode yang sama persis", () => {
  // Dua salinan yang diam-diam berbeda adalah cara bug ini kembali lewat pintu belakang.
  assert.equal(byName["Cover base64"].parameters.jsCode, byName["Slide base64"].parameters.jsCode);
});

test("gambar gagal tetap punya slot sendiri — bukan digeser ke slide lain", () => {
  // `Extract From File` MEMBUANG item tanpa binary: 5 slide dengan 2 gambar berhasil
  // keluar sebagai 2 item, dan gambar slide ke-3 diam-diam terpasang di slide ke-1.
  // Node Code menggantinya justru karena itu — satu item keluar per item masuk.
  const kode = byName["Slide base64"].parameters.jsCode;
  assert.match(kode, /\$input\.all\(\)/, "tidak mengiterasi seluruh item masukan");
  assert.doesNotMatch(kode, /\.filter\(/, "menyaring item = membuang slot slide");

  // Slide 1 dan 2 dapat gambar, slide 3-5 gagal. Yang gagal harus TIDAK memakai QUJD.
  const { slides } = rakit({ gambar: 2 });
  assert.match(slides[0], /base64,QUJD0/, "slide 1 bukan gambarnya sendiri");
  assert.match(slides[1], /base64,QUJD1/, "slide 2 bukan gambarnya sendiri");
});

// Semua `<img class="bg">` di satu carousel. Diambil dari kelasnya, bukan dari base64
// pertama yang ketemu: tiap slide juga membawa logo sebagai data URI, dan logo memang
// sama di kelimanya.
const fotoSlide = (slides) =>
  slides.map((s) => (s.match(/<img class="bg"[^>]*src="([^"]+)"/) || [, null])[1]);

test("NOL gambar dipakai dua kali di satu carousel", () => {
  // Ini test intinya. Keluhan yang memulai semuanya: slide 2-5 memakai foto yang sama
  // persis dengan slide 1. Dulu ada dua jalur pengulangan — slide gagal meminjam raster
  // tetangga, dan kalau semua gagal kelimanya jatuh ke foto artikel. Dua-duanya mati di
  // sini, di tiga kondisi sekaligus.
  for (const opsi of [
    { cover: COVER },              // semua gambar berhasil
    { cover: COVER, gambar: 2 },   // 2 dari 5 berhasil — dulu 3 slide meminjam gambar slide 1
    { cover: COVER, gambar: 0 },   // kuota habis — dulu kelimanya jadi foto artikel
    { gambar: 2 },                 // tanpa cover
  ]) {
    const foto = fotoSlide(rakit(opsi).slides).filter(Boolean);
    assert.equal(
      new Set(foto).size,
      foto.length,
      `gambar dipakai ulang (${JSON.stringify(opsi)}): ${foto.map((f) => f.slice(-6)).join(" | ")}`
    );
  }
});

test("foto artikel berhenti di slide 1", () => {
  // mimeType dibaca dari unduhan, bukan diasumsikan jpeg: API menyajikan WebP, dan
  // menuliskannya sebagai image/jpeg bikin Chromium menolak merendernya.
  for (const gambar of [5, 2, 0]) {
    const { slides } = rakit({ cover: COVER, gambar });
    assert.match(slides[0], /src="data:image\/webp;base64,Q09WRVI="/, `gambar=${gambar}: slide 1 bukan cover`);
    for (const i of [1, 2, 3, 4]) {
      assert.ok(!slides[i].includes("Q09WRVI="), `gambar=${gambar}: slide ${i + 1} memakai foto artikel`);
    }
  }
});

test("slide tanpa gambar jadi kartu berpola, dan pola-polanya berbeda", () => {
  // Satu gradien yang sama di empat slide cuma memindahkan keluhan "sama semua" dari
  // foto ke latar belakang.
  const { slides } = rakit({ cover: COVER, gambar: 0 });
  const kelas = [];
  for (const i of [1, 2, 3, 4]) {
    const m = slides[i].match(/<div class="kartu (k\d)"><\/div>/);
    assert.ok(m, `slide ${i + 1} tanpa kartu — kemungkinan kanvas kosong`);
    kelas.push(m[1]);
  }
  assert.equal(new Set(kelas).size, 4, `kartu memakai pola yang sama: ${kelas.join(" ")}`);

  // Kelasnya harus benar-benar punya latar sendiri di CSS, bukan cuma nama kelas kosong.
  const css = gaya(slides[1]);
  const latar = kelas.map((k) => (css.match(new RegExp(`\\.${k}\\{background:([^}]+)\\}`)) || [, null])[1]);
  assert.ok(latar.every(Boolean), `ada kelas kartu tanpa background di CSS: ${kelas.join(" ")}`);
  assert.equal(new Set(latar).size, 4, "latar kartu ternyata sama walau kelasnya beda");
});

test("nol gambar lolos: tetap 5 slide, bukan crash pasangan indeks", () => {
  // Kuota gambar habis = `Slide base64` mengeluarkan SATU item kosong, bukan lima.
  // Kalau raster diturunkan dari item itu, panjangnya jadi 1 dan penjaga pasangan
  // per-indeks melempar — carousel-nya mati justru di kasus yang paling sering.
  for (const opsi of [{ gambar: 0 }, { gambar: 0, cover: COVER }]) {
    const r = rakit(opsi);
    assert.equal(r.slides.length, 5, "jumlah slide ikut menyusut");
    assert.equal(r.gambar_gagal, 5, "kegagalan tidak terhitung benar");
  }
});

test("kuota habis: slide 1 tetap berfoto, sisanya kartu — bukan lima foto sama", () => {
  // Ini yang terjadi 2026-08-13 dan seterusnya: kuota gambar habis, kelima panggilan
  // dibalas error. Dulu kelima slide jatuh ke foto artikel dengan crop berbeda, dan
  // itu yang dikeluhkan: satu gambar diulang lima kali.
  const { slides, gambar_gagal } = rakit({ cover: COVER, gambar: 0 });
  assert.equal(gambar_gagal, 5);
  assert.match(slides[0], /base64,Q09WRVI="/, "slide 1 kehilangan foto artikel");
  for (const i of [1, 2, 3, 4]) {
    assert.doesNotMatch(slides[i], /<img class="bg"/, `slide ${i + 1} masih memasang foto`);
    assert.match(slides[i], /<div class="kartu k\d">/, `slide ${i + 1} jadi kanvas kosong`);
  }
});

test("punya cover: tidak ada hero yang digenerate", () => {
  // Ini yang mencegah commit balik untuk artikel yang gambarnya sudah ada.
  assert.equal(rakit({ cover: COVER }).hero, null);
});

test("tanpa cover: slide 1 dari Gemini, dan hero dibuat", () => {
  const { slides, hero } = rakit();
  assert.match(slides[0], /src="data:image\/jpeg;base64,QUJD0"/);
  assert.ok(hero, "hero tidak dibuat padahal artikel tidak punya gambar");
  assert.match(hero, /width:1200px;height:630px/, "hero bukan lanskap 1200x630");
  assert.match(hero, /src="data:image\/jpeg;base64,QUJD0"/, "hero tidak memakai raster slide 1");
});

test("hero adalah foto polos — nol teks, nol logo, nol veil", () => {
  // Ini gambar artikel, bukan slide. Teks apa pun di sini ikut jadi thumbnail
  // website dan og:image, dan tidak bisa dihapus tanpa commit baru.
  const { hero } = rakit();
  for (const jejak of ["<h1", "<p", "veil", "Daffathan Labs", "class=\"logo\"", "nomor"]) {
    assert.ok(!hero.includes(jejak), `hero memuat ${jejak}`);
  }
});

test("tanpa cover dan semua gambar Gemini gagal: tidak ada hero kosong", () => {
  // Hero tanpa raster berarti commit gambar hitam polos ke repo. Lebih baik tidak
  // ada gambar sama sekali daripada gambar kosong yang permanen.
  const { hero, slides } = rakit({ gambar: 0 });
  assert.equal(hero, null);
  assert.equal(slides.length, 5, "carousel tetap terbit walau tanpa latar");
});

test("brief diteruskan ke cabang commit: repo dan nama berkas .md", () => {
  const r = rakit();
  assert.equal(r.repo, "Daffathan-Labs/Articles");
  assert.deepEqual(r.berkas_md, ["artikel-uji-id.md", "artikel-uji-en.md"]);
});

test("penekanan markdown dibuang dari slide DAN dari ketiga caption", () => {
  // Slide itu gambar, dan caption Instagram/Facebook/LinkedIn menampilkan teks apa
  // adanya — tidak satu pun merender markdown. Model rutin menulis *cameo* dan
  // *time skip*, dan itu terbit sekali di tiga slide Spider-Man sekaligus.
  const r = rakit({
    heading: "Aksi *berayun* yang persis seperti di game",
    body: "Gerakan *finishing move* dan **jaring** organik terasa `sangat` nyata.",
  });
  for (const [i, s] of r.slides.entries()) {
    // <style> dibuang dulu: CSS punya selector `*` dan komentar berbacktick, dan
    // dua-duanya tidak pernah sampai ke mata.
    const teks = s.replace(/<style>[\s\S]*?<\/style>/, "").replace(/src="data:[^"]*"/g, "");
    assert.doesNotMatch(teks, /\*|`/, `slide ${i + 1}: penanda markdown ikut kerender`);
  }
  // Isinya harus tetap utuh, cuma penandanya yang hilang. Huruf besarnya dari CSS
  // text-transform, jadi di HTML kata-katanya masih huruf kecil.
  assert.match(r.slides[0], />Aksi berayun yang/, "kata di dalam penekanan ikut terbuang");

  // Garis bawah TIDAK ikut dibuang: snake_case itu hal biasa di artikel teknis.
  assert.match(rakit({ heading: "Pakai user_id bukan email" }).slides[0], /user_id/);
});

test("hashtag dipotong 5 walau model mengirim lebih", () => {
  const r = rakit({ hashtags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g"] });
  const tag = r.ig_caption.split("\n\n").pop().split(" ");
  assert.deepEqual(tag, ["#a", "#b", "#c", "#d", "#e"]);
});

test("Rakit slide: tiap ronde benar-benar mengecil, dan berhenti di lantai", () => {
  // Kalau ini tidak turun, loop 8x cuma mengirim input identik ke render-svc
  // dan 422 yang deterministik akan gagal 8 kali dengan hasil sama persis.
  const ukuran = (ronde) => Number(rakit({ ronde }).slides[0].match(/h1\{font-size:(\d+)px/)[1]);
  const seri = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(ukuran);

  for (let i = 1; i < 6; i++) {
    assert.ok(seri[i] < seri[i - 1], `ronde ${i} (${seri[i]}px) harus < ronde ${i - 1}`);
  }
  assert.equal(seri[0], H1_RONDE0);
  assert.equal(seri[8], Math.round(H1_RONDE0 * 0.7), "lantai skala 70%");

  // Pemangkasan kata ikut turun.
  assert.doesNotMatch(rakit({ ronde: 0 }).slides[0], /…/);
  assert.match(rakit({ ronde: 8 }).slides[0], /…/, "ronde 8 harus memangkas kata");
});

test("Rakit slide: nol gambar tetap terbit, tidak melempar", () => {
  // Latar cuma dekorasi di opacity 42% di balik veil — menahan seluruh pipeline
  // karena hiasan itu salah tukar.
  const r = rakit({ gambar: 0 });
  assert.equal(r.slides.length, 5);
  assert.equal(r.gambar_gagal, 5);
  // Logo tetap ada; yang tidak boleh muncul adalah <img class="bg"> tanpa isi.
  assert.doesNotMatch(r.slides[0], /<img class="bg"/, "tanpa raster tidak boleh ada bg kosong");
  assert.match(r.slides[0], /<img class="logo"/, "logo tetap harus ada");
});

test("Rakit slide: sebagian gambar gagal — yang gagal TIDAK meminjam tetangga", () => {
  // Perilaku lama: slide gagal memakai raster slide pertama. Tiga slide meminjam gambar
  // yang sama, dan carousel-nya terbaca sebagai satu gambar diulang — persis keluhannya.
  const r = rakit({ gambar: 2 });
  assert.equal(r.gambar_gagal, 3);
  for (const i of [0, 1]) {
    assert.match(r.slides[i], new RegExp(`<img class="bg"[^>]*src="data:image/jpeg;base64,QUJD${i}"`));
  }
  for (const i of [2, 3, 4]) {
    assert.doesNotMatch(r.slides[i], /<img class="bg"/, `slide ${i + 1} meminjam gambar slide lain`);
  }
});

test("Pecah URL slide membaca hasil Render, bukan $input", () => {
  // Node ini berjalan SETELAH Tunggu approval, jadi $input berisi data request
  // webhook resume (query/body/headers) — bukan urls[] dari render-svc.
  const kode = byName["Pecah URL slide"].parameters.jsCode;
  assert.doesNotMatch(tanpaKomentar(kode), /\$input/, "$input di sini pasti kosong dari urls[]");

  const urls = ["a.jpg", "b.jpg", "c.jpg"];
  const $ = (n) => ({ first: () => ({ json: n === "Render" ? { urls } : {} }) });
  const hasil = new Function("$", kode)($);
  assert.deepEqual(hasil.map((i) => i.json.url), urls);
  assert.deepEqual(hasil.map((i) => i.json.idx), [0, 1, 2]);

  // urls[] kosong harus gagal berisik, bukan menerbitkan carousel bolong.
  const kosong = (n) => ({ first: () => ({ json: n === "Render" ? {} : {} }) });
  assert.throws(() => new Function("$", kode)(kosong), /tidak mengembalikan urls/);
});

test("Pecah URL slide: hero.jpg bukan slide, jadi tidak boleh masuk carousel", () => {
  // hero menumpang panggilan Render yang sama dan selalu jadi entri terakhir urls[].
  // Tanpa saringan dia jadi slide ke-6 di Instagram DAN foto ke-6 di Facebook —
  // gambar lanskap 1200x630 di-crop paksa jadi potret.
  const kode = byName["Pecah URL slide"].parameters.jsCode;
  const urls = [
    "https://r/a/portofolio/x/01.jpg?v=1",
    "https://r/a/portofolio/x/02.jpg?v=1",
    "https://r/a/portofolio/x/hero.jpg?v=1",
  ];
  const hasil = new Function("$", kode)((n) => ({
    first: () => ({ json: n === "Render" ? { urls } : {} }),
  }));
  assert.equal(hasil.length, 2, "hero ikut terkirim sebagai slide");
  assert.deepEqual(hasil.map((i) => i.json.idx), [0, 1], "indeks harus rapat setelah disaring");
});

// -- cabang Facebook (Halaman, nonaktif sampai kredensialnya ada) -----------------
const FB = ["FB unggah foto", "Kumpulkan foto FB", "FB posting"];

test("cabang FB nonaktif berarti nonaktif DAN terputus", () => {
  // Ini test yang paling menjaga: node nonaktif TIDAK dieksekusi n8n, sementara
  // node Merge menunggu semua input yang tersambung. Kalau cabang FB nonaktif tapi
  // tetap tersambung ke barrier, `Email hasil` menunggu selamanya — yang mati bukan
  // Facebook saja, tapi seluruh laporan hasil publish.
  const semuaNonaktif = FB.every((n) => byName[n]?.disabled === true);
  const barrier = semuaNonaktif ? "Tunggu 2 cabang" : "Tunggu 3 cabang";
  assert.ok(byName[barrier], `barrier harus bernama "${barrier}"`);
  assert.equal(byName[barrier].parameters.numberInputs, semuaNonaktif ? 2 : 3);

  const sumberBarrier = Object.entries(wf.connections).flatMap(([dari, t]) =>
    (t.main ?? []).flat().filter((c) => c.node === barrier).map((c) => `${dari}#${c.index}`)
  );
  assert.deepEqual(
    sumberBarrier.sort(),
    semuaNonaktif
      ? ["IG permalink#1", "LinkedIn post#0"]
      : ["FB posting#2", "IG permalink#1", "LinkedIn post#0"]
  );

  if (semuaNonaktif) {
    for (const n of FB) {
      assert.ok(!wf.connections[n], `${n} nonaktif tapi masih punya sambungan keluar`);
    }
  }
});

test("FB memakai host graph.facebook.com dan token Halaman, IG tidak", () => {
  // Meta punya dua jalur yang tidak saling kompatibel. Token yang benar di host yang
  // salah dibalas #190, dan pesan errornya tidak menyebut host sama sekali.
  for (const n of ["FB unggah foto", "FB posting"]) {
    const p = byName[n].parameters;
    assert.match(p.url, /graph\.facebook\.com/, `${n} salah host`);
    assert.doesNotMatch(p.url, /graph\.instagram\.com/);
    assert.match(JSON.stringify(p), /fb_page_token/, `${n} tidak memakai token Halaman`);
    assert.doesNotMatch(JSON.stringify(p), /ig_token|ig_user_id/, `${n} memakai kredensial IG`);
  }
  for (const n of ["IG item container", "IG carousel container", "IG publish", "IG permalink"]) {
    const p = byName[n].parameters;
    assert.match(p.url, /graph\.instagram\.com/, `${n} salah host`);
    assert.doesNotMatch(JSON.stringify(p), /fb_page/, `${n} memakai kredensial Facebook`);
  }
});

test("tiap foto FB diunggah published=false", () => {
  // Tanpa ini tiap slide jadi post sendiri: satu artikel membanjiri Halaman dengan
  // 5 post, bukan satu post berisi 5 foto.
  const p = byName["FB unggah foto"].parameters.bodyParameters.parameters;
  assert.equal(p.find((x) => x.name === "published").value, "false");
  assert.equal(p.find((x) => x.name === "url").value, "={{ $json.url }}");
});

test("Kumpulkan foto FB: bentuk attached_media[n] persis dokumentasi Meta", () => {
  const hasil = jalankan("Kumpulkan foto FB", {
    input: [{ json: { id: "111" } }, { json: { id: 222 } }, { json: { id: "333" } }],
  });
  assert.deepEqual(hasil[0].json.body, {
    "attached_media[0]": '{"media_fbid":"111"}',
    "attached_media[1]": '{"media_fbid":"222"}',
    "attached_media[2]": '{"media_fbid":"333"}',
  });
  assert.equal(hasil[0].json.jumlah, 3);
});

test("Kumpulkan foto FB: foto gagal dibuang bukan jadi media_fbid undefined", () => {
  // Node FB pakai onError:continueRegularOutput, jadi kegagalan datang sebagai item
  // tanpa `id` — bukan sebagai exception.
  assert.throws(
    () => jalankan("Kumpulkan foto FB", {
      input: [{ json: { id: "1" } }, { json: { error: { code: 190 } } }, { json: { id: "3" } }],
    }),
    /2\/3 foto FB berhasil/
  );
  assert.throws(
    () => jalankan("Kumpulkan foto FB", { input: [{ json: { id: "1" } }] }),
    /minimal 2 foto/
  );
});

test("FB posting mengirim body form-urlencoded hasil Kumpulkan, bukan keypair tetap", () => {
  // Jumlah lampiran ikut jumlah slide; daftar bodyParameters di n8n panjangnya tetap
  // saat build, jadi keypair tidak bisa dipakai di sini.
  const p = byName["FB posting"].parameters;
  assert.equal(p.contentType, "form-urlencoded");
  assert.equal(p.specifyBody, "json");
  assert.match(p.jsonBody, /\$json\.body/, "body lampiran tidak ikut terkirim");
  assert.match(p.jsonBody, /fb_caption/, "FB memakai caption yang salah");
  assert.match(p.url, /\/feed$/);
});

test("caption dipisah per platform, hashtag hanya ke Instagram", () => {
  const skema = JSON.parse(byName["Skema copy"].parameters.inputSchema);
  assert.ok(skema.required.includes("fb_caption"), "fb_caption tidak wajib di skema");
  assert.match(skema.properties.ig_caption.description, /30-60 kata/);
  assert.match(skema.properties.fb_caption.description, /150-250 kata/);

  const r = rakit({ hashtags: ["#satu", "#dua"] });
  assert.equal(r.fb_caption, "FB", "fb_caption tidak boleh dioplos apa pun");
  assert.match(r.ig_caption, /#satu #dua/, "hashtag hilang dari Instagram");

  // Node yang memakai caption mana — tertukar berarti IG dapat 250 kata terpotong.
  const igCap = byName["IG carousel container"].parameters.bodyParameters.parameters.find(
    (x) => x.name === "caption"
  ).value;
  assert.match(igCap, /\.ig_caption/);
  assert.doesNotMatch(byName["FB posting"].parameters.jsonBody, /\.ig_caption/);
});

test("e-mail hasil tetap terkirim walau cabang FB nonaktif", () => {
  // `$('FB posting').first()` pada node yang belum dieksekusi melempar "Referenced
  // node is unexecuted", dan yang hilang bukan satu baris tapi seluruh e-mail.
  const html = byName["Email hasil"].parameters.message;
  assert.match(html, /FB posting'\)\.isExecuted/, "baris Facebook tanpa penjaga isExecuted");
  for (const p of ["LinkedIn", "Instagram", "Facebook"]) {
    assert.match(html, new RegExp(`<li>${p}:`), `${p} tidak dilaporkan`);
  }
});

test("voice tersisip ke prompt, bukan tertinggal placeholder", () => {
  const prompt = byName["Gemini copy"].parameters.text;
  // Placeholder yang gagal terisi tidak bikin build gagal — model cuma menerima
  // teks "{{VOICE}}" mentah dan mengarang voice-nya sendiri. Ini yang menangkapnya.
  assert.doesNotMatch(prompt, /\{\{VOICE\}\}/, "placeholder tidak terisi");
  assert.match(prompt, /"aku", tidak pernah "saya"/);
  assert.match(prompt, /Sufiks `-ku`/, "isi docs/voice.md harus benar-benar masuk");
});

test("prompt melarang URL di slide dan membatasi hashtag 5", () => {
  const prompt = byName["Gemini copy"].parameters.text;
  assert.match(prompt, /DILARANG menulis URL/);
  assert.match(prompt, /MAKSIMAL 5 hashtag/);
  // Teks slide terakhir diisi sistem; model tidak boleh diminta menulisnya.
  assert.match(prompt, /SLIDE 5: heading dan body-nya DIISI SISTEM/);
});

test("Ambil cover tidak mematikan eksekusi saat artikel tidak punya gambar", () => {
  // Artikel tanpa gambar bikin URL-nya kosong dan node ini gagal — itu jalur normal,
  // bukan kondisi error. Tanpa onError, artikel tanpa gambar menghentikan seluruh
  // cabang sosmed.
  assert.equal(byName["Ambil cover"].onError, "continueRegularOutput");
  assert.match(byName["Ambil cover"].parameters.url, /\$json\.cover/);
  assert.equal(
    byName["Ambil cover"].parameters.options.response.response.responseFormat,
    "file"
  );
});

test("LinkedIn memakai gambar artikel, bukan slide ber-teks", () => {
  const u = byName["Ambil gambar LinkedIn"].parameters.url;
  // Urutannya penting: cover dulu, hero kedua, slide 01 sebagai jaring terakhir.
  const iCover = u.indexOf("json.cover");
  const iHero = u.indexOf("/hero.jpg");
  const iSlide = u.indexOf("urls[0]");
  assert.ok(iCover >= 0 && iHero > iCover && iSlide > iHero, `urutan fallback salah: ${u}`);
  assert.ok(!nama.has("Ambil slide 01"), "node lama masih ada");
});

test("hero ikut menumpang panggilan Render, dengan ukuran lanskap", () => {
  const b = byName["Render"].parameters.jsonBody;
  assert.match(b, /name: 'hero'/);
  assert.match(b, /w: 1200, h: 630/);
  // Slide TIDAK boleh ikut dikirimi w/h — Instagram butuh 1080x1350, dan render-svc
  // memakai default itu justru saat w/h tidak dikirim.
  assert.doesNotMatch(b, /padStart\(2, '0'\), html: h, w:/);
  // Ekspresinya panjang dan mudah salah kurung; pastikan JS-nya valid.
  assert.doesNotThrow(() => new Function(`return (${b.replace(/^=\{\{|\}\}$/g, "")})`));
});

test("gambar dikonversi JPEG sebelum masuk render", () => {
  // PNG mentah lima slide menembus batas body 8 MB render-svc dan gagal 413.
  const n = byName["Jadi JPEG"];
  assert.equal(n.parameters.options.format, "jpeg");
  assert.equal(n.parameters.height, 1350, "harus setinggi kanvas render");
});

test("semua e-mail lewat node Gmail, bukan SMTP", () => {
  const email = wf.nodes.filter((n) => /gmail|emailSend/.test(n.type));
  // Kirim preview, Email hasil, Lapor render gagal, Lapor dilewati, Lapor commit.
  assert.deepEqual(
    email.map((n) => n.name).sort(),
    ["Email hasil", "Kirim preview", "Lapor commit", "Lapor dilewati", "Lapor render gagal"]
  );
  for (const n of email) {
    assert.equal(n.type, "n8n-nodes-base.gmail", n.name);
    assert.equal(n.parameters.emailType, "html", n.name);
    // Tanpa ini n8n menempelkan baris promosinya sendiri di tiap e-mail.
    assert.equal(n.parameters.options.appendAttribution, false, n.name);
    assert.match(n.parameters.sendTo, /json\.notify_email/, n.name);
  }
});

// -- cabang commit balik ----------------------------------------------------------
/** Jalankan sumber Code node asli dari JSON, dengan node lain dipalsukan. */
const jalankan = (nodeName, { input = [], refs = {} } = {}) => {
  const $ = (n) => {
    if (!(n in refs)) throw new Error(`test tidak menyiapkan node "${n}"`);
    const arr = Array.isArray(refs[n]) ? refs[n] : [refs[n]];
    return { first: () => arr[0], all: () => arr };
  };
  const $input = { first: () => input[0], all: () => input };
  return new Function("$", "$input", byName[nodeName].parameters.jsCode)($, $input);
};

const RENCANA = {
  hero: "<html>hero</html>",
  repo: "Daffathan-Labs/Articles",
  folder: "artikel-uji",
  berkas_md: ["artikel-uji-id.md", "artikel-uji-en.md"],
};
const URLS = {
  urls: [
    "https://r/a/portofolio/artikel-uji/01.jpg?v=1",
    "https://r/a/portofolio/artikel-uji/hero.jpg?v=1",
  ],
};
const susun = (rakit = RENCANA, render = URLS) =>
  jalankan("Susun commit", { refs: { "Rakit slide": { json: rakit }, Render: { json: render } } });

test("Susun commit: artikel yang sudah punya gambar tidak memicu commit apa pun", () => {
  // Nol item berarti seluruh rantai di bawahnya tidak dieksekusi — ini yang membuat
  // 45 artikel yang sudah ada tidak pernah tersentuh.
  assert.deepEqual(susun({ ...RENCANA, hero: null }), []);
});

test("Susun commit: path dan URL raw dibentuk persis seperti 45 artikel yang ada", () => {
  const j = susun()[0].json;
  assert.equal(j.path_gambar, "articles/artikel-uji/hero.jpg");
  assert.equal(
    j.url_gambar,
    "https://raw.githubusercontent.com/Daffathan-Labs/Articles/main/articles/artikel-uji/hero.jpg"
  );
  // Hero dicari lewat nama berkas, bukan indeks: urls juga memuat 5 slide.
  assert.match(j.sumber, /hero\.jpg/);
});

test("Susun commit: menolak repo/folder yang bisa menulis ke path salah", () => {
  for (const buruk of [
    { repo: "" }, { repo: "tanpa-slash" }, { repo: "a/b/c" },
    { folder: "../rahasia" }, { folder: "" }, { berkas_md: [] },
  ]) {
    assert.throws(() => susun({ ...RENCANA, ...buruk }), `${JSON.stringify(buruk)} lolos`);
  }
});

test("Susun commit: hero disusun tapi tidak terender = berhenti, bukan commit URL 404", () => {
  assert.throws(
    () => susun(RENCANA, { urls: ["https://r/a/portofolio/artikel-uji/01.jpg"] }),
    /tidak ada di balasan render-svc/
  );
});

test("Pecah md: gambar gagal di-commit = markdown tidak disentuh", () => {
  // Urutan ini yang mencegah markdown menunjuk URL yang masih 404.
  const refs = { "Susun commit": susun()[0] };
  assert.throws(
    () => jalankan("Pecah md", { input: [{ json: { message: "Bad credentials" } }], refs }),
    /markdown tidak disentuh/
  );
  // 422 "already exists" dianggap sukses: berkasnya ada, dan itu yang penting.
  const lolos = jalankan("Pecah md", {
    input: [{ json: { message: 'hero.jpg already exists' } }],
    refs,
  });
  assert.equal(lolos.length, 2);
  assert.deepEqual(lolos.map((i) => i.json.path), [
    "articles/artikel-uji/artikel-uji-id.md",
    "articles/artikel-uji/artikel-uji-en.md",
  ]);
});

// -- sisip-gambar diuji terhadap artikel SUNGGUHAN --------------------------------
const ARTIKEL = path.join(
  import.meta.dirname, "..", "articles",
  "automate-screenshot-playwright", "automate-screenshot-playwright-id.md"
);

/** Buang dua baris gambar dari artikel asli, jadi seolah artikel tanpa gambar. */
function tanpaGambar(teks) {
  return teks
    .split("\n")
    .filter((b) => !/^<!--\s*image:/i.test(b) && !/^<img[^>]+src=/i.test(b))
    .join("\n");
}

const sisip = (isiAsli, url = "https://raw.githubusercontent.com/O/R/main/articles/f/hero.jpg") => {
  const path_ = "articles/f/f-id.md";
  return jalankan("Sisip gambar", {
    input: [{ json: { path: path_, sha: "SHA1", content: Buffer.from(isiAsli, "utf8").toString("base64") } }],
    refs: { "Pecah md": [{ json: { path: path_, url_gambar: url, repo: "O/R" } }] },
  });
};

test("Sisip gambar: mengubah tepat dua baris, sisanya identik", () => {
  const asli = fs.readFileSync(ARTIKEL, "utf8");
  const kosong = tanpaGambar(asli);
  const hasil = Buffer.from(sisip(kosong)[0].json.isi_b64, "base64").toString("utf8");

  const baru = hasil.split("\n").filter((b) => !kosong.split("\n").includes(b) || b === "");
  const ditambah = hasil.split("\n").length - kosong.split("\n").length;
  assert.equal(ditambah, 2, `baris bertambah ${ditambah}, harusnya 2`);
  // Berkas orang lain: setiap baris yang tidak disentuh harus tetap utuh, urut.
  assert.deepEqual(
    hasil.split("\n").filter((b) => !/^<!--\s*image:/i.test(b) && !/^<img/i.test(b)),
    kosong.split("\n"),
    "ada baris lain yang ikut berubah"
  );
  assert.ok(baru.length >= 0);
});

test("Sisip gambar: metadata setelah excerpt, <img> setelah judul H1", () => {
  const kosong = tanpaGambar(fs.readFileSync(ARTIKEL, "utf8"));
  const baris = Buffer.from(sisip(kosong)[0].json.isi_b64, "base64").toString("utf8").split("\n");
  const iExcerpt = baris.findIndex((b) => /^<!--\s*excerpt:/i.test(b));
  const iImageMeta = baris.findIndex((b) => /^<!--\s*image:/i.test(b));
  const iJudul = baris.findIndex((b) => /^#\s+\S/.test(b));
  const iImg = baris.findIndex((b) => /^<img/i.test(b));
  assert.equal(iImageMeta, iExcerpt + 1, "baris metadata tidak tepat setelah excerpt");
  assert.ok(iImg > iJudul, "<img> harus setelah judul H1, sama seperti artikel lain");
  assert.ok(iImg < iJudul + 4, "<img> terlalu jauh dari judul");
});

test("Sisip gambar: alt di-escape, tidak bisa memecah atribut", () => {
  const jahat = '<!-- title: Judul "kutip" & <tag> -->\n<!-- excerpt: x -->\n\n# Judul\n\nisi\n';
  const hasil = Buffer.from(sisip(jahat)[0].json.isi_b64, "base64").toString("utf8");
  assert.match(hasil, /alt="Judul &quot;kutip&quot; &amp; &lt;tag&gt;"/);
});

test("Sisip gambar: artikel yang sudah punya gambar dilewati, bukan ditimpa", () => {
  // Kalau ada yang menambahkan gambar di antara publish dan commit, gambar pilihan
  // manusia menang atas gambar mesin.
  const asli = fs.readFileSync(ARTIKEL, "utf8");
  const out = sisip(asli)[0].json;
  assert.equal(out.lewati, true);
  assert.equal(out.isi_b64, undefined, "berkas tetap ditulis padahal harus dilewati");
});

test("cabang commit tidak bisa menjatuhkan approval yang sedang menunggu", () => {
  // Cabang ini berjalan berdampingan dengan Wait 48 jam. Satu node yang gagal keras
  // di sini akan menjatuhkan eksekusi yang sedang menahan artikel orang.
  for (const n of ["Ambil hero", "Simpan gambar", "Ambil md", "Simpan md"]) {
    assert.equal(byName[n].onError, "continueRegularOutput", n);
  }
  // Dan cabangnya memang berangkat dari keluaran sukses Render, sejajar Kirim preview.
  const dariRender = wf.connections["Render"].main[0].map((c) => c.node);
  assert.deepEqual(dariRender.sort(), ["Kirim preview", "Susun commit"]);
});

test("commit ke GitHub memakai token dari Kredensial dan header API yang benar", () => {
  for (const n of ["Simpan gambar", "Ambil md", "Simpan md"]) {
    const h = Object.fromEntries(
      byName[n].parameters.headerParameters.parameters.map((p) => [p.name, p.value])
    );
    assert.match(h.Authorization, /json\.github_token/, n);
    assert.equal(h["X-GitHub-Api-Version"], "2022-11-28", n);
  }
  assert.equal(byName["Simpan gambar"].parameters.method, "PUT");
  assert.equal(byName["Simpan md"].parameters.method, "PUT");
  // Berkas baru tidak boleh mengirim sha; berkas yang ditimpa wajib.
  assert.doesNotMatch(byName["Simpan gambar"].parameters.jsonBody, /sha:/);
  assert.match(byName["Simpan md"].parameters.jsonBody, /sha: \$json\.sha/);
});

test("render punya loop retry 8x yang benar-benar mengubah input", () => {
  const gate = byName["Coba render lagi?"];
  assert.match(gate.parameters.conditions.conditions[0].leftValue, /\$runIndex/);
  assert.equal(gate.parameters.conditions.conditions[0].rightValue, 8);

  // Output error Render harus masuk ke gate, bukan langsung ke e-mail gagal.
  assert.deepEqual(wf.connections["Render"].main[1], [
    { node: "Coba render lagi?", type: "main", index: 0 },
  ]);
  // Gate harus kembali ke Rakit slide — di situlah teks diperkecil tiap ronde.
  // Kalau loop-nya balik ke node lain, 8 percobaan mengirim input identik dan
  // 422 yang deterministik akan gagal 8 kali dengan hasil yang sama persis.
  assert.deepEqual(wf.connections["Coba render lagi?"].main[0], [
    { node: "Rakit slide", type: "main", index: 0 },
  ]);
  assert.match(byName["Rakit slide"].parameters.jsCode, /\$runIndex/);
});

// ─────────────────────────────────────────── workflow 2: perpanjang token IG
const rf = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "refresh-ig-token.json"), "utf8")
);
const rfNama = new Set(rf.nodes.map((n) => n.name));
const rfBy = Object.fromEntries(rf.nodes.map((n) => [n.name, n]));
const rfKred = (f) =>
  rfBy["Kredensial"].parameters.assignments.assignments.find((a) => a.name === f).value;

test("refresh: koneksi dan referensi node valid, Code node lolos parse", () => {
  for (const [dari, tipe] of Object.entries(rf.connections)) {
    assert.ok(rfNama.has(dari), `sumber koneksi tidak ada: ${dari}`);
    for (const grup of Object.values(tipe))
      for (const keluaran of grup)
        for (const c of keluaran) assert.ok(rfNama.has(c.node), `${dari} -> ${c.node} tidak ada`);
  }
  for (const n of rf.nodes) {
    for (const s of strings(n.parameters))
      for (const m of tanpaKomentar(s).matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g))
        assert.ok(rfNama.has(m[1]), `"${n.name}" mereferensi "${m[1]}" yang tidak ada`);
    if (n.type === "n8n-nodes-base.code")
      assert.doesNotThrow(() => new Function(n.parameters.jsCode), n.name);
  }
  // Rantainya lurus: tiap node kecuali yang terakhir harus punya keluaran.
  for (const n of rf.nodes) {
    if (n.name === "Lapor token") continue;
    assert.ok(rf.connections[n.name], `${n.name} tidak tersambung ke mana-mana`);
  }
});

test("refresh: dipicu jadwal bulanan, bukan webhook", () => {
  const t = rfBy["Tiap bulan"];
  assert.equal(t.type, "n8n-nodes-base.scheduleTrigger");
  const iv = t.parameters.rule.interval[0];
  assert.equal(iv.field, "months");
  // Bulanan di token berumur 60 hari = satu eksekusi boleh gagal tanpa token mati.
  assert.equal(iv.triggerAtDayOfMonth, 1);
  assert.equal(rf.nodes.filter((n) => n.type === "n8n-nodes-base.webhook").length, 0);
});

test("refresh: file ter-commit tidak membawa API key hidup", () => {
  // Kunci API n8n bisa mengubah SEMUA workflow — paling berbahaya dari semua rahasia
  // di repo ini kalau sampai bocor.
  for (const f of ["n8n_api_key", "workflow_id", "notify_email"]) {
    assert.match(rfKred(f), PLACEHOLDER, `${f} membawa nilai asli`);
  }
  assert.doesNotMatch(JSON.stringify(rf), /IGAA[A-Za-z0-9]/, "token Instagram ikut ter-commit");
});

test("refresh: memanggil endpoint dan host yang benar", () => {
  const r = rfBy["Refresh token"];
  assert.match(r.parameters.url, /^https:\/\/graph\.instagram\.com\/refresh_access_token$/);
  const q = Object.fromEntries(
    r.parameters.queryParameters.parameters.map((p) => [p.name, p.value])
  );
  assert.equal(q.grant_type, "ig_refresh_token");
  assert.match(q.access_token, /token_lama/);
  // Endpoint ini khusus jalur login Instagram; host jalur Facebook membalas error.
  assert.doesNotMatch(JSON.stringify(rf), /graph\.facebook\.com/);
});

test("refresh: menyimpan balik lewat PUT, dengan API key di header", () => {
  const s = rfBy["Simpan workflow"];
  assert.equal(s.parameters.method, "PUT");
  assert.match(s.parameters.url, /\/api\/v1\/workflows\//);
  for (const n of ["Ambil workflow", "Simpan workflow"]) {
    const h = rfBy[n].parameters.headerParameters.parameters.map((p) => p.name);
    assert.deepEqual(h, ["X-N8N-API-KEY"], n);
  }
});

// -- jalankan sumber Code node yang asli, bukan salinan --------------------------
const jalan = (nodeName, input, refs = {}) => {
  const $ = (n) => {
    if (!(n in refs)) throw new Error(`test tidak menyiapkan node "${n}"`);
    return { first: () => ({ json: refs[n] }), all: () => [{ json: refs[n] }] };
  };
  const $input = { first: () => ({ json: input }) };
  return new Function("$", "$input", rfBy[nodeName].parameters.jsCode)($, $input);
};

/** Bentuk minimal workflow publish seperti yang dikembalikan GET /workflows/{id}. */
const wfPalsu = (token) => ({
  id: "abc123",
  name: "Portofolio Publish",
  active: true,
  versionId: "v-1",
  createdAt: "2026-01-01",
  pinData: {},
  meta: { instanceId: "x" },
  connections: { Webhook: { main: [[]] } },
  settings: { executionOrder: "v1" },
  nodes: [
    { name: "Webhook", parameters: {} },
    {
      name: "Kredensial",
      parameters: {
        assignments: {
          assignments: [
            { id: "ig_token", name: "ig_token", value: token, type: "string" },
            { id: "site_url", name: "site_url", value: "https://x", type: "string" },
          ],
        },
      },
    },
  ],
});

test("Ambil token lama: membaca ig_token dari node Kredensial", () => {
  const out = jalan("Ambil token lama", wfPalsu("IGAA-token-lama"));
  assert.equal(out[0].json.token_lama, "IGAA-token-lama");
});

test("Ambil token lama: gagal keras kalau workflow_id salah atau token kosong", () => {
  // Tanpa ini refresh ditembak dengan nilai kosong dan Meta membalas error yang
  // tidak menyebut sebab aslinya.
  assert.throws(() => jalan("Ambil token lama", { name: "Lain", nodes: [] }), /nodes\[\]/);
  const tanpaKred = wfPalsu("x");
  tanpaKred.nodes = [{ name: "Webhook", parameters: {} }];
  assert.throws(() => jalan("Ambil token lama", tanpaKred), /tidak punya node bernama "Kredensial"/);
  assert.throws(() => jalan("Ambil token lama", wfPalsu("ISI_IG_ACCESS_TOKEN")), /placeholder/);
  // Placeholder berangka harus ikut tertangkap, bukan lolos jadi "token".
  assert.throws(() => jalan("Ambil token lama", wfPalsu("ISI_N8N_API_KEY")), /placeholder/);
});

test("Susun workflow baru: hanya ig_token yang berubah, node lain utuh", () => {
  const out = jalan("Susun workflow baru", { access_token: "IGAA-baru" }, {
    "Ambil workflow": wfPalsu("IGAA-lama"),
  });
  const body = out[0].json.body;
  const kredBaru = body.nodes.find((n) => n.name === "Kredensial");
  const f = (n) => kredBaru.parameters.assignments.assignments.find((a) => a.name === n).value;
  assert.equal(f("ig_token"), "IGAA-baru");
  assert.equal(f("site_url"), "https://x", "field lain ikut tersentuh");
  assert.equal(body.nodes.length, 2, "node lain hilang dari badan PUT");
  assert.deepEqual(body.connections, { Webhook: { main: [[]] } });
});

test("Susun workflow baru: badan PUT hanya empat properti yang diizinkan", () => {
  // id/active/versionId/pinData/meta/createdAt yang ikut terkirim dibalas 400
  // "must NOT have additional properties", dan pesannya tidak menyebut yang mana.
  const out = jalan("Susun workflow baru", { access_token: "IGAA-baru" }, {
    "Ambil workflow": wfPalsu("IGAA-lama"),
  });
  assert.deepEqual(Object.keys(out[0].json.body).sort(), [
    "connections",
    "name",
    "nodes",
    "settings",
  ]);
});

test("Susun workflow baru: refresh gagal atau token tidak berubah = berhenti", () => {
  const refs = { "Ambil workflow": wfPalsu("IGAA-lama") };
  assert.throws(
    () => jalan("Susun workflow baru", { error: { message: "boom" } }, refs),
    /tidak mengembalikan access_token/
  );
  // Menyimpan token yang sama tidak merusak apa pun, tapi juga tidak memperpanjang
  // apa pun — dan bulan depan tokennya mati tanpa ada yang pernah memberi tahu.
  assert.throws(
    () => jalan("Susun workflow baru", { access_token: "IGAA-lama" }, refs),
    /identik dengan yang lama/
  );
});

test("Cek token: hasil sehat dilaporkan tanpa membocorkan token utuh", () => {
  const out = jalan("Cek token", wfPalsu("IGAA-token-baru"), {
    "Refresh token": { access_token: "IGAA-token-baru", expires_in: 5168940 },
    "Ambil token lama": { token_lama: "IGAA-token-lama" },
  })[0].json;
  assert.equal(out.ok, true);
  assert.deepEqual(out.masalah, []);
  assert.equal(out.hari, 60);
  assert.match(out.kedaluwarsa, /^\d{4}-\d{2}-\d{2}$/);
  // E-mail itu penyimpanan jangka panjang tanpa enkripsi — cukup ekornya.
  assert.equal(out.ekor_baru, "n-baru");
  assert.equal(out.ekor_lama, "n-lama");
  assert.ok(!JSON.stringify(out).includes("IGAA"), "token utuh ikut masuk laporan");
});

test("Cek token: PUT yang tidak benar-benar menyimpan ketahuan", () => {
  // HTTP 200 tidak cukup: kalau nilai yang tersimpan masih yang lama, bulan depan
  // tokennya mati padahal semua eksekusi terlihat hijau.
  const out = jalan("Cek token", wfPalsu("IGAA-token-lama"), {
    "Refresh token": { access_token: "IGAA-token-baru", expires_in: 5168940 },
    "Ambil token lama": { token_lama: "IGAA-token-lama" },
  })[0].json;
  assert.equal(out.ok, false);
  assert.match(out.masalah.join(" "), /tidak berubah/);
});

test("Cek token: workflow yang jadi nonaktif ikut dilaporkan", () => {
  // PUT mengganti seluruh workflow. Kalau sampai menonaktifkannya, webhook publish
  // mati dan push berikutnya gagal tanpa sebab yang kelihatan.
  const mati = wfPalsu("IGAA-token-baru");
  mati.active = false;
  const out = jalan("Cek token", mati, {
    "Refresh token": { access_token: "IGAA-token-baru", expires_in: 5168940 },
    "Ambil token lama": { token_lama: "IGAA-token-lama" },
  })[0].json;
  assert.equal(out.ok, false);
  assert.match(out.masalah.join(" "), /NONAKTIF/);
});

test("Cek token: refresh yang gagal tetap sampai ke e-mail, bukan diam", () => {
  const out = jalan("Cek token", wfPalsu("IGAA-token-lama"), {
    "Refresh token": { error: { message: "token kedaluwarsa" } },
    "Ambil token lama": { token_lama: "IGAA-token-lama" },
  })[0].json;
  assert.equal(out.ok, false);
  assert.match(out.masalah.join(" "), /refresh gagal/);
  assert.equal(rfBy["Refresh token"].onError, "continueRegularOutput");
  assert.equal(rfBy["Simpan workflow"].onError, "continueRegularOutput");
});

// ═══════════ workflow turunan: kirim ulang tanpa LinkedIn ═══════════════════════
// Dipakai untuk artikel yang sudah terlanjur ada di LinkedIn tapi belum di
// Instagram/Facebook. Diturunkan dari workflow normal lewat tanpaLinkedIn() di
// build.mjs, jadi yang diuji di sini adalah hasil transformnya — bukan salinan
// logikanya.
const ul = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "portofolio-ulang.json"), "utf8")
);
const ulBy = Object.fromEntries(ul.nodes.map((n) => [n.name, n]));

/** Semua sambungan main yang masuk ke `ke`, sebagai "NodeAsal#index". */
const masukKe = (w, ke) =>
  Object.entries(w.connections).flatMap(([dari, t]) =>
    (t.main ?? []).flat().filter((c) => c.node === ke).map((c) => `${dari}#${c.index}`)
  );

test("transform tidak menyentuh workflow normal", () => {
  // Yang paling penting di berkas ini: bug di tanpaLinkedIn() merusak jalur produksi,
  // bukan cuma varian kirim-ulangnya.
  assert.deepEqual(
    wf.nodes.filter((n) => /LinkedIn/.test(n.name)).map((n) => n.name).sort(),
    ["Ambil gambar LinkedIn", "LinkedIn init upload", "LinkedIn post", "LinkedIn upload"]
  );
  assert.ok(byName["Tunggu 3 cabang"], "barrier workflow normal ikut ter-rename");
  assert.equal(wf.nodes.length - ul.nodes.length, 4, "yang dibuang harus persis 4 node");
});

test("workflow ulang: nol jejak LinkedIn, sampai ke ekspresi", () => {
  assert.deepEqual(ul.nodes.filter((n) => /LinkedIn/i.test(n.name)), []);
  for (const [dari, t] of Object.entries(ul.connections)) {
    for (const c of (t.main ?? []).flat()) {
      assert.ok(ulBy[c.node], `${dari} menyambung ke node yang sudah dibuang: ${c.node}`);
    }
  }
  // Node yang hilang tapi ekspresinya tertinggal tidak bikin n8n menolak import —
  // dia meledak saat jalan, dan yang hilang seluruh e-mail, bukan satu baris.
  assert.equal(JSON.stringify(ul).match(/\$\('LinkedIn[^']*'\)/g), null);
});

test("barrier kedua workflow: indeks rapat, jumlah cocok", () => {
  // Node Merge menunggu SEMUA input yang tersambung. Satu indeks berlubang bikin
  // `Email hasil` menggantung selamanya, dan tidak ada pesan error apa pun.
  for (const [label, w] of [["normal", wf], ["ulang", ul]]) {
    const b = w.nodes.find((n) => n.type === "n8n-nodes-base.merge");
    const idx = masukKe(w, b.name).map((s) => Number(s.split("#")[1])).sort();
    assert.deepEqual(idx, [...idx.keys()], `${label}: indeks input barrier berlubang`);
    assert.equal(b.parameters.numberInputs, idx.length, `${label}: numberInputs tidak cocok`);
    assert.equal(b.name, `Tunggu ${idx.length} cabang`, `${label}: nama barrier berbohong`);
  }
});

test("workflow ulang: setiap node tetap terjangkau dari Webhook", () => {
  const lihat = new Set();
  (function jalan(n) {
    if (lihat.has(n)) return;
    lihat.add(n);
    for (const cabang of ul.connections[n]?.main ?? []) for (const c of cabang) jalan(c.node);
  })("Webhook");
  const subNode = new Set(
    ul.nodes
      .filter((n) => Object.keys(ul.connections[n.name] ?? {}).some((t) => t.startsWith("ai_")))
      .map((n) => n.name)
  );
  const putus = ul.nodes
    .map((n) => n.name)
    .filter((n) => !lihat.has(n) && !subNode.has(n) && !ulBy[n].disabled);
  assert.deepEqual(putus, [], `node tidak terjangkau: ${putus.join(", ")}`);
});

test("kedua workflow berbagi path webhook yang sama", () => {
  // Inilah yang bikin Action GitHub memicu salah satu tanpa WEBHOOK_URL disentuh:
  // yang menjawab adalah yang sedang aktif. n8n juga menolak dua workflow aktif
  // berbagi path, jadi "cuma satu yang aktif" dipaksa n8n, bukan diingat manusia.
  const p = (w) => w.nodes.find((n) => n.type === "n8n-nodes-base.webhook").parameters.path;
  assert.equal(p(ul), p(wf));
});

test("setiap e-mail dari workflow ulang berawalan [ULANG]", () => {
  // Penjaga jebakan terakhir: kalau lupa mengaktifkan lagi workflow normal, artikel
  // berikutnya diam-diam tidak naik ke LinkedIn. Awalan ini yang memberi tahu — di
  // subject, sebelum tombol Approve diklik.
  const gmail = ul.nodes.filter((n) => n.type === "n8n-nodes-base.gmail");
  assert.ok(gmail.length >= 4, `cuma ${gmail.length} node Gmail di workflow ulang`);
  for (const n of gmail) {
    assert.match(n.parameters.subject, /^=?\[ULANG\] /, `subject "${n.name}" tanpa awalan`);
  }
  for (const n of wf.nodes.filter((x) => x.type === "n8n-nodes-base.gmail")) {
    assert.doesNotMatch(n.parameters.subject, /\[ULANG\]/, `${n.name} normal ikut ter-awali`);
  }
});

test("e-mail workflow ulang cuma menawarkan dan melaporkan platform yang ada", () => {
  const preview = ulBy["Kirim preview"].parameters.message;
  assert.doesNotMatch(preview, /linkedin_caption|LinkedIn \(EN\)/, "caption LinkedIn tertinggal");
  assert.match(preview, /ig_caption/);
  assert.match(preview, /fb_caption/, "caption Facebook harus ikut ditinjau sebelum approve");
  assert.match(preview, /posting ke Instagram \+ Facebook/, "tombol Approve berbohong");

  const hasil = ulBy["Email hasil"].parameters.message;
  assert.doesNotMatch(hasil, /<li>LinkedIn:/);
  for (const p of ["Instagram", "Facebook"]) {
    assert.match(hasil, new RegExp(`<li>${p}:`), `${p} tidak dilaporkan`);
  }
});

test("ID kredensial node terisi nilai asli, bukan placeholder", () => {
  // `tulis()` cuma menyulih node `Kredensial`; blok `credentials` di node tidak
  // ikut. Jadi placeholder di sini tetap placeholder bahkan di berkas .local.json,
  // dan matinya baru terasa di tengah eksekusi — setelah artikelnya terlanjur
  // terbit ke website. ID kredensial bukan rahasia (isinya tetap tinggal di n8n),
  // jadi tidak ada alasan menyamarkannya.
  for (const w of [wf, ul, rf]) {
    for (const n of w.nodes.filter((x) => x.credentials)) {
      for (const [tipe, c] of Object.entries(n.credentials)) {
        assert.doesNotMatch(
          c.id,
          /^ISI_/,
          `${w.name} / ${n.name} / ${tipe}: id kredensial masih placeholder`
        );
        // "…account 2" (PfgTbWO9gTZ5Se4l) milik orang lain dan project-nya tanpa
        // billing. Teks dan skema tetap jalan dengan key itu, jadi kegagalannya cuma
        // muncul di generasi gambar: 429 `free_tier_requests, limit: 0`, yang dilaporkan
        // n8n sebagai "receiving too many requests" — kelihatan seperti masalah sesaat,
        // padahal jatahnya nol dan tidak akan berubah sendiri.
        assert.notEqual(
          c.id,
          'PfgTbWO9gTZ5Se4l',
          `${w.name} / ${n.name}: kredensial Gemini tanpa billing terpasang lagi`
        );
      }
    }
  }
});

test("hashtag selalu berawalan # walau model mengembalikan kata telanjang", () => {
  // Sudah kejadian: model membalas ["spiderman","marvel","mcu"] tanpa "#", dan
  // caption yang terbit jadi deretan kata biasa — tidak bisa diklik, tidak masuk
  // pencarian mana pun. Prompt sudah meminta hashtag; yang menegakkan harus kode.
  const tag = (h) => rakit({ hashtags: h }).ig_caption.split("\n\n").pop();

  assert.equal(tag(["spiderman", "marvel", "mcu"]), "#spiderman #marvel #mcu");
  assert.equal(tag(["#sudah", "belum"]), "#sudah #belum", "yang sudah punya # tidak jadi ##");
  assert.equal(tag(["##dobel"]), "#dobel");
  assert.equal(tag(["brand new day"]), "#brandnewday", "spasi memotong tagar jadi satu kata");
  assert.equal(tag(["  spasi  "]), "#spasi");
  assert.equal(tag(["a", "b", "c", "d", "e", "f", "g"]), "#a #b #c #d #e", "batas 5 tetap");
  // Entri kosong tidak boleh jadi "#" telanjang.
  assert.equal(tag(["", "  ", "#", "isi"]), "#isi");

  // Nol hashtag: caption berakhir di CTA, tanpa baris kosong menggantung.
  const kosong = rakit({ hashtags: [] }).ig_caption;
  assert.doesNotMatch(kosong, /#/);
  assert.doesNotMatch(kosong, /\n\n$/);
});

// ═══════════ desain slide: foto tampil utuh, warna ikut tema ════════════════════
const LAYOUT = ["blok-bawah", "pias-bawah", "tengah"];
/** Ukuran font h1 dan seluruh CSS satu slide, untuk diperiksa aturan per aturan. */
const gaya = (s) => s.match(/<style>([\s\S]*?)<\/style>/)[1];

test("foto tampil UTUH — nol lapisan yang menutup seluruh kanvas", () => {
  // Ini test yang paling menjaga, dan yang paling mudah jebol lagi. Versi lama
  // memasang foto di opacity .42 lalu menimpanya veil .62-.96 sekanvas: yang sampai
  // ke mata tinggal 16% di ujung atas dan 1,7% di bawah, jadi review film dan catatan
  // teknis menghasilkan kotak hitam yang sama persis.
  for (const layout of LAYOUT) {
    const css = gaya(rakit({ layout }).slides[0]);

    // .bg tidak boleh diredupkan sama sekali.
    const bg = css.match(/\.bg\{([^}]*)\}/)[1];
    assert.doesNotMatch(bg, /opacity/, `${layout}: .bg diberi opacity lagi`);

    // Lapisan sekanvas yang tersisa hanya .redup, dan dia harus tipis. Ambang .35
    // dipilih supaya "sedikit menahan foto putih" tetap boleh, tapi "menutupi foto"
    // tidak — veil lama mulai dari .62.
    const redup = Number(css.match(/\.redup\{[^}]*rgba\(11,15,20,([\d.]+)\)/)[1]);
    assert.ok(redup <= 0.35, `${layout}: redup sekanvas ${redup} — foto ketutup lagi`);
    assert.doesNotMatch(css, /\.veil/, `${layout}: veil sekanvas hidup lagi`);
  }
});

test("teks selalu punya pelindungnya sendiri, di ketiga layout", () => {
  // Kontras dijaga LOKAL sekarang. Kalau .teks kehilangan latarnya, judul putih
  // duduk langsung di atas foto — dan foto yang kebetulan terang bikin slide-nya
  // tidak terbaca sama sekali.
  for (const layout of LAYOUT) {
    const css = gaya(rakit({ layout }).slides[0]);
    const kelas = { "blok-bawah": "l-blok", "pias-bawah": "l-pias", tengah: "l-tengah" }[layout];
    const aturan = css.match(new RegExp(`\.${kelas} \.teks\{([^}]*)\}`))[1];
    assert.match(aturan, /background:/, `${layout}: .teks tanpa latar pelindung`);
  }
});

test("wadah teks tidak boleh overflow:hidden — itu yang bikin 422 bisa muncul", () => {
  // render-svc aturan 11 mengukur scrollHeight setelah layout jadi. Kalau .teks
  // menutup luapannya sendiri, scrollHeight tidak pernah tumbuh: teks terpotong
  // diam-diam, render dibalas 200, dan loop penyusutan ronde tidak pernah jalan.
  for (const layout of LAYOUT) {
    const css = gaya(rakit({ layout }).slides[0]);
    for (const m of css.matchAll(/\.teks\{([^}]*)\}/g)) {
      assert.doesNotMatch(m[1], /overflow:\s*hidden/, `${layout}: .teks menutup luapannya`);
    }
  }
});

test("aksen dari model tidak dipercaya: bentuk, kontras, DAN keluarga warna", () => {
  const dipakai = (accent) => gaya(rakit({ accent }).slides[0]).match(/\.kicker\{[^}]*background:(#[0-9A-Fa-f]{6})/)[1];

  // Keluarga biru (hue 180-265) yang cukup pekat dipakai apa adanya.
  assert.equal(dipakai("#1B4FA8"), "#1B4FA8", "biru tua ditolak");
  assert.equal(dipakai("#0E7490"), "#0E7490", "teal ditolak");
  assert.equal(dipakai("#3730A3"), "#3730A3", "indigo ditolak");
  assert.equal(dipakai("#1b4fa8"), "#1B4FA8", "huruf kecil tetap diterima");

  // Bentuk salah -> biru brand. `undefined` tidak ikut didaftar karena default
  // parameter di rakit() akan menelannya; jalur "model tidak mengirim accent sama
  // sekali" sudah diwakili `null` — kodenya memperlakukan keduanya identik lewat
  // `copy.accent == null`.
  for (const buruk of ["biru", "#GGGGGG", "#FFF", "", null, "#12345", "1B4FA8"]) {
    assert.equal(dipakai(buruk), "#5EC8FF", `${JSON.stringify(buruk)} lolos jadi warna`);
  }
  // Hex sah TAPI terlalu terang: chip berteks putih tidak terbaca. Ini yang tidak
  // ketahuan kalau cuma bentuknya yang diperiksa.
  for (const pucat of ["#FFF9C4", "#FFFFFF", "#B8E986", "#7DD3FC"]) {
    assert.equal(dipakai(pucat), "#5EC8FF", `${pucat} lolos padahal kontrasnya kurang`);
  }
  // Hex sah dan cukup pekat TAPI di luar keluarga biru. Ini yang menjaga identitas
  // brand: foto dan layout boleh beda tiap artikel, warnanya tetap satu keluarga.
  for (const salahWarna of ["#B3261E", "#A34700", "#146B2F", "#8B1F8B", "#111111"]) {
    assert.equal(dipakai(salahWarna), "#5EC8FF", `${salahWarna} lolos padahal bukan biru`);
  }
});

test("layout ngawur dari model jatuh ke blok-bawah, bukan slide tanpa CSS", () => {
  for (const buruk of ["keren", "", null, "BLOK-BAWAH", "blok bawah"]) {
    const html = rakit({ layout: buruk }).slides[0];
    assert.match(html, /<html lang="id" class="l-blok"/, `${JSON.stringify(buruk)} tidak jatuh ke default`);
  }
  for (const layout of LAYOUT) {
    const kelas = { "blok-bawah": "l-blok", "pias-bawah": "l-pias", tengah: "l-tengah" }[layout];
    assert.match(rakit({ layout }).slides[0], new RegExp(`class="${kelas}"`));
  }
});

test("nol raster jatuh ke kartu warna, bukan kanvas kosong", () => {
  // Konsekuensi langsung dari foto jadi bintangnya: dulu gambar gagal tetap terlihat
  // "normal" karena foto cuma dekorasi 16%. Sekarang gagal berarti lubang — kecuali
  // ada yang menutupnya dengan sesuatu yang terlihat seperti pilihan desain.
  const r = rakit({ gambar: 0, accent: "#1B4FA8" });
  assert.equal(r.gambar_gagal, 5);
  assert.equal(r.slides.length, 5);
  for (const [i, s] of r.slides.entries()) {
    assert.doesNotMatch(s, /<img class="bg"/, `slide ${i + 1}: bg kosong tetap dipasang`);
    assert.match(s, /<div class="kartu k\d">/, `slide ${i + 1}: tanpa kartu warna`);
    assert.match(gaya(s), new RegExp(`\\.k${i % 4}\\{background:[^}]*#1B4FA8`), `slide ${i + 1}: kartu tidak memakai aksen`);
    assert.match(s, /<img class="logo"/, `slide ${i + 1}: logo hilang`);
  }
  // Ada raster -> kartu tidak dipasang, supaya tidak menutupi fotonya.
  assert.doesNotMatch(rakit().slides[0], /<div class="kartu/);
});

test("pagar lama tetap berdiri di ketiga layout", () => {
  // Desain boleh berubah; empat hal ini tidak. Dijalankan ulang per layout karena
  // yang berubah struktur HTML-nya, bukan cuma warnanya.
  for (const layout of LAYOUT) {
    const r = rakit({ layout });
    assert.equal(r.slides.length, 5);
    for (const [i, s] of r.slides.entries()) {
      const isi = s.replace(/src="data:[^"]*"/g, "");
      assert.doesNotMatch(isi, /https?:|daffathan-labs\.my\.id/, `${layout} slide ${i + 1}: ada URL`);
      const m = s.match(/<img class="logo" src="data:image\/png;base64,([^"]*)"/);
      assert.ok(m && m[1].length > 1000, `${layout} slide ${i + 1}: logo hilang atau kosong`);
      assert.match(s, new RegExp(`${i + 1} / 5`), `${layout} slide ${i + 1}: nomor hilang`);
    }
    assert.match(r.slides[4], /link bio/i, `${layout}: slide 5 bukan CTA`);
    assert.doesNotMatch(r.slides[4], /Satu dua tiga empat/, `${layout}: teks model tidak ditimpa`);
  }
});

test("chip kategori diambil dari tag artikel, bukan dikarang model", () => {
  // Tag ditulis manusia dan sudah ada di brief; field baru ke model cuma menambah
  // satu peluang gagal untuk sesuatu yang datanya sudah ada.
  assert.match(rakit().slides[0], /<span class="kicker">Movie Review<\/span>/);
  assert.match(rakit().slides[4], /<span class="kicker">Baca selengkapnya<\/span>/);
});

// Menjalankan sumber Code node "Pecah slide" apa adanya dari JSON hasil build.
// Bukan memalsukan keluarannya — fixture yang memalsukan keluaran sebuah node tidak bisa
// menangkap bug DI DALAM node itu, dan mutation test `ke-base64.js` yang pertama sempat
// lolos diam-diam persis karena itu.
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

/**
 * Balasan `Terangkan still` palsu, dibungkus persis seperti balasan Gemini sungguhan —
 * termasuk pagar ```json yang rutin dia tambahkan sendiri.
 * `keterangan = null` berarti panggilannya GAGAL: itu jalur non-film dan jalur error,
 * dan pembagian foto harus tetap jalan tanpa keterangan sama sekali.
 */
const balasanVisi = (keterangan) =>
  keterangan === null
    ? { json: {} }
    : {
        json: {
          candidates: [{
            content: {
              parts: [{
                text: "```json\n" + JSON.stringify(
                  keterangan
                    // Entri boleh ditulis sebagai array (cuma `tokoh`) atau objek penuh.
                    .map((k, i) => ({
                      i: i + 1,
                      adegan: `adegan ${i}`,
                      ...(Array.isArray(k) ? { tokoh: k, utama: k[0] || "", wajah: true } : k),
                    }))
                    // Sengaja DIBALIK urutannya. Model tidak dijamin menjawab berurutan —
                    // dia rutin melompati nomor atau menukar urutan entri. Fixture yang
                    // selalu urut bikin kode yang mengabaikan `i` dan sekadar menumpuk
                    // hasil tetap lolos, dan yang tampil nanti keterangan milik gambar lain.
                    .reverse()
                ) + "\n```",
              }],
            },
          }],
        },
      };

const bagiFoto = async ({
  backdrops = [],
  film = "Spider-Man: Brand New Day",
  jumlahSlide = 5,
  cast = [],
  isiSlide = null,
  // Keterangan isi tiap kandidat, seindeks dengan kolamnya. null = panggilan visi gagal.
  keterangan = null,
} = {}) => {
  // `Siapkan kandidat` dijalankan APA ADANYA dari JSON hasil build, bukan dipalsukan
  // keluarannya: dia yang menyaring backdrop berjudul dan mengambil selang, dan fixture
  // yang memalsukan keluaran sebuah node tidak bisa menangkap bug DI DALAM node itu.
  const $kand = (n) => ({
    isExecuted: true,
    first: () => ({
      json: n === "Still film" ? (backdrops.length ? { backdrops } : {})
        : n === "Pemain film" ? (cast.length ? { cast } : {})
        : {},
    }),
    all: () => [],
  });
  const kandidat = (
    await new AsyncFn("$", byName["Siapkan kandidat"].parameters.jsCode).call(
      // Unduhan gambar diganti buffer kecil — yang diuji pembagiannya, bukan HTTP-nya.
      { helpers: { httpRequest: async () => Buffer.from("gambar") } },
      $kand
    )
  )[0].json;

  const palsu = {
    "Siapkan kandidat": { json: kandidat },
    "Terangkan still": balasanVisi(keterangan),
    "Siapkan brief": { json: { code: "uji" } },
    "Gemini copy": {
      json: {
        output: {
          film,
          image_series: "S",
          layout: "blok-bawah",
          slides:
            isiSlide ||
            Array.from({ length: jumlahSlide }, (_, i) => ({
              heading: `H${i}`, body: `B${i}`, image_prompt: `P${i}`, image_mode: "tempat",
            })),
        },
      },
    },
    "Still film": { json: backdrops.length ? { backdrops } : {} },
    "Pemain film": { json: cast.length ? { cast } : {} },
  };
  const $ = (n) => ({ isExecuted: true, first: () => palsu[n], all: () => [palsu[n]] });
  return new Function("$", byName["Pecah slide"].parameters.jsCode)($).map((x) => x.json);
};
// Backdrop palsu: vote menurun sesuai indeks, jadi urutan hasilnya bisa diperiksa.
const backdropPalsu = (n) =>
  Array.from({ length: n }, (_, i) => ({ file_path: `/b${i}.jpg`, vote_average: 100 - i }));

test("still film memaksa layout pias-bawah, apa pun pilihan model", () => {
  // Backdrop TMDB semuanya 16:9, kanvas slide 4:5. Di blok-bawah/tengah foto mengisi
  // 1080x1350 dan object-fit:cover membuang 55% lebarnya — subjeknya gampang kepotong
  // keluar frame, dan itu merusak satu-satunya alasan memakai foto asli. pias-bawah
  // memberi foto area 1080x783 dan cuma membuang 22%.
  for (const layout of LAYOUT) {
    const s = rakit({ layout, fotoAsli: true }).slides[0];
    assert.match(s, /<html lang="id" class="l-pias"/, `${layout}: still tidak dipaksa pias-bawah`);
  }
  // Artikel non-film tetap bebas memilih: gambar Gemini digenerate langsung di rasio
  // kanvas, jadi tidak ada yang dibuang.
  assert.match(rakit({ layout: "tengah" }).slides[0], /class="l-tengah"/);
  assert.match(rakit({ layout: "blok-bawah" }).slides[0], /class="l-blok"/);
});

test("foto asli tampil UTUH — contain, dan kotaknya persis 16:9", () => {
  // Keluhannya: "gambarnya kepotong ama tulisan tulisan di dalam konten nya". Sadie Sink
  // berhenti di dagu, Tom Holland berhenti di dagu — karena kotak fotonya 1080x783
  // (rasio 1,38) sementara still-nya 16:9, jadi `cover` membesarkan foto sampai lebarnya
  // 1391px dan membuang 22% sisi kiri-kanan.
  //
  // Dua hal yang memperbaikinya, dan dua-duanya harus tetap ada:
  const css = gaya(rakit({ layout: "blok-bawah", fotoAsli: true }).slides[0]);

  // 1. `contain` — memuat SELURUH foto, tidak pernah membuang tepi.
  const bg = css.match(/\.l-pias \.bg\{([^}]*)\}/)[1];
  assert.match(bg, /object-fit:\s*contain/, "foto asli di-crop lagi");
  assert.doesNotMatch(bg, /object-fit:\s*cover/, "cover balik — tepi foto dibuang lagi");

  // 2. Kotaknya 1080 / (16/9) = 607, jadi still 16:9 masuk PERSIS tanpa ruang sisa.
  //    85 backdrop Brand New Day rasionya 1,775-1,784 tanpa kecuali — diverifikasi.
  const tinggi = (sel) => Number(css.match(new RegExp(`\\${sel}\\{[^}]*height:(\\d+)px`))[1]);
  assert.equal(tinggi(".l-pias .bg"), Math.round(1080 / (16 / 9)));
  assert.equal(tinggi(".l-pias .fotolayer"), tinggi(".l-pias .bg"), "foto dan kotaknya beda tinggi");

  // Titik fokus tidak boleh dipakai lagi untuk menambal crop di jalur foto asli.
  assert.doesNotMatch(
    rakit({ layout: "blok-bawah", fotoAsli: true }).slides[1],
    /object-position:50% 18%/,
    "geser fokus balik — itu menambal gejala, bukan berhenti memotong"
  );

  // Foto PEMAIN bentuknya potret 2:3, arahnya berlawanan dengan still 16:9. Di kotak
  // 608 dia cuma 405px lebar — persegi panjang kecil mengambang di tengah bidang warna.
  // Kotaknya ditinggikan supaya potretnya besar, tetap tanpa satu piksel pun dibuang.
  assert.match(css, /\.l-pias\.potret \.bg\{[^}]*height:(\d+)px/, "kotak potret tidak dibedakan");
  const potret = Number(css.match(/\.l-pias\.potret \.bg\{[^}]*height:(\d+)px/)[1]);
  assert.ok(potret > tinggi(".l-pias .bg"), "kotak potret tidak lebih tinggi dari kotak still");
  // Panelnya tidak boleh ikut habis: 567px terbukti muat di desain sebelumnya, dan
  // panel yang lebih sempit dari itu memicu ronde penyusutan teks di TIAP slide potret.
  assert.ok(1350 - potret >= 520, `panel teks tinggal ${1350 - potret}px — teks bakal meluber`);
  assert.equal(
    css.match(/\.l-pias\.potret \.fotolayer\{[^}]*height:(\d+)px/)[1],
    String(potret),
    "foto potret dan kotaknya beda tinggi"
  );
});

test("kelas potret cuma menempel di slide yang fotonya potret", () => {
  // Kalau kelasnya nempel di semua slide, still 16:9 ikut dipasang di kotak setinggi
  // potret dan yang muncul pias hitam di atas-bawah foto — di setiap slide.
  const r = rakit({ layout: "blok-bawah", fotoAsli: true, potretDi: [2] });
  assert.match(r.slides[2], /<html lang="id" class="l-pias potret"/, "slide potret tidak ditandai");
  for (const i of [0, 1, 3, 4]) {
    assert.match(r.slides[i], /<html lang="id" class="l-pias"/, `slide ${i + 1} ikut jadi potret`);
  }
  // Artikel non-film tidak punya foto potret sama sekali.
  assert.doesNotMatch(rakit({ layout: "tengah" }).slides[0], /class="[^"]*potret/);
});

test("panel teks mengisi sisa kanvas, tidak menyisakan bidang kosong di bawah", () => {
  // Keluhannya: "banyak banget whitespace di bawah nya tuh ... jangan ada whitespace yang
  // bener bener menyisakan ruang". Panelnya dulu setinggi ISINYA, jadi body sembilan kata
  // berhenti di sekitar 980px dan 370px terakhir benar-benar kosong.
  //
  // Dua hal yang memperbaikinya, dan dua-duanya harus tetap ada.
  const css = gaya(rakit({ layout: "blok-bawah", fotoAsli: true }).slides[0]);
  const aturan = (sel) => css.match(new RegExp(`\\${sel}\\{([^}]*)\\}`))[1];

  // 1. Panelnya tumbuh mengisi ruang, bukan setinggi isinya.
  const teks = aturan(".l-pias .teks");
  assert.match(teks, /flex:\s*1/, "panel pias balik setinggi isinya — lubang di bawah balik");
  assert.match(teks, /justify-content:\s*center/, "isi panel tidak dipusatkan, numpuk di atas");

  // 2. Tidak ada jarak tambahan antara tepi foto dan panel: padding-atas .wrap PERSIS
  //    setinggi kotak fotonya. Sisa 36px yang dulu ada di sini sekarang jadi padding
  //    dalam .teks, jadi warnanya menyambung alih-alih memutus panel dari fotonya.
  const wrap = aturan(".l-pias .wrap");
  const atas = Number(wrap.match(/padding:(\d+)px/)[1]);
  const foto = Number(css.match(/\.l-pias \.bg\{[^}]*height:(\d+)px/)[1]);
  assert.equal(atas, foto, `panel mulai di ${atas}px padahal foto habis di ${foto}px`);
  assert.equal(
    Number(css.match(/\.l-pias\.potret \.wrap\{[^}]*padding-top:(\d+)px/)[1]),
    Number(css.match(/\.l-pias\.potret \.bg\{[^}]*height:(\d+)px/)[1]),
    "slide potret masih menyisakan jarak antara foto dan panel"
  );

  // Luapan HARUS tetap terbaca render-svc. Panel yang mengisi sisa kanvas gampang
  // sekaligus mengunci tingginya — dan begitu terkunci, teks kepanjangan terpotong
  // diam-diam, dibalas 200, dan loop penyusutan tidak pernah jalan.
  assert.doesNotMatch(teks, /overflow/, "panel pias mengunci luapannya sendiri");
  assert.doesNotMatch(teks, /height:/, "tinggi panel dipatok — luapan berhenti terukur");
});

test("body slide dikasih ruang 32 kata, bukan 25", () => {
  // Panel pias tingginya 742px dan body 25 kata cuma mengisi separuhnya. Batas ini jalan
  // berpasangan dengan prompt: batas naik tanpa prompt naik tidak menambah satu kata pun.
  const kata = (n) => Array.from({ length: n }, (_, i) => `k${i}`).join(" ");
  assert.doesNotMatch(rakit({ ronde: 0, body: kata(32) }).slides[0], /…/, "32 kata dipangkas");
  assert.match(rakit({ ronde: 0, body: kata(40) }).slides[0], /…/, "batas atas hilang");
  // Lantai penyusutan tidak boleh ikut naik: ronde 8 tetap 10 kata, kalau tidak slide
  // yang meluber butuh lebih dari 8 ronde untuk sembuh dan carousel-nya gagal terbit.
  const sisa = (r) => rakit({ ronde: r, body: kata(40) }).slides[0]
    .match(/<p>([^<]*)<\/p>/)[1].replace("…", "").trim().split(/\s+/).length;
  assert.equal(sisa(8), 10, "lantai ronde 8 bergeser dari 10 kata");
  assert.ok(sisa(1) < sisa(0), "tiap ronde harus benar-benar memangkas lebih banyak");

  assert.match(
    fs.readFileSync(new URL("./src/prompt-copy.txt", import.meta.url), "utf8"),
    /body: 22-32 KATA/,
    "prompt masih meminta body pendek — panelnya bakal tetap bolong"
  );
});

test("panel bukan hitam rata: warnanya ikut aksen, kontras tetap aman", () => {
  // Keluhannya: "jangan sampai statis warna hitam dan tulisan putih aja". Panelnya dulu
  // #0B0F14 di SEMUA artikel — aksen cuma muncul di chip kecil, jadi review film dan
  // catatan teknis sama-sama keluar sebagai kotak hitam bertulisan putih.
  const lum = (hex) =>
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((a, v, i) => a + [0.2126, 0.7152, 0.0722][i] * v, 0);
  const rasio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // HANYA warna di deklarasi `background`. Garis aksen (box-shadow, border-left) memang
  // memakai aksen mentah dan memang boleh terang — tidak ada teks yang duduk di atas
  // garis setebal 8px, jadi memeriksanya cuma bikin desain yang benar ditolak.
  // Hex 6 digit; alpha 2 digit di belakangnya (mis. #24465AF0) ikut ditelan, tidak
  // disalahartikan jadi warna lain.
  const warnaDi = (css, sel) =>
    [...css.match(new RegExp(`\\${sel}\\{[^}]*background:([^;}]*)`))[1]
      .matchAll(/#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?\b/g)].map((m) => "#" + m[1].toUpperCase());

  const ZONA = [
    ["pias-bawah", ".l-pias body"],
    ["pias-bawah", ".l-pias .fotolayer"],
    ["blok-bawah", ".l-blok .teks"],
    ["tengah", ".l-tengah .teks"],
  ];
  // Diperiksa untuk BEBERAPA aksen, bukan satu. Aksen sendiri sudah dijamin >= 4,5:1
  // terhadap putih, jadi tinta dari aksen gelap seperti #1B4FA8 aman berapa pun
  // porsinya — memeriksa dia saja bikin batas porsinya tidak dijaga sama sekali.
  // Teal terang #0E7490 yang menangkapnya: dipakai penuh, judul putih tinggal 5,9:1.
  const AKSEN = ["#1B4FA8", "#0E7490", "#3730A3"];
  for (const [layout, sel] of ZONA) {
    const palet = AKSEN.map((accent) =>
      warnaDi(gaya(rakit({ layout, accent, fotoAsli: layout === "pias-bawah" }).slides[0]), sel)
    );
    assert.ok(palet[0].length >= 2, `${sel}: tidak ada gradien warna sama sekali`);
    assert.notDeepEqual(palet[0], palet[1], `${sel}: warnanya sama untuk aksen berbeda — masih statis`);
    assert.ok(palet[0].some((w) => w !== "#0B0F14"), `${sel}: masih hitam rata`);

    // Yang tidak boleh ikut hilang: teks tetap terbaca di atasnya. Judul putih AAA (7:1),
    // body #D7DEE6 minimal AA (4.5:1). Ini yang menahan tinta dinaikkan sampai pucat.
    for (const w of palet.flat()) {
      assert.ok(rasio(w, "#FFFFFF") >= 7, `${sel} ${w}: judul putih cuma ${rasio(w, "#FFFFFF").toFixed(1)}:1`);
      assert.ok(rasio(w, "#D7DEE6") >= 4.5, `${sel} ${w}: body cuma ${rasio(w, "#D7DEE6").toFixed(1)}:1`);
    }
  }
});

test("kolam still dibagi tanpa pengulangan, dan tidak lima teratas berurutan", async () => {
  const slides = await bagiFoto({ backdrops: backdropPalsu(30) });
  const url = slides.map((s) => s.foto_url);
  assert.equal(url.filter(Boolean).length, 5, "ada slide yang tidak kebagian padahal stok banyak");
  assert.equal(new Set(url).size, 5, `still dipakai ulang: ${url.join(" | ")}`);
  for (const s of slides) assert.equal(s.pakai_foto, true);

  // Yang vote-nya tertinggi tetap ke slide 1 — pembagiannya deterministik, bukan acak.
  assert.match(url[0], /\/b0\.jpg$/, "backdrop vote tertinggi tidak ke slide 1");
  // Diambil selang, bukan berurutan: 30 backdrop dari satu film hampir selalu memuat
  // beberapa frame dari adegan yang sama, dan lima teratas gampang jadi lima potongan
  // adegan yang itu-itu juga.
  assert.doesNotMatch(url[1], /\/b1\.jpg$/, "diambil berurutan — adegannya bakal mirip semua");
});

test("kolam lebih sedikit dari slide: sisanya null, BUKAN foto slide lain", async () => {
  const url = (await bagiFoto({ backdrops: backdropPalsu(3) })).map((s) => s.foto_url);
  const ada = url.filter(Boolean);
  assert.equal(ada.length, 3, "slide kebagian lebih banyak dari stoknya");
  assert.equal(new Set(ada).size, 3, "still dipakai ulang untuk menambal");
  assert.deepEqual(url.slice(3), [null, null], "slide sisa tidak dikosongkan");
});

test("artikel bukan film: kolam kosong, gerbang jatuh ke Gemini", async () => {
  for (const opsi of [{ film: "" }, { film: "Apa Pun", backdrops: [] }]) {
    const slides = await bagiFoto(opsi);
    assert.equal(slides.length, 5, "jumlah slide ikut berubah");
    for (const s of slides) {
      assert.equal(s.pakai_foto, false, `pakai_foto salah untuk ${JSON.stringify(opsi)}`);
      assert.equal(s.foto_url, null);
      // Prompt gambar tetap disiapkan — cabang Gemini yang akan memakainya.
      assert.ok(s.image_prompt.length > 10, "image_prompt hilang padahal Gemini yang dipakai");
    }
  }
});

test("pakai_foto sama di kelima item — kalau tidak, item terbelah dua cabang", async () => {
  // Gerbang `Ada foto asli?` dievaluasi PER ITEM. Bendera yang berbeda antar item bikin
  // sebagian slide lewat `Ambil foto` dan sebagian lewat `Gemini gambar`, lalu keduanya
  // bertemu di `Jadi JPEG` dengan urutan yang tidak bisa dipercaya.
  for (const n of [0, 3, 30]) {
    const nilai = (await bagiFoto({ backdrops: backdropPalsu(n) })).map((s) => s.pakai_foto);
    assert.equal(new Set(nilai).size, 1, `pakai_foto tidak seragam saat stok ${n}`);
  }
});

// Cast asli dari film yang diuji, dipangkas seperlunya.
const CAST = [
  { name: "Tom Holland", character: "Peter Parker / Spider-Man", profile_path: "/tom.jpg" },
  { name: "Zendaya", character: "MJ", profile_path: "/zen.jpg" },
  { name: "Sadie Sink", character: "Jean Grey", profile_path: "/sadie.jpg" },
  { name: "Jon Bernthal", character: "Frank Castle / Punisher", profile_path: "/jon.jpg" },
];

// Teks slide yang dipakai di beberapa test: dua slide menyebut pemain, satu netral.
const ISI_FILM = [
  { heading: "Spider-Man kembali ke jalanan", body: "" },
  { heading: "Sadie Sink sebagai Jean Grey", body: "Perannya bukan tempelan." },
  { heading: "Aksi berayun yang diadaptasi", body: "Gerakannya terasa nyata." },
  { heading: "Frank Castle muncul singkat", body: "" },
  { heading: "penutup", body: "" },
];

test("gambar yang diperiksa model cukup besar untuk mengenali wajah", async () => {
  // Ini yang menerbitkan orang yang salah. Stillnya dulu dikirim w500, dan wajah di
  // still 16:9 tingginya cuma ~16% frame — jadi ~45 piksel. Cukup untuk melihat ADA
  // orang, tidak cukup untuk membedakan dua perempuan berambut kemerahan: modelnya
  // menyebut Zendaya sebagai Sadie Sink, dan itu yang terbit.
  //
  // Yang bikin jebakannya halus: w500 BENAR kalau cuma dua still yang dikirim. Ukurannya
  // baru menggigit waktu kolamnya 40. Diuji dengan kolam yang sama persis dengan
  // produksi — w500 salah orang, w780 benar.
  const diminta = [];
  const $ = (n) => ({
    isExecuted: true,
    first: () => ({
      json: n === "Still film" ? { backdrops: backdropPalsu(10) }
        : n === "Pemain film" ? { cast: CAST }
        : {},
    }),
    all: () => [],
  });
  const hasil = (
    await new AsyncFn("$", byName["Siapkan kandidat"].parameters.jsCode).call(
      { helpers: { httpRequest: async ({ url }) => { diminta.push(url); return Buffer.from("g"); } } },
      $
    )
  )[0].json;

  // 10 still + 4 foto acuan wajah pemain. Tanpa foto acuan modelnya cuma punya daftar
  // NAMA dan menebak dari konteks: satu render memberi slide "Sadie Sink sebagai Jean
  // Grey" sebuah still berisi perempuan berambut cokelat yang sebetulnya MJ.
  assert.equal(diminta.length, 10 + CAST.length, "jumlah gambar yang diunduh untuk model berubah");
  const still = diminta.slice(0, 10);
  const wajah = diminta.slice(10);
  // Acuan w500, bukan w185. Potret 185x278 punya wajah ~120 piksel, dan acuan sekecil
  // itu tidak menjaga apa pun — yang dibandingkan dua-duanya kabur.
  for (const u of wajah) assert.match(u, /\/t\/p\/w500\//, `foto acuan terlalu kecil: ${u}`);
  assert.deepEqual(
    wajah.map((u) => u.split("/").pop()),
    CAST.map((p) => p.profile_path.slice(1)),
    "urutan foto acuan tidak sama dengan urutan nama di prompt"
  );
  assert.match(
    hasilAwalPrompt(),
    new RegExp(`ke-11 sampai ke-${10 + CAST.length}`),
    "nomor foto acuan di prompt tidak cocok dengan yang benar-benar dikirim"
  );
  function hasilAwalPrompt() {
    return hasil.body.contents[0].parts[0].text;
  }
  // Cakupan yang bolong bikin pencocokan isi kelihatan gagal padahal yang salah cuma
  // daftar yang diperiksa: still Sadie Sink ADA di antara 54 backdrop polos Brand New
  // Day, tapi tidak masuk sepuluh kandidat pertama, jadi slide-nya jatuh ke potret.
  const banyak = [];
  const luas = (
    await new AsyncFn("$", byName["Siapkan kandidat"].parameters.jsCode).call(
      { helpers: { httpRequest: async ({ url }) => { banyak.push(url); return Buffer.from("g"); } } },
      (n) => ({
        isExecuted: true,
        first: () => ({ json: n === "Still film" ? { backdrops: backdropPalsu(54) } : {} }),
        all: () => [],
      })
    )
  )[0].json;
  assert.ok(luas.url.length >= 40, `cuma ${luas.url.length} dari 54 backdrop polos diperiksa`);
  assert.equal(new Set(luas.url).size, luas.url.length, "ada kandidat kembar");

  // w780: wajahnya terbaca, badannya masih ~5 MB. w500 salah orang, w1280 juga benar
  // tapi badannya ~10 MB tanpa satu pun bukti dia lebih benar.
  for (const u of still) assert.match(u, /\/t\/p\/w780\//, `still yang diperiksa bukan w780: ${u}`);
  for (const u of hasil.url) assert.match(u, /\/t\/p\/w1280\//, `slide dipasangi ukuran kecil: ${u}`);
  // Urutannya harus sejajar — kalau tidak, keterangan gambar ke-3 menempel di gambar lain.
  assert.deepEqual(
    still.map((u) => u.split("/").pop()),
    hasil.url.map((u) => u.split("/").pop()),
    "urutan gambar yang diperiksa beda dengan urutan yang dipasang"
  );

  // Daftar pemain ikut dikirim: tanpa itu model tidak punya nama untuk dipakai menjawab.
  const prompt = hasil.body.contents[0].parts[0].text;
  assert.match(prompt, /Sadie Sink sebagai Jean Grey/, "daftar pemain tidak ikut dikirim");
  // 1 teks + 10 still + 4 foto acuan.
  assert.equal(hasil.body.contents[0].parts.length, 1 + 10 + CAST.length, "gambar tidak ikut terkirim");
  // Tanpa sampul, tidak ada yang perlu dibandingkan — jangan menyuruh model mengarang.
  assert.doesNotMatch(prompt, /sama_sampul/, "minta banding sampul padahal sampulnya tidak ada");

  // Sampul artikel ikut dikirim DI BELAKANG, supaya penomoran still tetap 1..N dan tidak
  // ada pergeseran indeks yang harus diingat waktu sampulnya kebetulan tidak ada.
  const berSampul = (
    await new AsyncFn("$", byName["Siapkan kandidat"].parameters.jsCode).call(
      { helpers: { httpRequest: async () => Buffer.from("g") } },
      (n) => ({
        isExecuted: true,
        first: () => ({
          json: n === "Still film" ? { backdrops: backdropPalsu(10) }
            : n === "Pemain film" ? { cast: CAST }
            : n === "Cover base64" ? { b64: "U0FNUFVM", mime: "image/webp" }
            : {},
        }),
        all: () => [],
      })
    )
  )[0].json;
  const bagian = berSampul.body.contents[0].parts;
  // 1 teks + 10 still + 4 foto acuan + 1 sampul.
  assert.equal(bagian.length, 1 + 10 + CAST.length + 1, "sampul tidak ikut terkirim");
  assert.equal(bagian[bagian.length - 1].inline_data.data, "U0FNUFVM", "sampul bukan gambar terakhir");
  assert.match(bagian[0].text, /sama_sampul/, "model tidak diminta membandingkan sampul");
  assert.equal(berSampul.url.length, 10, "sampul ikut terhitung sebagai kandidat still");
});

test("tudung bukan alasan menolak sebuah wajah", async () => {
  // Ini yang menerbitkan orang yang salah. Aturan `wajah` versi pertama berbunyi
  // "Bertudung, membelakangi kamera, gelap, atau bertopeng penuh berarti false" — dan
  // still Sadie Sink TERBAIK di kolam justru dia bertudung di dalam kereta: wajahnya
  // besar, terang, menghadap kamera, tidak bisa keliru. Aturan itu menurunkannya ke
  // nilai 2, still lain yang salah kenal menang dengan 3, dan yang terbit perempuan
  // yang bukan Sadie Sink.
  const prompt = (
    await new AsyncFn("$", byName["Siapkan kandidat"].parameters.jsCode).call(
      { helpers: { httpRequest: async () => Buffer.from("g") } },
      (n) => ({
        isExecuted: true,
        first: () => ({
          json: n === "Still film" ? { backdrops: backdropPalsu(10) }
            : n === "Pemain film" ? { cast: CAST }
            : {},
        }),
        all: () => [],
      })
    )
  )[0].json.body.contents[0].parts[0].text;

  const barisWajah = prompt.split("\n").filter((b) => /wajah|tudung|Tudung/i.test(b)).join(" ");
  assert.match(barisWajah, /[Tt]udung/, "tudung tidak disinggung sama sekali — aturannya jadi tebak-tebakan");
  assert.match(
    barisWajah,
    /[Tt]udung[^.]*TIDAK membuatnya\s*\n?\s*false/,
    "tudung masih dihitung sebagai wajah tak terlihat"
  );
  // Ukurannya harus soal bisa-tidaknya dikenali, bukan soal apa yang dipakai tokohnya.
  assert.match(barisWajah, /BESAR/, "ukuran wajah tidak jadi ukuran");
  assert.match(barisWajah, /TERANG/, "cahaya wajah tidak jadi ukuran");
  assert.match(barisWajah, /MENGHADAP/, "arah wajah tidak jadi ukuran");

  // Penamaannya diikat ke foto acuan, bukan ke konteks adegan. "Perempuan berambut
  // kemerahan di bengkel Peter, berarti Jean Grey" adalah tebakan yang terdengar masuk
  // akal dan tetap salah orang — persis yang terjadi.
  assert.match(prompt, /COCOKKAN WAJAH dengan foto acuan/, "pengenalan tidak diikat ke foto acuan");
  assert.match(prompt, /bukan menebak dari konteks/, "menebak dari konteks masih dibolehkan");
  assert.match(prompt, /Ragu sedikit pun = jangan sebut namanya/, "tidak ada jalan keluar untuk model yang ragu");
});

test("still yang isinya cocok menang atas potret publisitas", async () => {
  // Ini yang ditunggu sejak awal: still ADEGAN filmnya, bukan foto karpet merah. Still-nya
  // selalu ada di kolam — /aJbVw1OdpuM8kVbnrROJxg5wn3O.jpg, Sadie Sink bertudung di dalam
  // kereta — yang hilang cuma keterangan isinya. `Terangkan still` membacanya dari
  // gambarnya sendiri, dan di sini keterangan itu yang menentukan pembagiannya.
  const slides = await bagiFoto({
    backdrops: backdropPalsu(10),
    cast: CAST,
    isiSlide: ISI_FILM,
    // Seindeks dengan kolam: kandidat ke-3 Sadie Sink, ke-5 Punisher.
    keterangan: [
      ["Tom Holland", "Spider-Man"], [], ["Sadie Sink", "Jean Grey"], [],
      ["Jon Bernthal", "Frank Castle"], [], [], [], [], [],
    ],
  });

  assert.match(slides[1].foto_url, /w1280/, "slide Sadie Sink malah dapat potret, bukan adegan");
  assert.equal(slides[1].foto_potret, false, "masih ditandai potret padahal dapat still 16:9");
  assert.match(slides[3].foto_url, /w1280/, "slide Frank Castle tidak dapat adegannya");

  // Yang penting bukan cuma "dapat still", tapi dapat still YANG BENAR — kalau nomornya
  // diabaikan, test di atas tetap lolos sementara Sadie dapat adegan Punisher lagi.
  const kolam = (await bagiFoto({ backdrops: backdropPalsu(10), cast: CAST, isiSlide: ISI_FILM }));
  assert.notEqual(slides[1].foto_url, slides[3].foto_url, "dua slide berbagi still yang sama");
  // Kolamnya diambil selang 3 dari b0..b9, jadi urutannya b0,b3,b6,b9,b1,b2,…
  // Kandidat ke-3 = b6 (Sadie), ke-5 = b1 (Frank).
  assert.ok(slides[1].foto_url.endsWith("/b6.jpg"), `Sadie dapat ${slides[1].foto_url}, bukan kandidat ke-3`);
  assert.ok(slides[3].foto_url.endsWith("/b1.jpg"), `Frank dapat ${slides[3].foto_url}, bukan kandidat ke-5`);
  // Tanpa keterangan, slide yang sama jatuh ke potret — itu perilaku cadangannya.
  assert.match(kolam[1].foto_url, /\/sadie\.jpg$/);
});

test("still yang adegannya sama dengan sampul artikel dibuang", async () => {
  // Slide 1 SELALU memakai sampul artikel, dan untuk ulasan film sampulnya sering diambil
  // dari still film yang sama: di render uji slide 1 dan slide 5 keluar sebagai adegan
  // rooftop yang sama persis. Berkasnya beda, jadi aturan "satu slide satu gambar" tidak
  // dilanggar — tapi yang dilihat orang tetap satu gambar diulang.
  const kembar = { tokoh: [], utama: "", wajah: false, sama_sampul: true };
  const lain = { tokoh: [], utama: "", wajah: false, sama_sampul: false };
  const url = (
    await bagiFoto({
      backdrops: backdropPalsu(10),
      // Tiga kandidat pertama kembaran sampul; tidak satu pun boleh muncul.
      keterangan: [kembar, kembar, kembar, lain, lain, lain, lain, lain, lain, lain],
    })
  ).map((s) => s.foto_url);

  // Kolam b0..b9 selang 3 -> b0,b3,b6,b9,b1,… jadi tiga yang dibuang b0, b3, b6.
  for (const dibuang of ["/b0.jpg", "/b3.jpg", "/b6.jpg"]) {
    assert.ok(
      !url.some((u) => u && u.endsWith(dibuang)),
      `${dibuang} kembaran sampul tapi tetap dipakai: ${url.join(" | ")}`
    );
  }
  // Slide tetap kebagian — yang dibuang digantikan, bukan bikin lubang.
  assert.equal(url.filter(Boolean).length, 5, "slide kehilangan foto gara-gara pembuangan");
});

test("still yang wajahnya kelihatan menang atas yang cuma siluet", async () => {
  // Render uji: slide "Sadie Sink sebagai Jean Grey" dapat sosok BERTUDUNG yang wajahnya
  // gelap total, cuma karena still itu lebih dulu di kolam. Modelnya tidak salah — dia
  // memang ada di frame — tapi "ada di frame" dan "kelihatan siapa" itu dua hal berbeda,
  // dan yang terbit jadi slide bernama orang tanpa orangnya.
  const siluet = { tokoh: ["Sadie Sink", "Jean Grey"], utama: "Jean Grey", wajah: false };
  const jelas = { tokoh: ["Sadie Sink", "Jean Grey"], utama: "Jean Grey", wajah: true };
  const lewat = { tokoh: ["Sadie Sink"], utama: "Spider-Man", wajah: true };
  const kosong = { tokoh: [], utama: "", wajah: false };

  const slides = await bagiFoto({
    backdrops: backdropPalsu(10),
    cast: CAST,
    isiSlide: ISI_FILM,
    // Kandidat ke-1 dia cuma lewat, ke-2 siluet, ke-4 wajahnya jelas. Yang harus menang
    // yang ke-4, walaupun dua yang lain lebih dulu di kolam.
    keterangan: [lewat, siluet, kosong, jelas, kosong, kosong, kosong, kosong, kosong, kosong],
  });

  // Urutan kolam dari b0..b9 dengan selang 3: b0,b3,b6,b9,b1,… jadi kandidat ke-4 = b9.
  assert.ok(
    slides[1].foto_url.endsWith("/b9.jpg"),
    `Sadie dapat ${slides[1].foto_url} — masih yang pertama cocok, bukan yang wajahnya kelihatan`
  );
});

test("slide yang menyebut pemain memakai foto ORANGNYA, bukan still acak", async () => {
  // Backdrop tidak membawa keterangan isinya, jadi still untuk slide "Sadie Sink sebagai
  // Jean Grey" pernah keluar sebagai adegan Punisher di render uji. Ini yang menutupnya.
  // Tanpa keterangan — panggilan visi gagal, atau tidak ada still yang memuat orangnya —
  // slide bernama TIDAK boleh diisi still sembarang: itu mengundang balik bug pertama.
  const slides = await bagiFoto({
    backdrops: backdropPalsu(30),
    cast: CAST,
    isiSlide: [
      { heading: "Spider-Man kembali ke jalanan", body: "" },
      { heading: "Sadie Sink sebagai Jean Grey", body: "Perannya bukan tempelan." },
      { heading: "Aksi berayun yang diadaptasi", body: "Gerakannya terasa nyata." },
      { heading: "Frank Castle muncul singkat", body: "" },
      { heading: "penutup", body: "" },
    ],
  });
  assert.match(slides[1].foto_url, /\/sadie\.jpg$/, "slide Sadie Sink tidak memakai fotonya");
  assert.match(slides[3].foto_url, /\/jon\.jpg$/, "nama karakter tidak ikut dicocokkan");
  // Slide tanpa nama pemain tetap dapat still biasa.
  assert.match(slides[2].foto_url, /image\.tmdb\.org\/t\/p\/w1280/, "slide netral malah dapat foto orang");
  // Slide 1 selalu foto artikel — mencocokkan pemain di situ cuma membuang satu nama.
  assert.match(slides[0].foto_url, /w1280/, "slide 1 memakai foto orang padahal ditimpa cover");

  // Penanda potret harus IKUT kecocokan, bukan dipasang di semua slide: still 16:9 di
  // kotak setinggi potret menyisakan pias hitam di atas dan bawah foto.
  assert.deepEqual(
    slides.map((s) => s.foto_potret),
    [false, true, false, true, false],
    "penanda potret tidak mengikuti slide mana yang benar-benar memakai foto pemain"
  );

  // Titik fokus sudah tidak dikirim sama sekali. Dia dulu menggeser potret 2:3 ke atas
  // supaya wajahnya tidak kepotong waktu di-crop — menambal gejala. Fotonya sekarang
  // `contain`, jadi tidak ada yang dipotong. Field yang kembali berarti crop-nya balik.
  for (const s of slides) {
    assert.equal(s.foto_fokus, undefined, "titik fokus balik — berarti foto dipotong lagi");
  }
});

test("backdrop bertuliskan judul film dibuang dari kolam", async () => {
  // TMDB menandai gambar yang sudah ditempeli JUDUL cetak lewat `iso_639_1`: null berarti
  // polos, "tr"/"en"/"pt" berarti ada logo judul dalam bahasa itu. 31 dari 85 backdrop
  // Brand New Day bertuliskan judul, dan satu di antaranya ("ÖRÜMCEK-ADAM YEPYENİ BİR
  // GÜN") persis kena selang yang dipakai carousel lima slide — ketahuan karena
  // gambarnya diunduh dan dilihat, bukan dari error apa pun.
  //
  // Seluruh desain ini berdiri di atas satu aturan: semua kata hidup di HTML, nol di
  // raster. Judul cetak di dalam foto bikin dua judul bertumpuk di satu slide.
  const bertulisan = Array.from({ length: 20 }, (_, i) => ({
    file_path: `/teks${i}.jpg`, vote_average: 999, iso_639_1: "tr",
  }));
  const url = (await bagiFoto({
    backdrops: [...bertulisan, ...backdropPalsu(20)],
  })).map((s) => s.foto_url);

  assert.equal(url.filter(Boolean).length, 5, "kolam malah ikut kosong");
  for (const u of url) {
    assert.doesNotMatch(u, /teks\d+\.jpg/, `backdrop berjudul lolos ke slide: ${u}`);
  }

  // Nol backdrop polos -> kolam kosong dan slide jatuh ke gambar generate. Itu memang
  // pilihan yang benar: judul cetak di raster lebih merusak daripada gambar buatan.
  const cuma = await bagiFoto({ backdrops: bertulisan });
  assert.equal(cuma[0].pakai_foto, false, "film tanpa backdrop polos tetap dipaksa pakai foto");
});

test("nama pendek dan penggalan kata tidak bikin cocok palsu", async () => {
  // "MJ" (2 huruf) dan penggalan seperti "Grey" di dalam kata lain pernah jadi sumber
  // foto orang yang tidak dibahas sama sekali di slide itu.
  const slides = await bagiFoto({
    backdrops: backdropPalsu(30),
    cast: CAST,
    isiSlide: [
      { heading: "a", body: "" },
      { heading: "Hubungan Peter dan MJ menguras emosi", body: "" },
      { heading: "Warna greyscale mendominasi filmnya", body: "" },
      { heading: "d", body: "" },
      { heading: "e", body: "" },
    ],
  });
  assert.match(slides[1].foto_url, /w1280/, '"MJ" yang cuma dua huruf ikut kecocokan');
  assert.match(slides[2].foto_url, /w1280/, '"greyscale" kena sebagai "Grey"');
});

test("balasan TMDB aneh tidak mematikan carousel", () => {
  // Semua bentuk ini pernah mungkin: 404 dari id yang tidak ada, 422 dari query kosong,
  // atau field yang namanya berubah. Semuanya harus jadi kolam kosong, bukan lemparan.
  for (const aneh of [{}, { backdrops: null }, { backdrops: "bukan array" }, { success: false }]) {
    const $ = (n) => ({
      isExecuted: true,
      first: () =>
        n === "Still film"
          ? { json: aneh }
          : n === "Gemini copy"
            ? { json: { output: { film: "X", slides: [{ heading: "a" }, { heading: "b" }] } } }
            : { json: { code: "uji" } },
      all: () => [],
    });
    const hasil = new Function("$", byName["Pecah slide"].parameters.jsCode)($);
    assert.equal(hasil.length, 2, `bentuk ${JSON.stringify(aneh)} bikin slide hilang`);
    assert.equal(hasil[0].json.pakai_foto, false);
  }
});

test("cabang Google Custom Search tidak boleh hidup lagi", () => {
  // Google mengumumkan 20 Januari 2026 bahwa mesin telusur BARU cuma boleh mendaftar
  // maksimal 50 domain: "Search the entire web" tidak bisa dinyalakan lagi, dan mesin
  // lama pun wajib pindah sebelum 1 Januari 2027. Jadi cabang ini bukan "dimatikan
  // sementara" — dia mustahil dinyalakan, dan kode mati yang menyamar sebagai fitur
  // yang tinggal disetel cuma menipu orang yang membacanya nanti.
  for (const n of ["Cari Google", "Perlu Google?"]) {
    assert.equal(byName[n], undefined, `node ${n} hidup lagi padahal Google menutup jalurnya`);
  }
  const kode = byName["Pecah slide"].parameters.jsCode;
  assert.doesNotMatch(kode, /Cari Google|customsearch|google_cse/i, "masih merujuk Google");
  assert.doesNotMatch(
    JSON.stringify(wf),
    /customsearch|google_cse/i,
    "sisa kunci atau URL Custom Search masih ter-build"
  );
  // Satu-satunya sumber foto asli sekarang TMDB, jadi rantainya harus lurus.
  assert.deepEqual(
    wf.connections["Pemain film"].main[0].map((c) => c.node),
    ["Siapkan kandidat"],
    "rantai TMDB putus"
  );
  assert.deepEqual(
    wf.connections["Terangkan still"].main[0].map((c) => c.node),
    ["Pecah slide"],
    "keterangan still tidak sampai ke pembagian foto"
  );
});

test("harness pratinjau film masih menunjuk node yang benar-benar ada", () => {
  // uji-film.mjs menjalankan Code node ASLI dan menyalin node Gemini apa adanya, semuanya
  // lewat NAMA. Satu node yang di-rename bikin harness-nya mati dengan "cannot read
  // properties of undefined" — dan yang paling mungkin terjadi: seseorang merapikan nama
  // node di build.mjs, test workflow tetap hijau, lalu harness-nya baru ketahuan rusak
  // berbulan-bulan kemudian tepat waktu mau dipakai untuk film berikutnya.
  const kode = fs.readFileSync(new URL("./uji-film.mjs", import.meta.url), "utf8");
  const dirujuk = new Set(
    [...kode.matchAll(/\b(?:node|src|salin)\('([^']+)'/g)].map((m) => m[1])
  );
  assert.ok(dirujuk.size >= 8, `cuma ${dirujuk.size} node yang dirujuk — regexnya yang rusak?`);
  for (const n of dirujuk) {
    assert.ok(byName[n], `uji-film.mjs memanggil node "${n}" yang sudah tidak ada di workflow`);
  }
  // Harness-nya harus menghapus workflow sementaranya walau di tengah jalan gagal:
  // webhook yang meneruskan ke kredensial Gemini itu pintu terbuka ke kuota orang.
  assert.match(kode, /\bfinally\s*\{/, "penghapusan workflow sementara tidak dijamin");
  assert.match(kode, /method: 'DELETE'/, "workflow sementara tidak pernah dihapus");
  // Dan dia tidak boleh menyentuh produksi: render masuk ke brand uji, bukan daffathan.
  assert.match(kode, /brand: 'uji'/, "harness merender ke brand produksi");
});

test("tahun film dikirim sebagai parameter sendiri, tidak ditempel ke judul", () => {
  // Ini yang bikin jalur foto asli diam-diam mati untuk film SELAIN yang pertama diuji.
  // TMDB search mencocokkan string judul apa adanya, jadi tahun yang menempel di query
  // justru merusak pencariannya — diukur langsung ke API-nya:
  //
  //   "Fantastic Four: First Steps 2025" -> NOL hasil
  //   "Mortal Kombat II 2026"            -> NOL hasil
  //   "Superman 2025"                    -> "Superman (2025) In a Nutshell", 0 backdrop
  //   "Superman" + year=2025             -> Superman (2025), benar
  //
  // Nol hasil tidak melempar apa pun: kolamnya kosong, slide-nya jatuh ke kartu warna,
  // dan tidak ada satu pun error yang muncul. Persis bentuk kegagalan yang paling mahal.
  const q = byName["Cari film"].parameters.queryParameters.parameters;
  const query = q.find((x) => x.name === "query");
  const year = q.find((x) => x.name === "year");
  assert.ok(year, "tahun tidak dikirim sebagai parameter TMDB");
  assert.match(query.value, /output\.film\b/, "query bukan judul film");
  assert.doesNotMatch(query.value, /film_tahun/, "tahun ikut menempel di query — nol hasil");
  assert.match(year.value, /output\.film_tahun/, "parameter year tidak diisi dari model");

  const skema = JSON.parse(byName["Skema copy"].parameters.inputSchema);
  assert.ok(skema.required.includes("film_tahun"), "film_tahun tidak wajib di skema");
  assert.match(skema.properties.film.description, /TANPA tahun/, "skema masih membolehkan tahun di judul");
  // Prompt dan skema harus sepakat: yang berselisih dimenangkan skema, diam-diam.
  assert.match(byName["Gemini copy"].parameters.text, /TANPA TAHUN/, "prompt masih membolehkan tahun");
});

test("batas kata heading dan body sama di prompt, skema, DAN kode", () => {
  // Skema dan prompt yang berselisih tidak menimbulkan error apa pun — model mengikuti
  // skema, dan permintaan di prompt hilang tanpa jejak. Sudah kejadian: prompt minta
  // 22-32 kata sementara skema masih menulis "MAKSIMAL 25 kata", jadi panel teksnya
  // tetap bolong walau promptnya sudah diperbaiki. Tiga tempat, satu angka.
  const skema = JSON.parse(byName["Skema copy"].parameters.inputSchema);
  const prompt = byName["Gemini copy"].parameters.text;

  assert.match(skema.properties.slides.items.properties.body.description, /22-32 kata/);
  assert.match(prompt, /body: 22-32 KATA/);

  // Judul 74px huruf besar muat ~23 karakter per baris. 8 kata jadi EMPAT baris dan
  // slide-nya sesak — itu yang bikin "Peter Parker benar-benar bertarung sendirian
  // tanpa bantuan" menghabiskan separuh panel.
  assert.match(skema.properties.slides.items.properties.heading.description, /MAKSIMAL 6 kata/);
  assert.match(prompt, /heading: MAKSIMAL 6 KATA/);
  const enam = Array.from({ length: 9 }, (_, i) => `kata${i}`).join(" ");
  const judul = rakit({ ronde: 0, heading: enam }).slides[0].match(/<h1[^>]*>([^<]*)<\/h1>/)[1];
  assert.equal(judul.replace("…", "").trim().split(/\s+/).length, 6, "kode masih memangkas di angka lain");
});

test("kunci TMDB dibaca lewat node Kredensial, bukan ditulis di URL", () => {
  for (const n of ["Cari film", "Still film"]) {
    const q = byName[n].parameters.queryParameters.parameters;
    const key = q.find((x) => x.name === "api_key");
    assert.ok(key, `${n}: api_key tidak dikirim`);
    assert.match(key.value, /Kredensial'\)\.first\(\)\.json\.tmdb_api_key/, `${n}: kunci tidak dari Kredensial`);
    // Balasan 422/404 untuk artikel non-film itu jalur NORMAL, bukan alasan berhenti.
    assert.equal(byName[n].onError, "continueRegularOutput", `${n}: tanpa onError`);
  }
  assert.match(byName["Still film"].parameters.url, /image\.tmdb\.org|themoviedb\.org/);
});

test("gerbang sumber foto bercabang benar dan bertemu lagi di Jadi JPEG", () => {
  // Gerbang lama `Perlu gambar Gemini?` melewati generasi kalau artikel punya cover, dan
  // hasilnya foto yang sama di kelima slide. Gerbang itu tidak boleh balik. Yang sekarang
  // beda tujuannya: memilih SUMBER foto, bukan melewatkan slide.
  assert.equal(byName["Perlu gambar Gemini?"], undefined, "gerbang lama hidup lagi");

  const keluar = (n, i = 0) => (wf.connections[n]?.main?.[i] ?? []).map((c) => c.node);
  assert.deepEqual(keluar("Pecah slide"), ["Ada foto asli?"]);
  assert.deepEqual(keluar("Ada foto asli?", 0), ["Ambil foto"], "cabang 'ada' salah tujuan");
  assert.deepEqual(keluar("Ada foto asli?", 1), ["Gemini gambar"], "cabang 'tidak ada' salah tujuan");
  // Dua cabang WAJIB bertemu lagi, kalau tidak `Slide base64` cuma menerima separuhnya.
  for (const dari of ["Ambil foto", "Gemini gambar"]) {
    assert.deepEqual(keluar(dari), ["Jadi JPEG"], `${dari} tidak bermuara di Jadi JPEG`);
  }
  assert.deepEqual(
    wf.connections["Slide base64"].main[0].map((c) => c.node),
    ["Rakit slide"],
    "raster tidak sampai ke Rakit slide"
  );

  // Prompt slide 2+ harus meminta adegan yang BERBEDA. Tanpa ini, "same visual series"
  // saja menghasilkan lima frame yang nyaris identik — keluhan yang memulai ini.
  const pecah = byName["Pecah slide"].parameters.jsCode;
  assert.match(pecah, /clearly different scene/, "slide 2+ tidak diminta beda adegan");
});

test("cover relatif dari API diberi prefiks, bukan diteruskan mentah", () => {
  // API mengembalikan `/uploads/articles/<md5>.webp`. Diteruskan apa adanya, node
  // `Ambil cover` menolaknya dengan "Invalid URL: … must start with http" lalu jatuh
  // diam-diam ke gambar Gemini — foto artikel tidak pernah sampai ke carousel maupun
  // LinkedIn, dan tidak ada satu pun error yang terlihat.
  const kode = byName["Siapkan brief"].parameters.jsCode;
  const jalankanBrief = (image) => {
    const palsu = {
      Webhook: {
        json: {
          body: {
            new_folders: ["f"],
            repo: "a/b",
            articles: [{ id: "f", locale: "id", title: "T", excerpt: "E", tags: [], content: "<p>x</p>" }],
          },
        },
      },
      Kredensial: { json: { site_url: "https://situs.contoh", article_api_url: "https://api.contoh" } },
    };
    const $ = (n) => ({
      first: () => palsu[n],
      all: () => [{ json: { data: { id: "f", locale: "id", slug: "s", image } } }],
    });
    return new Function("$", kode)($)[0].json.cover;
  };
  assert.equal(jalankanBrief("/uploads/articles/abc.webp"), "https://api.contoh/uploads/articles/abc.webp");
  assert.equal(jalankanBrief("https://cdn.lain/x.webp"), "https://cdn.lain/x.webp", "URL utuh jangan disentuh");
  assert.equal(jalankanBrief(null), null, "tanpa gambar tetap null, bukan URL kosong");
});

test("lapisan foto dipotong pembungkusnya, lapisan teks tidak", () => {
  // transform:scale tidak mengubah layout tapi TETAP menambah scrollable overflow.
  // Zoom 1.12 pada foto setinggi kanvas bikin render-svc mengukur 1431px dan membalas
  // 422 "overflow" di SETIAP artikel — dan loop penyusutan tidak pernah menyembuhkannya
  // karena penyebabnya bukan teks. Ketahuan cuma dengan benar-benar merender.
  //
  // Zoom-nya sendiri sudah dibuang bersama variasi crop, tapi pembungkusnya tetap:
  // biayanya satu baris CSS, dan tanpa dia setiap artikel gagal render kalau suatu saat
  // ada yang menambah transform lagi.
  for (const layout of LAYOUT) {
    const s = rakit({ cover: COVER, gambar: 0, layout }).slides[0];
    const css = gaya(s);
    assert.match(s, /<div class="fotolayer"><img class="bg"/, `${layout}: foto tanpa pembungkus`);
    assert.match(
      css.match(/\.fotolayer\{([^}]*)\}/)[1],
      /overflow:hidden/,
      `${layout}: pembungkus foto tidak memotong`
    );
    // Lapisan TEKS justru harus tetap boleh meluber, kalau tidak aturan 11 mati total.
    assert.doesNotMatch(css.match(/\.wrap\{([^}]*)\}/)[1], /overflow:\s*hidden/);
  }
});
