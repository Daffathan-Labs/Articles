// Self-check publish.js. Jalankan: node --test .github/scripts/publish.test.mjs
//
// Mengimpor publish.js apa adanya — tidak ada salinan logika di file ini, jadi
// rename fungsi atau perubahan regex langsung bikin test gagal, bukan lolos diam-diam.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import mod from "./publish.js";
const { parseArticle, classifyDiff, parseRepost } = mod;

// --------------------------------------------------------------- fixture
const META = [
  "<!-- title: Judul Uji -->",
  "<!-- excerpt: Ringkasan uji. -->",
  "<!-- image: https://example.com/cover.png -->",
  "<!-- date: 2026-08-12 -->",
  "<!-- posting_date: 2026-08-13 -->",
  "<!-- tags: Film, Review , AI -->",
].join("\n");

/** Bikin articles/<folder>/<file> di direktori temp, balikin root-nya. */
function fixture(files, meta = META, body = "\nIsi paragraf.\n") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-test-"));
  fs.mkdirSync(path.join(root, "artikel-uji"));
  for (const f of files) {
    fs.writeFileSync(path.join(root, "artikel-uji", f), `${meta}\n${body}`, "utf8");
  }
  return root;
}

// --------------------------------------------------------------- parseArticle
test("locale dibaca dari suffix nama file, default id", () => {
  const cases = {
    "artikel-uji-en.md": "en",
    "artikel-uji.en.md": "en",
    "artikel-uji-id.md": "id",
    "artikel-uji.id.md": "id",
    "artikel-uji.md": "id", // tanpa suffix -> default
    "artikel-uji-EN.md": "en", // pencocokan case-insensitive
  };
  const root = fixture(Object.keys(cases));
  for (const [file, locale] of Object.entries(cases)) {
    assert.equal(parseArticle(root, "artikel-uji", file).locale, locale, file);
  }
});

test("keenam field metadata terbaca, tags ter-split dan ter-trim", () => {
  const root = fixture(["artikel-uji-id.md"]);
  const a = parseArticle(root, "artikel-uji", "artikel-uji-id.md");

  assert.equal(a.id, "artikel-uji"); // id = nama folder, penghubung ID<->EN
  assert.equal(a.title, "Judul Uji");
  assert.equal(a.excerpt, "Ringkasan uji.");
  assert.equal(a.date, "2026-08-12");
  assert.equal(a.posting_date, "2026-08-13");
  assert.equal(a.image, "https://example.com/cover.png");
  assert.deepEqual(a.tags, ["Film", "Review", "AI"]);
});

test("payload tidak punya field di luar CreateArticleDto", () => {
  // /articles pakai forbidNonWhitelisted: satu field asing = 400 dari API.
  const root = fixture(["artikel-uji-id.md"]);
  const a = parseArticle(root, "artikel-uji", "artikel-uji-id.md");
  assert.deepEqual(Object.keys(a).sort(), [
    "content", "date", "excerpt", "id", "image", "locale",
    "posting_date", "tags", "title",
  ]);
});

test("metadata wajib yang hilang bikin throw, bukan 400 dari server", () => {
  for (const key of ["title", "excerpt", "date"]) {
    const meta = META.split("\n").filter((l) => !l.startsWith(`<!-- ${key}:`)).join("\n");
    const root = fixture(["artikel-uji-id.md"], meta);
    assert.throws(
      () => parseArticle(root, "artikel-uji", "artikel-uji-id.md"),
      /metadata wajib tidak lengkap/,
      key
    );
  }
});

test("list yang nempel paragraf tetap jadi <ul>", () => {
  // Tanpa perbaikan ini marked memperlakukan "- satu" sebagai lanjutan paragraf
  // dan hasilnya satu <p> panjang tanpa <ul> sama sekali.
  const root = fixture(["artikel-uji-id.md"], META, "\nParagraf:\n- satu\n- dua\n");
  const { content } = parseArticle(root, "artikel-uji", "artikel-uji-id.md");
  assert.match(content, /<p>Paragraf:<\/p>/);
  assert.match(content, /<ul>[\s\S]*satu[\s\S]*dua[\s\S]*<\/ul>/);
  // Baris kosong yang disisipkan bikin list jadi "loose", jadi marked membungkus
  // tiap item dalam <p>. Itu memang keluarannya — dikunci di sini supaya perubahan
  // regex-nya nanti kelihatan, bukan karena bentuk ini yang diinginkan.
  assert.match(content, /<li><p>satu<\/p>/);
});

test("komentar metadata dibuang dari content", () => {
  const root = fixture(["artikel-uji-id.md"]);
  const { content } = parseArticle(root, "artikel-uji", "artikel-uji-id.md");
  assert.doesNotMatch(content, /<!--/);
  assert.doesNotMatch(content, /Judul Uji/);
});

// --------------------------------------------------------------- classifyDiff
const diff = (...lines) => classifyDiff(lines.join("\n") + "\n");

