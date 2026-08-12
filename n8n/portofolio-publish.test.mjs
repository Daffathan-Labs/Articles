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
  for (const n of wf.nodes.filter((x) => x.type === "n8n-nodes-base.code")) {
    assert.doesNotThrow(
      () => new Function(n.parameters.jsCode),
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
  for (const f of ["article_api_key", "render_url", "render_token", "linkedin_token", "ig_user_id", "ig_token", "notify_email"]) {
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
function rakit({
  ronde = 0,
  gambar = 5,
  heading,
  body,
  hashtags = ["#a"],
  // null = artikel tanpa gambar, atau unduhan cover yang gagal. Dua-duanya jalur
  // yang sama dari sisi Rakit slide.
  cover = null,
} = {}) {
  const slide = {
    heading: heading ?? "Satu dua tiga empat lima enam tujuh delapan",
    body: body ?? Array.from({ length: 25 }, (_, i) => `kata${i}`).join(" "),
  };
  const palsu = {
    "Siapkan brief": {
      json: {
        folder: "artikel-uji",
        code: "artikel-uji",
        url_id: "https://daffathan-labs.my.id/id/articles/uji",
        url_en: "https://daffathan-labs.my.id/en/articles/uji",
        cover: cover ? "https://api.contoh/uploads/articles/abc.webp" : null,
        repo: "Daffathan-Labs/Articles",
        berkas_md: ["artikel-uji-id.md", "artikel-uji-en.md"],
        dilewat: [],
      },
    },
    "Gemini copy": {
      json: { output: { linkedin_caption: "LI", ig_caption: "IG", fb_caption: "FB", hashtags } },
    },
    // Node HTTP responseFormat:file — json kosong, muatannya di binary.
    "Ambil cover": cover
      ? { json: {}, binary: { data: { data: cover.b64, mimeType: cover.mime } } }
      : { json: {} },
  };
  const $ = (n) => ({
    first: () => palsu[n],
    all: () =>
      n === "Pecah slide"
        ? Array.from({ length: 5 }, () => ({ json: slide }))
        : Array.from({ length: 5 }, (_, i) => ({
            binary: i < gambar ? { data: { data: "QUJD" } } : undefined,
          })),
  });
  const fn = new Function("$runIndex", "$", byName["Rakit slide"].parameters.jsCode);
  return fn(ronde, $)[0].json;
}

test("Rakit slide: ronde 0 menghasilkan 5 slide dengan teks penuh", () => {
  const r = rakit({ ronde: 0 });
  assert.equal(r.slides.length, 5);
  assert.equal(r.ronde, 1);
  assert.equal(r.gambar_gagal, 0);
  assert.match(r.slides[0], /font-size:78px/, "ronde 0 pakai ukuran penuh");
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

test("punya cover: slide 1 memakai gambar artikel, slide lain dari Gemini", () => {
  const { slides } = rakit({ cover: COVER });
  assert.match(slides[0], /src="data:image\/webp;base64,Q09WRVI="/, "slide 1 bukan cover");
  // mimeType dibaca dari unduhan, bukan diasumsikan jpeg: API menyajikan WebP, dan
  // menuliskannya sebagai image/jpeg bikin Chromium menolak merendernya.
  for (const s of slides.slice(1)) {
    assert.match(s, /src="data:image\/jpeg;base64,QUJD"/, "slide 2+ ikut memakai cover");
    assert.ok(!s.includes("Q09WRVI="), "cover bocor ke slide selain yang pertama");
  }
});

test("punya cover: tidak ada hero yang digenerate", () => {
  // Ini yang mencegah commit balik untuk artikel yang gambarnya sudah ada.
  assert.equal(rakit({ cover: COVER }).hero, null);
});

test("tanpa cover: slide 1 dari Gemini, dan hero dibuat", () => {
  const { slides, hero } = rakit();
  assert.match(slides[0], /src="data:image\/jpeg;base64,QUJD"/);
  assert.ok(hero, "hero tidak dibuat padahal artikel tidak punya gambar");
  assert.match(hero, /width:1200px;height:630px/, "hero bukan lanskap 1200x630");
  assert.match(hero, /src="data:image\/jpeg;base64,QUJD"/, "hero tidak memakai raster slide 1");
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
  assert.equal(seri[0], 78);
  assert.equal(seri[8], Math.round(78 * 0.7), "lantai skala 70%");

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

test("Rakit slide: sebagian gambar gagal meminjam latar tetangga", () => {
  const r = rakit({ gambar: 2 });
  assert.equal(r.gambar_gagal, 3);
  for (const s of r.slides) assert.match(s, /<img class="bg" src="data:image\/jpeg;base64,/);
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

test("kredensial: Gmail terpasang, sisanya placeholder yang jelas", () => {
  const belum = [];
  for (const n of wf.nodes.filter((x) => x.credentials)) {
    for (const [jenis, c] of Object.entries(n.credentials)) {
      assert.ok(c.id, `${n.name}/${jenis} tanpa id kredensial`);
      if (c.id.startsWith("ISI_ID_CREDENTIAL_")) belum.push(`${n.name}/${jenis}`);
    }
  }
  // Daftar ini adalah sisa pekerjaan setup. Kalau berubah tanpa sengaja,
  // docs/n8n-setup.md ikut ketinggalan — makanya dikunci di sini.
  assert.deepEqual([...new Set(belum)].sort(), [
    "Gemini Flash/googlePalmApi",
    "Gemini gambar/googlePalmApi",
  ]);
  // Workflow refresh cuma butuh Gmail; API key n8n lewat node Kredensial, bukan
  // credential n8n — supaya tetap satu tempat edit seperti kredensial lainnya.
  for (const n of rf.nodes.filter((x) => x.credentials)) {
    for (const [jenis, c] of Object.entries(n.credentials)) {
      assert.doesNotMatch(c.id, /^ISI_ID_CREDENTIAL_/, `refresh: ${n.name}/${jenis} belum diisi`);
    }
  }
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
