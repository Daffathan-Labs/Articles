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
  const putus = wf.nodes.map((n) => n.name).filter((n) => !lihat.has(n) && !subNode.has(n));
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

test("webhook POST, pakai Respond node, dan diautentikasi", () => {
  const w = byName["Webhook"];
  assert.equal(w.parameters.httpMethod, "POST");
  assert.equal(w.parameters.path, "portofolio");
  // responseNode: GitHub Actions tetap menerima status asli publish website.
  assert.equal(w.parameters.responseMode, "responseNode");
  // Webhook publik yang memicu penulisan ke website — auth tidak boleh hilang.
  assert.equal(w.parameters.authentication, "headerAuth");
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

test("file ter-commit tidak membawa kredensial hidup", () => {
  // Repo ini publik: token hidup di sini akan di-scrape bot dalam hitungan menit.
  // Nilai asli hidup di portofolio-publish.local.json yang di-gitignore.
  for (const f of ["article_api_key", "render_url", "render_token", "linkedin_token", "ig_user_id", "ig_token", "notify_email"]) {
    assert.match(kred(f), /^ISI_[A-Z_]+$/, `${f} membawa nilai asli`);
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
function rakit({ ronde = 0, gambar = 5, heading, body } = {}) {
  const slide = {
    heading: heading ?? "Satu dua tiga empat lima enam tujuh delapan",
    body: body ?? Array.from({ length: 25 }, (_, i) => `kata${i}`).join(" "),
  };
  const palsu = {
    "Siapkan brief": {
      folder: "artikel-uji",
      code: "artikel-uji",
      url_id: "https://daffathan-labs.my.id/id/articles/uji",
      url_en: "https://daffathan-labs.my.id/en/articles/uji",
      dilewat: [],
    },
    "Gemini copy": { output: { linkedin_caption: "LI", ig_caption: "IG", hashtags: ["#a"] } },
  };
  const $ = (n) => ({
    first: () => ({ json: palsu[n] }),
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
  // Slide terakhir wajib mencetak URL: tautan di caption IG tidak bisa diklik.
  assert.match(r.slides[4], /daffathan-labs\.my\.id\/id\/articles\/uji/);
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
  assert.doesNotMatch(r.slides[0], /<img/, "tanpa raster tidak boleh ada <img> kosong");
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
    "Webhook/httpHeaderAuth",
  ]);
});

test("semua e-mail lewat node Gmail, bukan SMTP", () => {
  const email = wf.nodes.filter((n) => /gmail|emailSend/.test(n.type));
  assert.equal(email.length, 4);
  for (const n of email) {
    assert.equal(n.type, "n8n-nodes-base.gmail", n.name);
    assert.equal(n.parameters.emailType, "html", n.name);
    // Tanpa ini n8n menempelkan baris promosinya sendiri di tiap e-mail.
    assert.equal(n.parameters.options.appendAttribution, false, n.name);
    assert.match(n.parameters.sendTo, /json\.notify_email/, n.name);
  }
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