test("folder yang semua .md-nya A dihitung baru", () => {
  const { folders, addedMd } = diff(
    "A\tarticles/artikel-baru/artikel-baru-id.md",
    "A\tarticles/artikel-baru/artikel-baru-en.md",
    "A\tarticles/artikel-baru/banner.png"
  );
  assert.deepEqual([...folders], ["artikel-baru"]);
  assert.deepEqual([...addedMd.get("artikel-baru")].sort(), [
    "artikel-baru-en.md",
    "artikel-baru-id.md",
  ]);
  assert.ok(!addedMd.get("artikel-baru").has("banner.png"), "non-.md tidak dihitung");
});

test("edit artikel lama tidak masuk addedMd — ini yang mencegah post ulang", () => {
  const { folders, addedMd } = diff("M\tarticles/artikel-lama/artikel-lama-id.md");
  assert.deepEqual([...folders], ["artikel-lama"]);
  assert.equal(addedMd.get("artikel-lama"), undefined);
});

test("nambah terjemahan EN ke artikel lama: hanya EN yang A", () => {
  // main() minta SEMUA .md di disk berstatus A, jadi folder ini tidak lolos.
  const { addedMd } = diff("A\tarticles/artikel-lama/artikel-lama-en.md");
  assert.deepEqual([...addedMd.get("artikel-lama")], ["artikel-lama-en.md"]);
  assert.ok(!addedMd.get("artikel-lama").has("artikel-lama-id.md"));
});

test("rename tidak dihitung baru, dan yang dipakai path tujuan", () => {
  const { folders, addedMd } = diff(
    "R100\tarticles/nama-lama/x-id.md\tarticles/nama-baru/x-id.md"
  );
  assert.deepEqual([...folders], ["nama-baru"]);
  assert.equal(addedMd.get("nama-baru"), undefined);
});

test("delete tersentuh tapi tidak baru", () => {
  const { folders, addedMd } = diff("D\tarticles/artikel-hapus/artikel-hapus-en.md");
  assert.deepEqual([...folders], ["artikel-hapus"]);
  assert.equal(addedMd.get("artikel-hapus"), undefined);
});

test("baris di luar articles/ dan baris kosong diabaikan", () => {
  const { folders } = diff("M\tREADME.md", "", "A\tarticles/oke/oke-id.md", "   ");
  assert.deepEqual([...folders], ["oke"]);
});

// --------------------------------------------------------------- parseRepost
test("penanda repost diambil apa adanya", () => {
  assert.deepEqual(parseRepost("[repost: review-supergirl]"), ["review-supergirl"]);
});

test("spasi longgar dan huruf besar tetap kena", () => {
  assert.deepEqual(parseRepost("[REPOST:   review-anora  ]"), ["review-anora"]);
});

test("dua penanda dalam satu pesan, urut", () => {
  assert.deepEqual(parseRepost("[repost: satu] dan [repost: dua]"), ["satu", "dua"]);
});

test("pesan commit biasa tidak memicu apa-apa", () => {
  assert.deepEqual(parseRepost("review film baru"), []);
  assert.deepEqual(parseRepost("perbaiki [repost] tanpa nama"), []);
  assert.deepEqual(parseRepost(""), []);
  assert.deepEqual(parseRepost(undefined), []);
});

test("penanda kosong tidak menghasilkan string kosong", () => {
  // Tanpa .filter(Boolean) ini jadi [""], dan existsSync("articles/") lolos —
  // folder repost kosong yang diam-diam tidak cocok dengan folder mana pun.
  assert.deepEqual(parseRepost("[repost:    ]"), []);
});

test("pesan multi-baris seperti keluaran git log --format=%B", () => {
  const pesan = [
    "review supergirl",
    "",
    "Render gagal 8 ronde kemarin.",
    "[repost: review-supergirl]",
    "",
    "perbaiki typo",
    "",
  ].join("\n");
  assert.deepEqual(parseRepost(pesan), ["review-supergirl"]);
});

test("workflow Action tidak memfilter paths — kalau difilter, [repost:] mati diam-diam", () => {
  // `git commit --allow-empty -m "[repost: folder]"` adalah satu-satunya cara mengirim
  // ulang artikel lama ke sosmed. Commit kosong tidak menyentuh berkas apa pun, jadi
  // `paths: articles/**` bikin GitHub melewati Action-nya tanpa pesan apa pun — push
  // berhasil, Action tidak pernah muncul, dan kelihatannya seperti n8n yang bermasalah.
  //
  // Ini pernah terjadi: filter itu ada sampai 2026-08-13 dan [repost:] belum pernah
  // sekali pun benar-benar jalan. Gerbang penggantinya ada di main() — folders kosong
  // berarti berhenti sebelum memanggil webhook.
  const yml = fs.readFileSync(
    path.join(import.meta.dirname, "..", "workflows", "publish-articles.yml"),
    "utf8"
  );
  const isi = yml
    .split("\n")
    .filter((b) => !b.trimStart().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(isi, /^\s+paths:/m, "filter paths mematikan [repost:]");
  assert.match(isi, /^\s+push:\s*$/m, "trigger push harus tetap ada, tanpa filter");
});

test("checkout mengambil riwayat penuh — fetch-depth dangkal bikin repost hilang senyap", () => {
  // Satu push boleh berisi berapa pun commit, jadi kedalaman yang cukup selalu
  // "jumlah commit + 1" — angka yang tidak bisa ditebak saat menulis workflow-nya.
  // Kalau kurang, `git diff $BEFORE_SHA $SHA` gagal, publish.js jatuh ke mode sync,
  // dan [repost:] ikut hilang tanpa satu pun pesan error. Terjadi 2026-08-13.
  const yml = fs.readFileSync(
    path.join(import.meta.dirname, "..", "workflows", "publish-articles.yml"),
    "utf8"
  );
  const m = yml.match(/^\s+fetch-depth:\s*(\d+)/m);
  assert.ok(m, "fetch-depth harus disebut eksplisit, bukan default 1");
  assert.equal(m[1], "0", `fetch-depth ${m[1]} tidak cukup untuk push multi-commit`);
});

// ─────────────────────────────────────────── dua tujuan, dua webhook path
const { urlUlang, tujuanFolder } = mod;

test("URL kirim ulang diturunkan dari WEBHOOK_URL, bukan secret kedua", () => {
  assert.equal(
    urlUlang("https://n8n.contoh.id/webhook/portofolio"),
    "https://n8n.contoh.id/webhook/portofolio-ulang"
  );
  // Bentuk yang tidak sesuai harus GAGAL KERAS. Diturunkan diam-diam dari URL yang
  // bentuknya lain, hasilnya 404 yang tidak menjelaskan apa-apa dan kirim ulang
  // berhenti bekerja tanpa satu pun pesan.
  for (const salah of ["", null, "https://n8n.contoh.id/webhook/portofolio/", "https://n8n.contoh.id/hook/lain"]) {
    assert.throws(() => urlUlang(salah), /berakhiran \/portofolio/, `diterima: ${salah}`);
  }
  // Host disamarkan — ini berjalan di log Action yang bisa dibaca siapa pun yang
  // punya akses repo.
  assert.throws(() => urlUlang("https://rahasia.internal/hook/x"), (e) => {
    assert.doesNotMatch(e.message, /rahasia\.internal/, "host bocor ke log");
    return true;
  });
});

test("artikel baru dan [repost:] pergi ke tujuan yang berbeda", () => {
  const only = (repost, added) => ({ repost, addedMd: new Map(added) });

  // Semua .md berstatus A = artikel baru = jalur normal, LinkedIn ikut.
  assert.equal(
    tujuanFolder("a", ["a-id.md", "a-en.md"], only([], [["a", new Set(["a-id.md", "a-en.md"])]])),
    "baru"
  );
  // Menambah terjemahan EN ke artikel lama BUKAN artikel baru — berkas ID-nya tidak
  // muncul di diff, jadi ini tidak boleh mem-posting ulang apa pun.
  assert.equal(
    tujuanFolder("a", ["a-id.md", "a-en.md"], only([], [["a", new Set(["a-en.md"])]])),
    null
  );
  // Penanda repost = jalur ulang, tanpa LinkedIn.
  assert.equal(tujuanFolder("a", ["a-id.md"], only(["a"], [])), "ulang");
  // Folder yang tidak disebut tidak ke mana-mana.
  assert.equal(tujuanFolder("b", ["b-id.md"], only(["a"], [])), null);
  // Mode sync (only = null) tidak pernah mengantre posting.
  assert.equal(tujuanFolder("a", ["a-id.md"], null), null);

  // Artikel yang benar-benar baru menang atas penanda repost untuk folder yang sama:
  // dia belum pernah ke LinkedIn, jadi jalur normal yang benar.
  assert.equal(
    tujuanFolder("a", ["a-id.md"], only(["a"], [["a", new Set(["a-id.md"])]])),
    "baru"
  );
});

test("kedua workflow n8n punya path webhook sendiri dan boleh aktif bersamaan", () => {
  // Dulu path-nya sengaja sama supaya n8n memaksa cuma satu yang aktif. Akibatnya
  // "artikel baru ke semua sosmed" dan "artikel lama ke IG+FB saja" tidak pernah bisa
  // berlaku bersamaan — dan yang menentukan cuma saklar aktif, yang ternyata bisa
  // bergeser sendiri waktu workflow-nya di-deploy ulang.
  const wf = (n) =>
    JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "..", "n8n", n), "utf8"));
  const hook = (w) => w.nodes.find((x) => x.type === "n8n-nodes-base.webhook");
  const a = hook(wf("portofolio-publish.json"));
  const b = hook(wf("portofolio-ulang.json"));

  assert.equal(a.parameters.path, "portofolio");
  assert.equal(b.parameters.path, "portofolio-ulang");
  assert.equal(
    b.parameters.path,
    urlUlang("https://x/webhook/" + a.parameters.path).split("/").pop(),
    "path Ulang tidak cocok dengan yang diturunkan publish.js — kirim ulang jadi 404"
  );
  assert.notEqual(a.webhookId, b.webhookId, "webhookId sama: n8n mendaftarkan webhook yang sama dua kali");
});
