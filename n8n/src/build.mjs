// Merakit n8n/portofolio-publish.json dari potongan yang bisa dibaca manusia.
// Alasan ada builder: 6 Code node + template HTML 1080x1350 kalau di-escape tangan
// ke dalam JSON hampir pasti salah dan tidak bisa di-review.
import fs from 'node:fs';
import path from 'node:path';

// import.meta.dirname, bukan URL.pathname: pathname itu percent-encoded, jadi
// "Daffathan Labs" jadi "Daffathan%20Labs" dan readFileSync gagal ENOENT.
const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '..', '..');
const baca = (f) => fs.readFileSync(path.join(HERE, f), 'utf8').trimEnd();
const bacaRoot = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').trimEnd();
/** Aset biner dari root repo, disisipkan sebagai data URI. */
const dataUri = (f, mime) =>
  `data:${mime};base64,${fs.readFileSync(path.join(ROOT, f)).toString('base64')}`;

/**
 * ID kredensial n8n. Ini BUKAN rahasia — cuma nomor rekaman di instance-nya; isinya
 * (API key, token OAuth) tetap tinggal di n8n dan tidak pernah ikut ter-ekspor. Jadi
 * aman ter-commit, dan HARUS nilai asli.
 *
 * Sempat ditulis `ISI_ID_CREDENTIAL_GEMINI` seperti placeholder rahasia lain, dan itu
 * salah: node `credentials` tidak ikut disulih `tulis()` — yang disulih cuma node
 * `Kredensial`. Akibatnya berkas .local.json pun membawa placeholder, dan sekali
 * di-import, `Gemini Flash` mati dengan "Credential with ID ... does not exist" di
 * tengah eksekusi, setelah artikelnya sudah terbit ke website.
 */
/*
 * Yang INI, bukan "…account 2". Account 2 milik orang lain dan project-nya tanpa
 * billing: `GET /v1beta/models` tetap membalas 200 dan menampilkan sembilan model
 * gambar, tapi memanggilnya dibalas 429 `generate_content_free_tier_requests,
 * limit: 0` — jatah gambar di tier gratis bukan kecil, tapi NOL. Yang terlihat di n8n
 * cuma "The service is receiving too many requests from you", yang menyesatkan karena
 * kedengaran seperti batas per menit. Key ini dibuktikan membalas 200 dengan PNG utuh.
 */
const GEMINI_CRED = {
  googlePalmApi: { id: 'tpUqnrdzmryxe2ps', name: 'Google Gemini(PaLM) Api account' },
};
const GMAIL_CRED = { gmailOAuth2: { id: '2oer50BZ7t1Mfj85', name: 'Gmail account' } };

/**
 * Node Gmail mengirim DARI akun yang terautentikasi, jadi tidak ada fromEmail —
 * NOTIFY_EMAIL cuma penerima. appendAttribution dimatikan supaya n8n tidak
 * menempelkan baris promosinya sendiri di tiap e-mail.
 */
const gmail = (subject, message) => ({
  sendTo: `={{ $('Kredensial').first().json.notify_email }}`,
  subject,
  emailType: 'html',
  message,
  options: { appendAttribution: false },
});

let nodes = [];
let conn = {};

const N = (name, type, typeVersion, position, parameters, extra = {}) => {
  nodes.push({ parameters, type, typeVersion, position, id: name, name, ...extra });
  return name;
};
/** hubung(dari, ke, outputIndex, tipe, inputIndex) */
const hubung = (dari, ke, idx = 0, tipe = 'main', masuk = 0) => {
  conn[dari] ??= {};
  conn[dari][tipe] ??= [];
  while (conn[dari][tipe].length <= idx) conn[dari][tipe].push([]);
  conn[dari][tipe][idx].push({ node: ke, type: tipe, index: masuk });
};
/** Sub-node LangChain menyambung ke induknya, arah terbalik dari main. */
const sub = (anak, induk, tipe) => hubung(anak, induk, 0, tipe);

const http = (o) => ({ options: {}, ...o });
const bearer = (v) => ({ name: 'Authorization', value: `=Bearer ${v}` });

/** Referensi ke satu field di node Kredensial. */
const K = (f) => `$('Kredensial').first().json.${f}`;

/**
 * Header LinkedIn dipakai DUA node. Kalau keduanya sempat beda versinya,
 * initializeUpload berhasil tapi /rest/posts gagal 426 — kegagalan separuh jalan
 * yang paling susah dilacak. Satu helper membuatnya konsisten by construction.
 */
const LI_HEADERS = () => [
  bearer(`{{ ${K('linkedin_token')} }}`),
  { name: 'LinkedIn-Version', value: `={{ ${K('linkedin_version')} }}` },
  { name: 'X-Restli-Protocol-Version', value: '2.0.0' },
];

/**
 * Semua nilai yang perlu diubah manusia, di SATU node — bukan tersebar di env var
 * dan parameter node. Token LinkedIn kedaluwarsa tiap 60 hari dan versi API tiap
 * ~12 bulan, jadi tempat menggantinya harus satu dan gampang ditemukan.
 *
 * Repo ini publik, jadi build menghasilkan dua file: versi ter-commit memakai
 * placeholder, versi .local.json memakai nilai asli dan tidak masuk git.
 */
// Nilai rahasia dibaca dari file di samping builder, bukan dari argumen atau env:
// keduanya bocor ke riwayat shell dan daftar proses. File ini tidak pernah masuk repo.
let RAHASIA = {};
try {
  RAHASIA = JSON.parse(baca('secrets.local.json'));
} catch {
  console.log('secrets.local.json tidak ada — .local.json ikut memakai placeholder.');
}
const asli = (k, fallback) => RAHASIA[k] || fallback;

/**
 * SATU saklar untuk cabang Facebook. false = tiga node FB ikut ter-build tapi
 * nonaktif, dan `Tunggu 2 cabang` tetap dua input.
 *
 * Kenapa nonaktifnya harus ikut memutus sambungan ke node Merge, bukan cuma
 * mematikan node-nya: node nonaktif TIDAK dieksekusi n8n, sementara Merge menunggu
 * semua input yang tersambung. Cabang FB yang nonaktif tapi tetap tersambung
 * membuat `Email hasil` menunggu masukan yang tidak akan pernah datang — dan yang
 * mati bukan cuma Facebook, tapi seluruh laporan hasil publish.
 *
 * Mengaktifkan Facebook: isi fb_page_id + fb_page_token di secrets.local.json,
 * ubah baris ini jadi true, build ulang, import ulang. Tidak ada langkah manual
 * di kanvas n8n.
 */
const FB_AKTIF = true;

/*
 * Cadangan Google Custom Search DIHAPUS, bukan sekadar dimatikan.
 *
 * Rencananya dulu: kalau film tidak ketemu di TMDB, cari fotonya lewat Custom Search JSON
 * API yang disetel "Search the entire web". Opsi itu sudah tidak ada. Google mengumumkan
 * 20 Januari 2026 bahwa mesin telusur BARU cuma boleh mendaftar maksimal 50 domain —
 * "Search the entire web" tidak bisa dinyalakan lagi untuk mesin yang baru dibuat, dan
 * yang lama pun wajib pindah sebelum 1 Januari 2027. Penggantinya berbayar dan harus
 * lewat formulir minat.
 *
 * Jadi cabang ini tidak akan pernah bisa dinyalakan. Saklar yang menjaga kode mati yang
 * mustahil hidup cuma menipu orang yang membacanya nanti — termasuk aku sendiri.
 */

const FIELD = [
  ['article_api_url', 'https://api.daffathan-labs.my.id', 'https://api.daffathan-labs.my.id'],
  ['article_api_key', 'ISI_ARTICLE_API_KEY', 'daffathan-labs-articles-pipeline'],
  ['site_url', 'https://daffathan-labs.my.id', 'https://daffathan-labs.my.id'],
  ['render_url', 'ISI_RENDER_URL', asli('render_url', 'ISI_RENDER_URL')],
  ['render_token', 'ISI_RENDER_TOKEN', asli('render_token', 'ISI_RENDER_TOKEN')],
  ['linkedin_token', 'ISI_LINKEDIN_ACCESS_TOKEN', asli('linkedin_token', 'ISI_LINKEDIN_ACCESS_TOKEN')],
  ['linkedin_urn', 'urn:li:person:B1oVXChp7v', 'urn:li:person:B1oVXChp7v'],
  // Jendela aktif diverifikasi 2026-08-12: 202508–202607. Lewat dari itu -> 426.
  ['linkedin_version', '202607', '202607'],
  // Diverifikasi 2026-08-12 lewat GET /me: user_id (BUKAN field "id"), akun
  // MEDIA_CREATOR, izin content_publish terbukti ada.
  ['ig_user_id', 'ISI_IG_USER_ID', asli('ig_user_id', 'ISI_IG_USER_ID')],
  ['ig_token', 'ISI_IG_ACCESS_TOKEN', asli('ig_token', 'ISI_IG_ACCESS_TOKEN')],
  // Halaman Facebook, BUKAN profil pribadi: publikasi ke profil pribadi lewat API
  // sudah dicabut Meta sejak 2018 dan tidak ada izin yang mengembalikannya.
  // Token Halaman tidak kedaluwarsa selama pemiliknya masih admin — lihat
  // docs/credentials-facebook.md.
  ['fb_page_id', 'ISI_FB_PAGE_ID', asli('fb_page_id', 'ISI_FB_PAGE_ID')],
  ['fb_page_token', 'ISI_FB_PAGE_TOKEN', asli('fb_page_token', 'ISI_FB_PAGE_TOKEN')],
  // PAT fine-grained: HANYA repo Articles, HANYA Contents read/write. Dipakai cabang
  // commit balik untuk menulis hero.jpg dan dua berkas .md. Izin lain tidak dibutuhkan
  // dan cuma memperbesar kerugian kalau bocor.
  ['github_token', 'ISI_GITHUB_TOKEN', asli('github_token', 'ISI_GITHUB_TOKEN')],
  // Foto asli untuk artikel film. Model gambar menolak menggambar karakter berhak cipta
  // dan wajah orang nyata, jadi Spider-Man dan Sadie Sink tidak akan pernah keluar dari
  // Gemini — satu-satunya jalan ke foto yang benar-benar menampilkan subjeknya adalah
  // mengambil yang memang sudah ada. TMDB gratis dan memang dibangun untuk ini.
  ['tmdb_api_key', 'ISI_TMDB_API_KEY', asli('tmdb_api_key', 'ISI_TMDB_API_KEY')],
  ['notify_email', 'ISI_EMAIL_TUJUAN', 'daffa.fathan9@gmail.com'],
];
const kondisi = (leftValue, operator, rightValue) => ({
  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
  conditions: [{ id: 'c1', leftValue, rightValue, operator }],
  combinator: 'and',
});

// ─────────────────────────────────────────────── 1. terima & publish ke website
// TANPA autentikasi, atas permintaan. Konsekuensinya nyata: siapa pun yang tahu
// alamat ini bisa menulis artikel ke website dan memicu posting ke LinkedIn dan
// Instagram. Yang menjaganya sekarang cuma kerahasiaan URL-nya, dan `portofolio`
// itu gampang ditebak — ganti `path` jadi acak (mis. `portofolio-a7f3k9x2`) kalau
// mau pengamanan tanpa membuat credential Header Auth.
N('Webhook', 'n8n-nodes-base.webhook', 2.1, [-720, 300], {
  httpMethod: 'POST',
  path: 'portofolio',
  // Membalas lewat node Respond, bukan langsung: GitHub Actions jadi tetap menerima
  // status asli publish website, sementara cabang sosmed berjalan setelahnya.
  responseMode: 'responseNode',
  options: {},
}, {
  webhookId: '7df7abbe-8eb6-43b7-9b47-5061592604aa',
});

// includeOtherFields: body dari webhook harus tetap lewat ke node di bawahnya.
N('Kredensial', 'n8n-nodes-base.set', 3.4, [-500, 300], {
  assignments: {
    assignments: FIELD.map(([name, placeholder]) => ({
      id: name,
      name,
      value: placeholder,
      type: 'string',
    })),
  },
  includeOtherFields: true,
  options: {},
});
hubung('Webhook', 'Kredensial');

N('Mode sync?', 'n8n-nodes-base.if', 2.2, [-280, 300], {
  conditions: kondisi('={{ $json.body.mode }}', { type: 'string', operation: 'equals' }, 'sync'),
  options: {},
});
hubung('Kredensial', 'Mode sync?');

// ── cabang sync (workflow_dispatch): destruktif, dan tidak pernah memicu sosmed
N('Sync ke API', 'n8n-nodes-base.httpRequest', 4.2, [-280, 120], http({
  method: 'POST',
  url: `={{ ${K('article_api_url')} }}/articles/sync`,
  sendHeaders: true,
  headerParameters: { parameters: [bearer(`{{ ${K('article_api_key')} }}`)] },
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.body.articles) }}',
  options: { timeout: 300000 },
}), { onError: 'continueRegularOutput' });
hubung('Mode sync?', 'Sync ke API', 0);

N('Cek sync', 'n8n-nodes-base.code', 2, [-60, 120], { jsCode: baca('cek-sync.js') });
hubung('Sync ke API', 'Cek sync');

N('Respond sync', 'n8n-nodes-base.respondToWebhook', 1.1, [160, 120], {
  respondWith: 'json',
  responseBody: '={{ JSON.stringify($json) }}',
  options: {},
});
hubung('Cek sync', 'Respond sync');

// ── cabang delta (push biasa)
N('Pecah artikel', 'n8n-nodes-base.splitOut', 1, [-280, 460], {
  fieldToSplitOut: 'body.articles',
  options: {},
});
hubung('Mode sync?', 'Pecah artikel', 1);

// Sengaja TANPA onError: 400/403 dari API harus bikin webhook membalas 500 supaya
// GitHub Actions merah. Ini satu-satunya umpan balik CI yang tersisa setelah n8n
// mengambil alih publishing.
N('Publish artikel', 'n8n-nodes-base.httpRequest', 4.2, [-60, 460], http({
  method: 'POST',
  url: `={{ ${K('article_api_url')} }}/articles`,
  sendHeaders: true,
  headerParameters: { parameters: [bearer(`{{ ${K('article_api_key')} }}`)] },
  sendBody: true,
  specifyBody: 'json',
  // $json di sini sudah satu objek artikel bersih dari splitOut — jangan tambah
  // field apa pun, /articles memakai forbidNonWhitelisted.
  jsonBody: '={{ JSON.stringify($json) }}',
  options: { timeout: 120000 },
}));
hubung('Pecah artikel', 'Publish artikel');

N('Ringkas hasil', 'n8n-nodes-base.code', 2, [160, 460], { jsCode: baca('ringkas-hasil.js') });
hubung('Publish artikel', 'Ringkas hasil');

N('Respond delta', 'n8n-nodes-base.respondToWebhook', 1.1, [380, 460], {
  respondWith: 'json',
  responseBody: '={{ JSON.stringify($json) }}',
  options: {},
});
hubung('Ringkas hasil', 'Respond delta');

// ─────────────────────────────────────────────── 2. gerbang sosmed
N('Ada artikel baru?', 'n8n-nodes-base.if', 2.2, [600, 460], {
  conditions: kondisi(
    '={{ ($(\'Webhook\').first().json.body.new_folders || []).length }}',
    { type: 'number', operation: 'gt' },
    0
  ),
  options: {},
});
hubung('Respond delta', 'Ada artikel baru?');

N('Siapkan brief', 'n8n-nodes-base.code', 2, [820, 460], { jsCode: baca('siapkan-brief.js') });
hubung('Ada artikel baru?', 'Siapkan brief', 0);

// Gambar artikel diunduh sekali di sini, lalu dipakai tiga kali: latar slide 1,
// gambar tunggal LinkedIn, dan penentu perlu-tidaknya hero digenerate.
// `cover` kosong (artikel tanpa gambar) bikin URL-nya invalid dan node ini gagal —
// itu memang jalur normalnya, makanya onError meneruskan alih-alih menghentikan.
N('Ambil cover', 'n8n-nodes-base.httpRequest', 4.2, [1040, 240], {
  url: '={{ $json.cover }}',
  options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
}, { onError: 'continueRegularOutput' });
hubung('Siapkan brief', 'Ambil cover');

// Instance ini menyimpan binary di FILESYSTEM (N8N_DEFAULT_BINARY_DATA_MODE=filesystem),
// jadi `binary.data.data` berisi string literal "filesystem-v2" — bukan base64. Berkas
// aslinya ada di disk, ditunjuk `binary.data.id`. Dipasang apa adanya ke
// <img src="data:image/webp;base64,…">, yang keluar adalah ikon gambar rusak, dan itu
// yang terjadi di SETIAP slide selama ini (eksekusi 4212, slide 1). Node ini yang
// membaca berkasnya dari disk dan menaruh base64 sungguhan di `json.b64`.
//
// Perhatikan: node ini MENGGANTI json, bukan menambah. Aman di sini karena
// prompt-copy.txt cuma membaca $('Siapkan brief'), tidak pernah $json.
// Dipakai dua kali: sekali untuk gambar artikel, sekali untuk raster tiap slide.
// Alasan node ini ada — dan alasan `Extract From File` tidak dipakai — ada di berkasnya.
const KE_B64 = { jsCode: baca('ke-base64.js') };

// Artikel tanpa gambar bikin `Ambil cover` gagal dan meneruskan item tanpa binary.
// Node ini tetap mengeluarkan satu item (`b64: null`), jadi `Gemini copy` tetap jalan.
N('Cover base64', 'n8n-nodes-base.code', 2, [1260, 240], KE_B64);
hubung('Ambil cover', 'Cover base64');

// ─────────────────────────────────────────────── 3. caption + slide
N('Gemini copy', '@n8n/n8n-nodes-langchain.chainLlm', 1.7, [1040, 460], {
  promptType: 'define',
  // docs/voice.md adalah satu-satunya sumber voice; disisipkan di sini supaya tidak
  // pernah ada salinan kedua yang diam-diam berbeda.
  text: '=' + baca('prompt-copy.txt').replace('{{VOICE}}', bacaRoot('docs/voice.md')),
  hasOutputParser: true,
}, { retryOnFail: true, maxTries: 5, waitBetweenTries: 5000 });
hubung('Cover base64', 'Gemini copy');

N('Gemini Flash', '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', 1, [1000, 680], {
  modelName: 'models/gemini-3-flash-preview',
  options: {},
}, { credentials: GEMINI_CRED });
sub('Gemini Flash', 'Gemini copy', 'ai_languageModel');

N('Skema copy', '@n8n/n8n-nodes-langchain.outputParserStructured', 1.2, [1180, 680], {
  schemaType: 'manual',
  inputSchema: JSON.stringify({
    type: 'object',
    required: [
      'linkedin_caption', 'ig_caption', 'fb_caption', 'hashtags', 'slides',
      'image_series', 'accent', 'layout', 'image_mood', 'film', 'film_tahun',
    ],
    properties: {
      linkedin_caption: { type: 'string', description: 'Bahasa Inggris, 120-200 kata, diakhiri URL EN' },
      // Instagram memotong caption di ~125 karakter dan tautannya tidak bisa diklik.
      // Facebook tidak memotong dan tautannya hidup, jadi panjang yang sama untuk
      // dua-duanya berarti salah satunya pasti salah bentuk.
      ig_caption: { type: 'string', description: 'Bahasa Indonesia, 30-60 kata, diakhiri "Link lengkapnya di bio"' },
      fb_caption: { type: 'string', description: 'Bahasa Indonesia, 150-250 kata, diakhiri "Baca lengkapnya: <URL ID>"' },
      hashtags: { type: 'array', items: { type: 'string' }, description: 'maksimal 5 hashtag huruf kecil' },
      image_series: { type: 'string', description: 'Satu kalimat Inggris pengikat kelima gambar' },
      // Tiga field desain, per ARTIKEL bukan per slide: satu artikel tetap satu wajah
      // di kelima slide. Nilainya tidak dipercaya mentah-mentah — `accent` diperiksa
      // bentuk dan kontrasnya, `layout` dicocokkan ke daftar tertutup, dua-duanya di
      // rakit-slide.js.
      accent: {
        type: 'string',
        description: 'Satu warna #RRGGBB dari KELUARGA BIRU (hue 180-265: teal, biru, indigo). Dipakai sebagai latar chip berteks putih, jadi harus cukup pekat — kontras minimal 4.5:1. Di luar rentang itu diganti biru brand',
      },
      layout: {
        type: 'string',
        enum: ['blok-bawah', 'pias-bawah', 'tengah'],
        description: 'blok-bawah = foto penuh + blok teks di bawah; pias-bawah = foto atas + panel gelap bawah; tengah = judul di tengah foto',
      },
      image_mood: {
        type: 'string',
        description: 'Bahasa Inggris, 3-8 kata. Arah cahaya dan warna foto sesuai tema artikel, mis. "neon night city, high contrast"',
      },
      // Satu-satunya field baru untuk jalur foto asli. Kosong = artikelnya bukan tentang
      // film, dan seluruh cabang TMDB langsung jatuh ke generasi Gemini seperti biasa.
      // Judul dan tahun DIPISAH, dan itu bukan kerapian belaka. TMDB search mencocokkan
      // string judul apa adanya, jadi tahun yang ikut menempel di query justru merusak
      // pencariannya: "Fantastic Four: First Steps 2025" dan "Mortal Kombat II 2026"
      // dua-duanya mengembalikan NOL hasil, dan "Superman 2025" mendarat di sebuah entri
      // bernama "Superman (2025) In a Nutshell" yang punya nol backdrop. Tahunnya punya
      // parameter sendiri di API-nya; di situ dia menyaring, bukan mengacaukan.
      film: {
        type: 'string',
        description: 'Judul RESMI film/serial yang diulas, bahasa Inggris, TANPA tahun dan tanpa tambahan kata apa pun. String KOSONG kalau artikelnya bukan ulasan film/serial',
      },
      film_tahun: {
        type: 'string',
        description: 'Tahun rilis film tersebut, 4 angka saja, mis. "2026". String KOSONG kalau tidak yakin atau artikelnya bukan ulasan film',
      },
      slides: {
        type: 'array',
        description: 'Tepat 5 slide: hook, 3 poin, CTA',
        items: {
          type: 'object',
          required: ['heading', 'body', 'image_prompt', 'image_mode'],
          properties: {
            // 6, bukan 8. Judulnya 74px HURUF BESAR di lebar 952px — sekitar 23 karakter
            // per baris. Heading 8 kata jadi EMPAT baris dan slide-nya sesak; 6 kata
            // ("Sadie Sink sebagai Jean Grey") duduk di dua baris. Angkanya harus sama
            // dengan prompt-copy.txt dan maksKata di rakit-slide.js — ada test-nya.
            heading: { type: 'string', description: 'Bahasa Indonesia, MAKSIMAL 6 kata, muat dua baris' },
            // 22-32, dan batas BAWAH-nya sama seriusnya. Panel teks tingginya tetap,
            // jadi body sembilan kata meninggalkan sepertiga slide sebagai bidang
            // kosong. Angkanya harus sama persis dengan prompt-copy.txt: skema dan
            // prompt yang berselisih dimenangkan skema, dan "maksimal 25" di sini
            // sempat membatalkan permintaan 22-32 di prompt tanpa satu pun error.
            body: { type: 'string', description: 'Bahasa Indonesia, 22-32 kata (dua kalimat), boleh kosong di slide 1' },
            image_prompt: { type: 'string', description: 'Inggris, 1-2 kalimat, foto latar saja, dilarang ada teks di gambar' },
            image_mode: { type: 'string', enum: ['konseptual', 'tekstur', 'dokumenter', 'tempat', 'properti'] },
          },
        },
      },
    },
  }, null, 2),
});
sub('Skema copy', 'Gemini copy', 'ai_outputParser');

// ── foto asli untuk artikel film ────────────────────────────────────────────────
// Model gambar menolak menggambar karakter berhak cipta dan wajah orang nyata, jadi
// "Spider-Man" dan "Sadie Sink" tidak akan pernah keluar dari Gemini seberapa pun
// promptnya diputar. Satu-satunya jalan ke foto yang benar-benar menampilkan subjeknya
// adalah mengambil yang memang sudah ada.
//
// Dicari SEKALI per artikel, bukan per slide: satu film punya puluhan still (Spider-Man:
// Brand New Day punya 85), jadi satu panggilan sudah cukup untuk kelima slide.
const tmdb = (nama, posisi, url, param) =>
  N(nama, 'n8n-nodes-base.httpRequest', 4.2, posisi, {
    url,
    sendQuery: true,
    queryParameters: {
      parameters: [{ name: 'api_key', value: `={{ ${K('tmdb_api_key')} }}` }, ...param],
    },
    options: {},
  }, {
    // `film` kosong dibalas 422, id yang tidak ada dibalas 404. Dua-duanya jalur normal
    // untuk artikel non-film — bukan alasan menghentikan pipeline.
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
  });

tmdb('Cari film', [1040, 40], 'https://api.themoviedb.org/3/search/movie', [
  { name: 'query', value: "={{ $('Gemini copy').first().json.output.film }}" },
  // Tahun lewat parameter sendiri, TIDAK ikut menempel di query — alasan lengkapnya di
  // atas field `film_tahun`. Kosong pun aman: TMDB mengabaikan `year=` yang kosong.
  { name: 'year', value: "={{ $('Gemini copy').first().json.output.film_tahun || '' }}" },
]);
hubung('Gemini copy', 'Cari film');

// id 0 kalau pencariannya nihil — dibalas 404 dan diteruskan sebagai kolam kosong.
tmdb('Still film', [1180, 40],
  '=https://api.themoviedb.org/3/movie/{{ $json.results && $json.results[0] ? $json.results[0].id : 0 }}/images',
  []);
hubung('Cari film', 'Still film');

// Backdrop tidak punya keterangan isinya, jadi still yang jatuh ke slide "Sadie Sink
// sebagai Jean Grey" bisa saja adegan Punisher — dan itu benar-benar terjadi di render
// uji. Daftar pemain menutupnya: TMDB membawa nama asli DAN nama karakter, jadi slide
// yang menyebut salah satunya bisa memakai foto orangnya.
tmdb('Pemain film', [1320, 40],
  '=https://api.themoviedb.org/3/movie/{{ $(\'Cari film\').first().json.results && $(\'Cari film\').first().json.results[0] ? $(\'Cari film\').first().json.results[0].id : 0 }}/credits',
  []);
hubung('Still film', 'Pemain film');

// Backdrop TMDB tidak membawa keterangan siapa yang ada di dalamnya — itu satu-satunya
// alasan slide "Sadie Sink sebagai Jean Grey" pernah dapat adegan Punisher, lalu setelah
// ditambal daftar pemain dapat potret publisitas alih-alih adegan filmnya. Keterangan itu
// dibaca dari gambarnya sendiri: kandidat diunduh di sini, dikirim barengan ke Gemini,
// dan modelnya menyebut tokoh mana yang terlihat di tiap gambar.
N('Siapkan kandidat', 'n8n-nodes-base.code', 2, [1400, 40], {
  jsCode: baca('siapkan-kandidat.js'),
});
hubung('Pemain film', 'Siapkan kandidat');

// Dipanggil lewat HTTP biasa, bukan node Gemini: yang dikirim SEPULUH gambar dalam satu
// `contents`, dan node Gemini bawaan cuma melayani satu gambar per item.
// Artikel bukan film sampai di sini dengan `body: null` -> dibalas 400 -> diteruskan
// onError. Nol token terbakar, dan itu jalur 45 dari 46 artikel.
N('Terangkan still', 'n8n-nodes-base.httpRequest', 4.2, [1540, 40], {
  method: 'POST',
  url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'googlePalmApi',
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.body) }}',
  options: { timeout: 120000 },
}, {
  credentials: GEMINI_CRED,
  onError: 'continueRegularOutput',
  alwaysOutputData: true,
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 3000,
});
hubung('Siapkan kandidat', 'Terangkan still');

// Membaca `Gemini copy` lewat nama node, bukan $input: node-node TMDB di atas menyisip
// di antaranya, dan seluruh workflow ini memang membaca lewat nama supaya penyisipan
// seperti itu tidak diam-diam mengganti sumber datanya.
N('Pecah slide', 'n8n-nodes-base.code', 2, [1260, 460], { jsCode: baca('pecah-slide.js') });
hubung('Terangkan still', 'Pecah slide');

N('Gemini gambar', '@n8n/n8n-nodes-langchain.googleGemini', 1, [1480, 460], {
  resource: 'image',
  // gemini-3-pro-image-preview membalas "The service is receiving too many requests
  // from you" untuk KELIMA slide, berhari-hari berturut-turut — kuota preview-nya
  // memang kecil. Kuota di Gemini dihitung per model, jadi pindah model adalah
  // perbaikan satu baris; `-image` yang stabil punya jatah jauh lebih besar.
  modelId: { __rl: true, value: 'models/gemini-2.5-flash-image', mode: 'id' },
  prompt: '={{ $json.image_prompt }}',
  options: {},
}, {
  credentials: GEMINI_CRED,
  // onError:continueRegularOutput menangkap kegagalan PER ITEM — node-nya sendiri tidak
  // pernah dianggap gagal, jadi retryOnFail praktis tidak pernah kepakai di sini. Itu
  // terbukti di eksekusi 4212: kelima item membawa `{"error": "…too many requests…"}`
  // sementara node-nya tercatat 1 run tanpa error. Dibiarkan karena menghapus onError
  // berarti satu gambar gagal mematikan seluruh carousel; yang tidak boleh adalah
  // mengira retry ini yang menjaga kuota.
  retryOnFail: true,
  maxTries: 5,
  waitBetweenTries: 5000,
  onError: 'continueRegularOutput',
});
// Gambar digenerate untuk SEMUA slide, termasuk artikel yang punya foto sendiri.
// Sempat ada gerbang yang melewati cabang ini kalau cover ada — hemat kuota, tapi
// hasilnya satu foto yang sama di kelima slide, dan seberapa pun cropnya digeser itu
// terbaca sebagai satu gambar diulang lima kali. Slide 2+ punya teksnya sendiri, jadi
// gambarnya juga harus dibuat dari teks itu. Foto artikel tetap dipakai di slide 1 dan
// jadi jaring pengaman slide 2+ di `Rakit slide`.
// Gerbang per ARTIKEL, bukan per slide — dan itu yang menjaganya sederhana. Dua cabang
// bertemu lagi di `Jadi JPEG`, jadi `Slide base64` dan `rakit-slide.js` tidak peduli
// gambarnya datang dari mana; dua-duanya cuma melihat binary.
//
// `pakai_foto` nilainya sama di kelima item, jadi IF yang dievaluasi per item tetap
// mengirim kelimanya ke cabang yang sama. Tanpa itu, item bisa terbelah dua cabang dan
// pasangan indeks slide↔gambar hancur.
N('Ada foto asli?', 'n8n-nodes-base.if', 2.2, [1370, 460], {
  conditions: kondisi('={{ $json.pakai_foto ? 1 : 0 }}', { type: 'number', operation: 'equals' }, 1),
  options: {},
});
hubung('Pecah slide', 'Ada foto asli?');

// Diunduh di n8n, BUKAN ditaruh sebagai URL di HTML. render-svc memakai
// waitUntil:'networkidle0' dan node `Render` cuma punya 60 detik untuk kelima slide —
// lima URL luar yang lambat bisa menghabiskannya dan memicu loop retry 8 ronde. Lebih
// penting lagi: URL mati di sini terlihat sebagai item tanpa binary, bukan gambar rusak
// yang diam seperti bug `filesystem-v2`.
N('Ambil foto', 'n8n-nodes-base.httpRequest', 4.2, [1480, 300], {
  url: '={{ $json.foto_url }}',
  options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
}, { onError: 'continueRegularOutput' });
hubung('Ada foto asli?', 'Ambil foto', 0);
hubung('Ada foto asli?', 'Gemini gambar', 1);
hubung('Ambil foto', 'Jadi JPEG');

// PNG mentah dari Gemini ~2 MB/slide; base64 lima slide menembus batas body 8 MB
// render-svc dan gagal 413. Konversi ke JPEG di sini yang mencegahnya.
N('Jadi JPEG', 'n8n-nodes-base.editImage', 1, [1700, 460], {
  operation: 'resize',
  width: 1080,
  height: 1350,
  resizeOption: 'onlyIfLarger',
  options: { format: 'jpeg', quality: 85 },
}, { onError: 'continueRegularOutput' });
hubung('Gemini gambar', 'Jadi JPEG');

// Sama seperti `Cover base64`: tanpa ini `Rakit slide` memasang string "filesystem-v2"
// sebagai isi gambar. Slide yang gambarnya gagal masuk ke sini tanpa binary dan keluar
// dengan `b64: null` — jumlah item tetap 5, dan itu yang menjaga pasangan per-indeks.
N('Slide base64', 'n8n-nodes-base.code', 2, [1810, 620], KE_B64);
hubung('Jadi JPEG', 'Slide base64');

// Logo disisipkan saat build sebagai data URI, bukan URL: render-svc memakai
// waitUntil:'networkidle0', jadi satu URL lambat menggantung render 30 detik.
// Varian 192 dipilih, bukan 512 — tampil di 112px jadi 192 sudah 1,7x, sementara
// 512 menambah ~568 KB base64 per carousel dibanding ~101 KB.
N('Rakit slide', 'n8n-nodes-base.code', 2, [1920, 460], {
  jsCode: baca('rakit-slide.js').replace('{{LOGO}}', dataUri('icons/icon-192.png', 'image/png')),
});
hubung('Slide base64', 'Rakit slide');

N('Render', 'n8n-nodes-base.httpRequest', 4.2, [2140, 460], http({
  method: 'POST',
  url: `={{ ${K('render_url')} }}/render`,
  sendHeaders: true,
  headerParameters: { parameters: [bearer(`{{ ${K('render_token')} }}`)] },
  sendBody: true,
  specifyBody: 'json',
  // Hero ikut menumpang panggilan yang sama, cuma kalau artikelnya tidak punya gambar.
  // 1200x630 melayani og:image dan gambar tunggal LinkedIn sekaligus; slide tetap
  // 1080x1350 karena tidak mengirim w/h.
  jsonBody:
    "={{ JSON.stringify({ brand: 'portofolio', code: $json.code, caption: $json.ig_caption, " +
    "images: $json.slides.map((h, i) => ({ name: String(i + 1).padStart(2, '0'), html: h }))" +
    ".concat($json.hero ? [{ name: 'hero', html: $json.hero, w: 1200, h: 630 }] : []) }) }}",
  options: { timeout: 60000 },
}), { onError: 'continueErrorOutput' });
hubung('Rakit slide', 'Render');

// ── commit balik: gambar hasil generate jadi milik repo, bukan cuma milik database
// Dijalankan sejajar dengan `Kirim preview`, bukan setelah approval: gambar artikel
// milik website dan tidak ada hubungannya dengan setuju/tidaknya posting ke sosmed.
//
// Commit ini SENGAJA memicu Action lagi — itu yang membuat website mendapat gambarnya,
// lewat jalur publish yang sama seperti biasa, tanpa node publish tambahan. Loop-nya
// berhenti sendiri: `classifyDiff` hanya menghitung status "A" sebagai artikel baru,
// dan .md hasil commit ini berstatus "M", jadi `new_folders` kosong dan cabang sosmed
// tidak jalan dua kali.
//
// SEMUA node di cabang ini memakai onError:continueRegularOutput. Cabang ini berjalan
// berdampingan dengan approval yang menunggu sampai 48 jam; kegagalan di sini tidak
// boleh menjatuhkan eksekusi yang sedang menahan artikel orang.
const GH = () => [
  bearer(`{{ ${K('github_token')} }}`),
  { name: 'Accept', value: 'application/vnd.github+json' },
  { name: 'X-GitHub-Api-Version', value: '2022-11-28' },
];

N('Susun commit', 'n8n-nodes-base.code', 2, [2360, 660], { jsCode: baca('susun-commit.js') });
hubung('Render', 'Susun commit', 0);

N('Ambil hero', 'n8n-nodes-base.httpRequest', 4.2, [2580, 660], {
  url: '={{ $json.sumber }}',
  options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
}, { onError: 'continueRegularOutput' });
hubung('Susun commit', 'Ambil hero');

// Berkas baru, jadi tanpa `sha`. Kalau hero.jpg sudah ada, GitHub membalas 422
// "already exists" — dan itu ditangani sebagai sukses di `Pecah md`, karena URL-nya
// tetap benar dan yang penting bagi markdown cuma berkasnya ada.
N('Simpan gambar', 'n8n-nodes-base.httpRequest', 4.2, [2800, 660], http({
  method: 'PUT',
  url: `=https://api.github.com/repos/{{ $('Susun commit').first().json.repo }}/contents/{{ $('Susun commit').first().json.path_gambar }}`,
  sendHeaders: true,
  headerParameters: { parameters: GH() },
  sendBody: true,
  specifyBody: 'json',
  jsonBody:
    "={{ JSON.stringify({ message: 'chore: gambar otomatis untuk ' + $('Susun commit').first().json.folder, " +
    'content: $binary.data.data }) }}',
}), { onError: 'continueRegularOutput' });
hubung('Ambil hero', 'Simpan gambar');

N('Pecah md', 'n8n-nodes-base.code', 2, [3020, 660], { jsCode: baca('pecah-md.js') });
hubung('Simpan gambar', 'Pecah md');

N('Ambil md', 'n8n-nodes-base.httpRequest', 4.2, [3240, 660], http({
  url: "=https://api.github.com/repos/{{ $json.repo }}/contents/{{ $json.path }}",
  sendHeaders: true,
  headerParameters: { parameters: GH() },
}), { onError: 'continueRegularOutput' });
hubung('Pecah md', 'Ambil md');

N('Sisip gambar', 'n8n-nodes-base.code', 2, [3460, 660], { jsCode: baca('sisip-gambar.js') });
hubung('Ambil md', 'Sisip gambar');

N('Simpan md', 'n8n-nodes-base.httpRequest', 4.2, [3680, 660], http({
  method: 'PUT',
  url: `=https://api.github.com/repos/{{ $('Susun commit').first().json.repo }}/contents/{{ $json.path }}`,
  sendHeaders: true,
  headerParameters: { parameters: GH() },
  sendBody: true,
  specifyBody: 'json',
  jsonBody:
    "={{ JSON.stringify({ message: 'chore: sisipkan gambar otomatis ke ' + $json.path, " +
    'content: $json.isi_b64, sha: $json.sha }) }}',
}), { onError: 'continueRegularOutput' });
hubung('Sisip gambar', 'Simpan md');

N('Lapor commit', 'n8n-nodes-base.gmail', 2.2, [3900, 660], gmail(
  "=[Portofolio] Gambar otomatis: {{ $('Susun commit').first().json.folder }}",
  '=<p>Artikel ini tidak punya gambar, jadi latar slide 1 dipromosikan jadi gambar artikel ' +
    'dan di-commit balik ke repo.</p>' +
    "<p><img src=\"{{ $('Susun commit').first().json.url_gambar }}\" style=\"max-width:480px\"></p>" +
    '<pre style="white-space:pre-wrap">{{ JSON.stringify($input.all().map(i => i.json), null, 2).slice(0, 1200) }}</pre>' +
    '<p>Commit ini memicu Action sekali lagi; itu yang memasang gambarnya di website. ' +
    'Cabang sosmed <b>tidak</b> jalan dua kali — berkas .md-nya berstatus M, bukan A.</p>'
), { credentials: GMAIL_CRED });
hubung('Simpan md', 'Lapor commit');

// ─────────────────────────────────────────────── 4. approval
N('Kirim preview', 'n8n-nodes-base.gmail', 2.2, [2360, 360], gmail(
  "=[Portofolio] Siap posting: {{ $('Siapkan brief').first().json.folder }}",
  baca('email-preview.html')
), { credentials: GMAIL_CRED });
hubung('Render', 'Kirim preview', 0);

// Loop retry: balik ke `Rakit slide`, BUKAN ke `Gemini gambar`. Penyebab 422 adalah
// teks yang meluber, bukan gambarnya — regenerasi lima gambar tiap ronde cuma bakar
// kuota. `Rakit slide` memperkecil font dan memangkas kata tiap ronde, jadi tiap
// percobaan mengirim input yang benar-benar berbeda dan loop-nya bisa konvergen.
N('Coba render lagi?', 'n8n-nodes-base.if', 2.2, [2360, 660], {
  conditions: kondisi('={{ $runIndex }}', { type: 'number', operation: 'lt' }, 8),
  options: {},
});
hubung('Render', 'Coba render lagi?', 1);
hubung('Coba render lagi?', 'Rakit slide', 0);

N('Lapor render gagal', 'n8n-nodes-base.gmail', 2.2, [2140, 860], gmail(
  "=[Portofolio] RENDER GAGAL 8x: {{ $('Siapkan brief').first().json.folder }}",
  '=<p>Artikel sudah tayang di website, tapi carousel gagal dirender <b>8 kali berturut-turut</b> ' +
    '— tidak ada yang diposting ke sosmed.</p>' +
    '<pre style="white-space:pre-wrap">{{ JSON.stringify($json, null, 2).slice(0, 2000) }}</pre>' +
    '<p>Tiap ronde font sudah diperkecil sampai 70% dan kata dipangkas. Kalau tetap ' +
    '"overflow", berarti ada yang salah di template Code node "Rakit slide", bukan di isinya. ' +
    'Kalau errornya bukan 422, cek render-svc: <code>GET /health</code>.</p>'
), { credentials: GMAIL_CRED });
hubung('Coba render lagi?', 'Lapor render gagal', 1);

N('Tunggu approval', 'n8n-nodes-base.wait', 1.1, [2580, 360], {
  resume: 'webhook',
  limitWaitTime: true,
  limitType: 'afterTimeInterval',
  resumeAmount: 48,
  resumeUnit: 'hours',
  options: {},
}, { webhookId: 'b1f0c2d4-7a55-4e18-9c3b-2d6e8f4a1c07' });
hubung('Kirim preview', 'Tunggu approval');

N('Approve?', 'n8n-nodes-base.if', 2.2, [2800, 360], {
  conditions: kondisi('={{ $json.query.action }}', { type: 'string', operation: 'equals' }, 'approve'),
  options: {},
});
hubung('Tunggu approval', 'Approve?');

N('Lapor dilewati', 'n8n-nodes-base.gmail', 2.2, [3020, 660], gmail(
  "=[Portofolio] Dilewati: {{ $('Rakit slide').first().json.folder }}",
  '=<p>Tidak diposting ke sosmed. Artikelnya tetap tayang di website.</p>' +
    '<p>Slide sudah terlanjur dirender dan masih tersimpan: ' +
    '<a href="{{ $(\'Render\').first().json.previewUrl }}">{{ $(\'Render\').first().json.previewUrl }}</a></p>'
), { credentials: GMAIL_CRED });
hubung('Approve?', 'Lapor dilewati', 1);

// ─────────────────────────────────────────────── 5a. LinkedIn (profil pribadi)
N('LinkedIn init upload', 'n8n-nodes-base.httpRequest', 4.2, [3020, 180], http({
  method: 'POST',
  url: 'https://api.linkedin.com/rest/images?action=initializeUpload',
  sendHeaders: true,
  headerParameters: { parameters: LI_HEADERS() },
  sendBody: true,
  specifyBody: 'json',
  // Profil pribadi: owner adalah urn:li:person:<sub>, bukan urn:li:organization.
  jsonBody: `={{ JSON.stringify({ initializeUploadRequest: { owner: ${K('linkedin_urn')} } }) }}`,
}), { onError: 'continueRegularOutput' });
hubung('Approve?', 'LinkedIn init upload', 0);

// LinkedIn mem-posting gambar artikel, bukan slide ber-teks — sama dengan yang tampil
// sebagai thumbnail di website, jadi satu artikel punya satu wajah di semua tempat.
// Urutannya: cover artikel, kalau tidak ada pakai hero hasil generate, dan kalau
// dua-duanya tidak ada baru jatuh ke slide 01 seperti perilaku lama.
//
// Node ini tidak bisa dihapus walau `Ambil cover` sudah mengunduh gambar yang sama:
// `LinkedIn upload` membaca binary dari ITEM MASUKANNYA, dan tidak ada ekspresi n8n
// yang bisa menarik binary dari node lain.
N('Ambil gambar LinkedIn', 'n8n-nodes-base.httpRequest', 4.2, [3240, 180], {
  url:
    "={{ $('Siapkan brief').first().json.cover " +
    "|| $('Render').first().json.urls.find(u => u.includes('/hero.jpg')) " +
    "|| $('Render').first().json.urls[0] }}",
  options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
}, { onError: 'continueRegularOutput' });
hubung('LinkedIn init upload', 'Ambil gambar LinkedIn');

N('LinkedIn upload', 'n8n-nodes-base.httpRequest', 4.2, [3460, 180], http({
  method: 'PUT',
  url: "={{ $('LinkedIn init upload').item.json.value.uploadUrl }}",
  sendHeaders: true,
  headerParameters: { parameters: [bearer(`{{ ${K('linkedin_token')} }}`)] },
  sendBody: true,
  contentType: 'binaryData',
  inputDataFieldName: 'data',
}), { onError: 'continueRegularOutput' });
hubung('Ambil gambar LinkedIn', 'LinkedIn upload');

N('LinkedIn post', 'n8n-nodes-base.httpRequest', 4.2, [3680, 180], http({
  method: 'POST',
  url: 'https://api.linkedin.com/rest/posts',
  sendHeaders: true,
  headerParameters: { parameters: LI_HEADERS() },
  sendBody: true,
  specifyBody: 'json',
  jsonBody:
    `={{ JSON.stringify({ author: ${K('linkedin_urn')}, ` +
    "commentary: $('Rakit slide').first().json.linkedin_caption, visibility: 'PUBLIC', " +
    "distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, " +
    "content: { media: { id: $('LinkedIn init upload').first().json.value.image } }, " +
    "lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }) }}",
}), { onError: 'continueRegularOutput' });
hubung('LinkedIn upload', 'LinkedIn post');

// ─────────────────────────────────────────────── 5b. Instagram carousel
N('Pecah URL slide', 'n8n-nodes-base.code', 2, [3020, 460], { jsCode: baca('pecah-url.js') });
hubung('Approve?', 'Pecah URL slide', 0);

// Host-nya graph.INSTAGRAM.com, bukan graph.facebook.com seperti workflow aslinya.
// Meta punya dua jalur Instagram API yang tidak saling kompatibel: "login Facebook"
// (butuh Halaman FB, host graph.facebook.com) dan "login Instagram" (tanpa Halaman FB,
// host graph.instagram.com). Token dari satu jalur dibalas 190 di host jalur lain.
// Kita pakai jalur login Instagram — lihat docs/credentials-instagram.md.
//
// Caption dan children dikirim sebagai form body, bukan query string seperti workflow
// aslinya: caption kita berisi baris baru, emoji, dan URL — encoding query string
// gagalnya cuma sesekali, dan itu jenis bug yang paling susah dilacak.
/**
 * Coba ulang otomatis untuk SETIAP panggilan Meta di cabang Instagram dan Facebook.
 *
 * Gagalnya cabang ini hampir selalu sesaat: rate limit, 5xx, atau gambar yang belum
 * sempat diambil Meta. Yang selama ini menyembuhkannya adalah menjalankan ulang dengan
 * tangan — dan itu persis pekerjaan yang `retryOnFail` lakukan sendiri.
 *
 * 5 percobaan x 5 detik = sampai 20 detik menunggu per node, cuma kalau memang gagal.
 * Itu batas atas n8n; tidak ada nilai yang lebih besar untuk dipilih.
 *
 * Tetap menggigit walau node-nya `onError: continueRegularOutput` — diuji langsung ke
 * instance (2026-08-14) dengan node yang sengaja diarahkan ke URL 404: satu eksekusi
 * memakan 4,2 detik untuk maxTries 3 x 2 detik, jadi jedanya benar-benar terjadi.
 * Mesin n8n mencoba ulang DULU, `onError` baru berlaku setelah percobaan habis.
 *
 * Dipasang per node, bukan sebagai putaran balik ke kepala cabang: id container IG dan
 * `media_fbid` yang sudah jadi tetap sah, jadi mengulang dari depan tidak membeli apa
 * pun — dan di Facebook dia MENINGGALKAN JEJAK, karena tiap unggahan `published=false`
 * yang tidak terpakai menumpuk di Halaman sebagai foto yatim.
 */
const ULANG = { retryOnFail: true, maxTries: 5, waitBetweenTries: 5000 };

const igBody = (params) => http({
  method: 'POST',
  url: `=https://graph.instagram.com/v23.0/{{ ${K('ig_user_id')} }}/media`,
  sendBody: true,
  contentType: 'form-urlencoded',
  bodyParameters: { parameters: params },
});

N('IG item container', 'n8n-nodes-base.httpRequest', 4.2, [3240, 460], igBody([
  { name: 'image_url', value: '={{ $json.url }}' },
  { name: 'is_carousel_item', value: 'true' },
  { name: 'access_token', value: `={{ ${K('ig_token')} }}` },
]), { onError: 'continueRegularOutput', ...ULANG });
hubung('Pecah URL slide', 'IG item container');

N('Kumpulkan children', 'n8n-nodes-base.code', 2, [3460, 460], { jsCode: baca('kumpulkan-children.js') });
hubung('IG item container', 'Kumpulkan children');

N('IG carousel container', 'n8n-nodes-base.httpRequest', 4.2, [3680, 460], igBody([
  { name: 'media_type', value: 'CAROUSEL' },
  { name: 'children', value: '={{ $json.children }}' },
  { name: 'caption', value: "={{ $('Rakit slide').first().json.ig_caption }}" },
  { name: 'access_token', value: `={{ ${K('ig_token')} }}` },
]), { onError: 'continueRegularOutput', ...ULANG });
hubung('Kumpulkan children', 'IG carousel container');

// Jeda yang dipandu status_code, bukan Wait node berdurasi tebakan: yang ditunggu adalah
// Instagram selesai mengunduh gambar dari render-svc, dan lamanya tidak tetap.
N('Tunggu IG matang', 'n8n-nodes-base.code', 2, [3900, 460], {
  jsCode: baca('tunggu-ig-matang.js'),
});
hubung('IG carousel container', 'Tunggu IG matang');

N('IG publish', 'n8n-nodes-base.httpRequest', 4.2, [4120, 460], http({
  method: 'POST',
  url: `=https://graph.instagram.com/v23.0/{{ ${K('ig_user_id')} }}/media_publish`,
  sendBody: true,
  contentType: 'form-urlencoded',
  bodyParameters: {
    parameters: [
      { name: 'creation_id', value: '={{ $json.id }}' },
      { name: 'access_token', value: `={{ ${K('ig_token')} }}` },
    ],
  },
}), { onError: 'continueRegularOutput', ...ULANG });
hubung('Tunggu IG matang', 'IG publish');

N('IG permalink', 'n8n-nodes-base.httpRequest', 4.2, [4340, 460], http({
  url: '=https://graph.instagram.com/v23.0/{{ $json.id }}',
  sendQuery: true,
  queryParameters: {
    parameters: [
      { name: 'fields', value: 'permalink' },
      { name: 'access_token', value: `={{ ${K('ig_token')} }}` },
    ],
  },
}), { onError: 'continueRegularOutput', ...ULANG });
hubung('IG publish', 'IG permalink');

// ─────────────────────────────────────────────── 5c. carousel Facebook
// Halaman, bukan profil pribadi. Host graph.FACEBOOK.com dengan token Halaman —
// kebalikan dari Instagram di atas yang memakai graph.instagram.com dengan token IG.
// Tertukar dibalas #190, dan pesannya tidak menyebut host sama sekali.
//
// `Pecah URL slide` dipakai ulang, tidak dikembarkan: slide yang diposting ke
// Facebook harus persis slide yang sama dengan Instagram.
const fbNonaktif = FB_AKTIF ? {} : { disabled: true };

N('FB unggah foto', 'n8n-nodes-base.httpRequest', 4.2, [3240, 700], http({
  method: 'POST',
  url: `=https://graph.facebook.com/v25.0/{{ ${K('fb_page_id')} }}/photos`,
  sendBody: true,
  contentType: 'form-urlencoded',
  bodyParameters: {
    parameters: [
      { name: 'url', value: '={{ $json.url }}' },
      // WAJIB. Tanpa ini tiap slide jadi post sendiri dan satu artikel membanjiri
      // Halaman dengan 5 post, bukan satu post 5 foto.
      { name: 'published', value: 'false' },
      { name: 'access_token', value: `={{ ${K('fb_page_token')} }}` },
    ],
  },
}), { onError: 'continueRegularOutput', ...ULANG, ...fbNonaktif });
if (FB_AKTIF) hubung('Pecah URL slide', 'FB unggah foto');

N('Kumpulkan foto FB', 'n8n-nodes-base.code', 2, [3460, 700], {
  jsCode: baca('kumpulkan-foto-fb.js'),
}, fbNonaktif);
if (FB_AKTIF) hubung('FB unggah foto', 'Kumpulkan foto FB');

// Keypair biasa, TIGA field tetap — sama seperti `FB unggah foto` dan `IG carousel
// container`, dua node yang memang sudah terbukti jalan.
//
// Sebelumnya `specifyBody:'json'` di atas `contentType:'form-urlencoded'`, dan itu
// kombinasi yang TIDAK didukung n8n: `jsonBody` cuma hidup di bawah contentType 'json',
// jadi node-nya membalas "JSON parameter needs to be valid JSON" dan Facebook tidak
// pernah sekali pun kebagian post. n8n sendiri menandainya dengan segitiga merah di
// dropdown-nya; yang menyembunyikannya berminggu-minggu adalah onError di bawah — cabang
// FB gagal diam-diam sementara LinkedIn dan Instagram lanjut.
//
// Yang membuat keypair bisa dipakai sekarang: `attached_media` jadi SATU field berisi
// array JSON, bukan `attached_media[0..n]` yang jumlah kuncinya ikut jumlah slide.
// Alasannya di kumpulkan-foto-fb.js.
N('FB posting', 'n8n-nodes-base.httpRequest', 4.2, [3680, 700], http({
  method: 'POST',
  url: `=https://graph.facebook.com/v25.0/{{ ${K('fb_page_id')} }}/feed`,
  sendBody: true,
  contentType: 'form-urlencoded',
  bodyParameters: {
    parameters: [
      { name: 'message', value: "={{ $('Rakit slide').first().json.fb_caption }}" },
      { name: 'attached_media', value: '={{ $json.attached_media }}' },
      { name: 'access_token', value: `={{ ${K('fb_page_token')} }}` },
    ],
  },
}), { onError: 'continueRegularOutput', ...ULANG, ...fbNonaktif });
if (FB_AKTIF) hubung('Kumpulkan foto FB', 'FB posting');

// ─────────────────────────────────────────────── 6. lapor
// Barrier: e-mail hasil baru dikirim setelah semua cabang selesai, supaya isinya
// tidak melaporkan LinkedIn saja padahal Instagram masih jalan.
N(`Tunggu ${FB_AKTIF ? 3 : 2} cabang`, 'n8n-nodes-base.merge', 3, [4340, 320], {
  mode: 'chooseBranch',
  numberInputs: FB_AKTIF ? 3 : 2,
  useDataOfInput: 1,
  options: {},
});
const barrier = `Tunggu ${FB_AKTIF ? 3 : 2} cabang`;
hubung('LinkedIn post', barrier, 0, 'main', 0);
hubung('IG permalink', barrier, 0, 'main', 1);
if (FB_AKTIF) hubung('FB posting', barrier, 0, 'main', 2);

/**
 * Subject ikut menyebut kalau ada platform yang GAGAL.
 *
 * Dulu selalu "Terbit:", dan itu yang menyembunyikan cabang Facebook yang mati sejak node
 * `FB posting` pertama dibuat: statusnya memang selalu ada di badan e-mail, lengkap dengan
 * pesan errornya — tapi tidak ada yang membuka e-mail yang subject-nya bilang sudah
 * terbit. Gagalnya baru ketahuan waktu Halaman-nya dilihat sendiri dan ternyata kosong.
 *
 * Cabang yang sengaja dimatikan tidak dihitung gagal: `isExecuted` false berarti node-nya
 * memang tidak dijalankan, bukan dijalankan lalu meleset.
 */
const SEMUA_TERBIT =
  "$('LinkedIn post').first().json.id && " +
  "$('IG permalink').first().json.permalink && " +
  "(!$('FB posting').isExecuted || $('FB posting').first().json.id)";

N('Email hasil', 'n8n-nodes-base.gmail', 2.2, [4560, 320], gmail(
  `=[Portofolio] {{ ${SEMUA_TERBIT} ? 'Terbit' : 'SEBAGIAN GAGAL' }}: ` +
    "{{ $('Rakit slide').first().json.folder }}",
  baca('email-hasil.html')
), { credentials: GMAIL_CRED });
hubung(barrier, 'Email hasil');

// ───────────────────────────────────────────────
const bungkus = (name) => ({
  name,
  nodes,
  connections: conn,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: {
    templateCredsSetupCompleted: true,
    instanceId: 'f2a4228fc7039c0f0d943b69f0bc71caf753a0f2af9f4141781bcfa693f87ee3',
  },
});
const wf = bungkus('Portofolio Publish');

// ═══════════════════════════════════════════════ varian: kirim ulang tanpa LinkedIn
// Untuk artikel yang sudah terlanjur ada di LinkedIn tapi belum di Instagram/Facebook.
// `Approve?` bercabang ke semua platform tanpa syarat, jadi kirim ulang lewat workflow
// normal berarti LinkedIn kena dua kali.
//
// DITURUNKAN, bukan disalin. Berkas kedua yang dirawat tangan pasti melenceng dari yang
// pertama, dan melencengnya baru ketahuan waktu postingan salah sudah tayang.
//
// `path` webhook DIBEDAKAN: `portofolio` untuk yang normal, `portofolio-ulang` untuk yang
// ini. Itu yang membuat KEDUANYA bisa aktif bersamaan, dan `publish.js` yang memilih
// tujuan — folder baru ke path normal, `[repost:]` ke path ulang.
//
// Sebelumnya path-nya sengaja disamakan supaya cuma satu boleh aktif dan Action tidak
// perlu tahu bedanya. Itu berarti "artikel baru ke semua sosmed" dan "artikel lama ke
// Instagram + Facebook saja" tidak pernah bisa berlaku bersamaan, dan yang menentukan
// cuma saklar aktif di n8n — saklar yang ternyata bisa bergeser sendiri waktu workflow-nya
// di-deploy ulang, tanpa satu pun tanda. Sekali bergeser, artikel berikutnya diam-diam
// tidak naik ke LinkedIn, atau artikel lama diam-diam naik ke LinkedIn untuk kedua kali.
//
// `webhookId` ikut dibedakan. Dua workflow aktif dengan webhookId sama membuat n8n
// mendaftarkan webhook yang sama dua kali.
const LINKEDIN = ['LinkedIn init upload', 'Ambil gambar LinkedIn', 'LinkedIn upload', 'LinkedIn post'];

/** Semua sambungan main yang masuk ke `ke`, sebagai referensi hidup ke w.connections. */
const masukKe = (w, ke) =>
  Object.values(w.connections).flatMap((tipe) =>
    (tipe.main || []).flat().filter((c) => c.node === ke)
  );

/** Ganti nama node beserta semua rujukan ke dia di connections. */
const ganti = (w, lama, baru) => {
  const n = w.nodes.find((x) => x.name === lama);
  n.name = baru;
  n.id = baru;
  if (w.connections[lama]) {
    w.connections[baru] = w.connections[lama];
    delete w.connections[lama];
  }
  for (const c of masukKe(w, lama)) c.node = baru;
};

/**
 * Ubah teks, lalu PASTIKAN benar-benar berubah. Template HTML-nya berkembang terus;
 * pencocokan yang diam-diam meleset menghasilkan workflow yang barisnya masih merujuk
 * node LinkedIn yang sudah tidak ada — dan yang hilang bukan satu baris, tapi seluruh
 * e-mail. Lebih baik build-nya gagal di sini.
 */
const wajibUbah = (teks, ubah, keterangan) => {
  const hasil = ubah(teks);
  if (hasil === teks) throw new Error(`tanpaLinkedIn: ${keterangan} tidak cocok apa pun`);
  return hasil;
};
const buangBaris = (teks, pola) => teks.split('\n').filter((b) => !pola.test(b)).join('\n');

const tanpaLinkedIn = (sumber, nama) => {
  const w = structuredClone(sumber);
  w.name = nama;
  const buang = new Set(LINKEDIN);

  w.nodes = w.nodes.filter((n) => !buang.has(n.name));
  for (const n of buang) delete w.connections[n];
  for (const tipe of Object.values(w.connections)) {
    for (const [t, grup] of Object.entries(tipe)) {
      tipe[t] = grup.map((cabang) => cabang.filter((c) => !buang.has(c.node)));
    }
  }

  // Node Merge menunggu SEMUA input yang tersambung. Membuang cabang pertama menyisakan
  // input 0 yang tidak pernah terisi, dan `Email hasil` menggantung selamanya. Jadi
  // indeksnya dirapatkan, bukan sekadar jumlahnya dikurangi.
  const barrier = w.nodes.find((n) => n.type === 'n8n-nodes-base.merge');
  const masuk = masukKe(w, barrier.name).sort((a, b) => a.index - b.index);
  masuk.forEach((c, i) => { c.index = i; });
  barrier.parameters.numberInputs = masuk.length;
  ganti(w, barrier.name, `Tunggu ${masuk.length} cabang`);

  const node = (n) => w.nodes.find((x) => x.name === n);

  // Path DAN webhookId dibedakan — alasan lengkapnya di atas fungsi ini. Keduanya wajib:
  // path yang sama bikin n8n menolak workflow kedua diaktifkan, webhookId yang sama bikin
  // dia mendaftarkan webhook yang sama dua kali.
  const wh = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  wh.parameters.path = 'portofolio-ulang';
  wh.webhookId = '3c9d5f81-2a47-4e60-9b8d-7f1a2c3e4d55';

  node('Email hasil').parameters.message = wajibUbah(
    node('Email hasil').parameters.message,
    (t) => buangBaris(t, /<li>LinkedIn:/),
    'baris status LinkedIn di e-mail hasil'
  );
  // Subject juga memeriksa LinkedIn. Dibiarkan, dia merujuk node yang sudah dibuang dan
  // yang hilang bukan satu kata di subject tapi seluruh e-mail hasil.
  node('Email hasil').parameters.subject = wajibUbah(
    node('Email hasil').parameters.subject,
    (t) => t.replace("$('LinkedIn post').first().json.id && ", ''),
    'cek LinkedIn di subject e-mail hasil'
  );

  const pv = node('Kirim preview');
  pv.parameters.message = wajibUbah(
    pv.parameters.message,
    (t) => buangBaris(buangBaris(t, /LinkedIn \(EN\)/), /linkedin_caption/),
    'blok caption LinkedIn di e-mail preview'
  );
  pv.parameters.message = wajibUbah(
    pv.parameters.message,
    (t) => t.replace('posting ke LinkedIn + Instagram + Facebook', 'posting ke Instagram + Facebook'),
    'teks tombol Approve'
  );

  // Awalan di SETIAP e-mail, bukan cuma dua yang penting: kalau lupa mengaktifkan lagi
  // workflow normal, artikel berikutnya diam-diam tidak naik ke LinkedIn. Awalan ini
  // yang memberi tahu — di subject, sebelum tombol Approve diklik.
  for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.gmail')) {
    const s = n.parameters.subject;
    n.parameters.subject = s.startsWith('=') ? `=[ULANG] ${s.slice(1)}` : `[ULANG] ${s}`;
  }

  return w;
};

const wfUlang = tanpaLinkedIn(wf, 'Portofolio Ulang — Instagram + Facebook');

// ═══════════════════════════════════════════════ workflow 2: perpanjang token IG
// Terpisah dari workflow publish karena pemicunya beda: yang ini jadwal, bukan push.
// Token IG hidup 60 hari dan refresh memberi 60 hari lagi tiap dipanggil — tapi HANYA
// kalau hasilnya disimpan. Token lama tidak ikut diperpanjang oleh panggilan refresh;
// dia tetap mati di tanggalnya sendiri. Karena itu workflow ini menulis balik nilainya
// ke node Kredensial workflow publish lewat REST API n8n, bukan sekadar memanggil
// endpoint-nya lalu membuang hasilnya.
nodes = [];
conn = {};

const FIELD_REFRESH = [
  ['n8n_api_url', 'ISI_URL_N8N', 'https://workflow.daffathan-labs.my.id'],
  // Settings -> n8n API -> Create an API key. Kunci ini bisa mengubah SEMUA workflow,
  // jadi jangan pernah masuk ke file yang ter-commit.
  ['n8n_api_key', 'ISI_N8N_API_KEY', asli('n8n_api_key', 'ISI_N8N_API_KEY')],
  // ID workflow publish, terbaca di URL editornya: /workflow/<id>
  ['workflow_id', 'ISI_ID_WORKFLOW_PUBLISH', asli('workflow_id', 'ISI_ID_WORKFLOW_PUBLISH')],
  ['notify_email', 'ISI_EMAIL_TUJUAN', 'daffa.fathan9@gmail.com'],
];

// Tiap bulan, bukan tiap 55 hari: kalau satu eksekusi gagal (n8n mati, API key dicabut)
// masih tersisa satu bulan penuh untuk menyadarinya sebelum tokennya benar-benar mati.
N('Tiap bulan', 'n8n-nodes-base.scheduleTrigger', 1.2, [-720, 300], {
  rule: {
    interval: [{ field: 'months', triggerAtDayOfMonth: 1, triggerAtHour: 3, triggerAtMinute: 0 }],
  },
});

N('Kredensial', 'n8n-nodes-base.set', 3.4, [-500, 300], {
  assignments: {
    assignments: FIELD_REFRESH.map(([name, placeholder]) => ({
      id: name,
      name,
      value: placeholder,
      type: 'string',
    })),
  },
  includeOtherFields: true,
  options: {},
});
hubung('Tiap bulan', 'Kredensial');

const apiKey = () => ({ name: 'X-N8N-API-KEY', value: `={{ ${K('n8n_api_key')} }}` });

N('Ambil workflow', 'n8n-nodes-base.httpRequest', 4.2, [-280, 300], http({
  url: `={{ ${K('n8n_api_url')} }}/api/v1/workflows/{{ ${K('workflow_id')} }}`,
  sendHeaders: true,
  headerParameters: { parameters: [apiKey()] },
}), { onError: 'continueRegularOutput' });
hubung('Kredensial', 'Ambil workflow');

N('Ambil token lama', 'n8n-nodes-base.code', 2, [-60, 300], {
  jsCode: baca('ambil-token-lama.js'),
});
hubung('Ambil workflow', 'Ambil token lama');

// Diverifikasi 2026-08-12 dengan token asli: HTTP 200, access_token baru,
// expires_in 5168940 detik (60 hari). Endpoint ini khusus jalur login Instagram;
// token dari jalur login Facebook dibalas error di host ini.
N('Refresh token', 'n8n-nodes-base.httpRequest', 4.2, [160, 300], http({
  url: 'https://graph.instagram.com/refresh_access_token',
  sendQuery: true,
  queryParameters: {
    parameters: [
      { name: 'grant_type', value: 'ig_refresh_token' },
      { name: 'access_token', value: '={{ $json.token_lama }}' },
    ],
  },
}), { onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 });
hubung('Ambil token lama', 'Refresh token');

N('Susun workflow baru', 'n8n-nodes-base.code', 2, [380, 300], {
  jsCode: baca('susun-workflow-baru.js'),
});
hubung('Refresh token', 'Susun workflow baru');

N('Simpan workflow', 'n8n-nodes-base.httpRequest', 4.2, [600, 300], http({
  method: 'PUT',
  url: `={{ ${K('n8n_api_url')} }}/api/v1/workflows/{{ ${K('workflow_id')} }}`,
  sendHeaders: true,
  headerParameters: { parameters: [apiKey()] },
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.body) }}',
}), { onError: 'continueRegularOutput' });
hubung('Susun workflow baru', 'Simpan workflow');

N('Cek token', 'n8n-nodes-base.code', 2, [820, 300], { jsCode: baca('cek-token.js') });
hubung('Simpan workflow', 'Cek token');

// Satu e-mail untuk dua hasil, bukan dua cabang: yang membedakan cuma isinya, dan
// cabang kedua berarti satu jalur lagi yang tidak pernah diuji sampai hari dia dipakai.
N('Lapor token', 'n8n-nodes-base.gmail', 2.2, [1040, 300], gmail(
  "=[Portofolio] Token IG {{ $json.ok ? 'diperpanjang sampai ' + $json.kedaluwarsa : 'GAGAL diperpanjang' }}",
  '=<p>{{ $json.ok ? "Token Instagram sudah diperpanjang dan tersimpan di node Kredensial workflow publish." ' +
    ': "Perpanjangan token Instagram GAGAL. Selama belum diperbaiki, posting ke Instagram akan berhenti begitu token yang sekarang kedaluwarsa." }}</p>' +
    '<ul>' +
    '<li>Berlaku sampai <b>{{ $json.kedaluwarsa }}</b> ({{ $json.hari }} hari)</li>' +
    '<li>Token berubah dari <code>…{{ $json.ekor_lama }}</code> jadi <code>…{{ $json.ekor_baru }}</code></li>' +
    '</ul>' +
    '{{ $json.masalah.length ? "<p><b>Masalah:</b></p><ul><li>" + $json.masalah.join("</li><li>") + "</li></ul>" : "" }}' +
    '<p style="color:#666">LinkedIn tidak punya endpoint serupa — token itu tetap harus diganti tangan tiap 60 hari.</p>'
), { credentials: GMAIL_CRED });
hubung('Cek token', 'Lapor token');

const wfRefresh = bungkus('Portofolio — Perpanjang Token IG');

// ───────────────────────────────────────────────
// Dua keluaran dari sumber yang sama. Repo ini publik — token hidup di file yang
// ter-commit akan di-scrape bot dalam hitungan menit dan penerbitnya mencabutnya.
// Yang berbeda HANYA nilai di node Kredensial; struktur node-nya identik, jadi
// hasil edit di n8n tetap bisa di-diff terhadap versi ter-commit.
const tulis = (sumber, daftar, file, kolom) => {
  const salinan = structuredClone(sumber);
  const set = salinan.nodes.find((n) => n.name === 'Kredensial');
  set.parameters.assignments.assignments = daftar.map(([name, placeholder, nyata]) => ({
    id: name,
    name,
    value: kolom === 'nyata' ? nyata : placeholder,
    type: 'string',
  }));
  fs.writeFileSync(file, JSON.stringify(salinan, null, 2) + '\n', 'utf8');
  const kosong = set.parameters.assignments.assignments
    // [A-Z0-9_], bukan [A-Z_]: tanpa angka, placeholder seperti ISI_N8N_API_KEY tidak
    // dikenali sebagai placeholder dan hilang diam-diam dari daftar "masih perlu diisi"
    // — dan dari pemeriksaan rahasia di test yang memakai pola yang sama.
    .filter((a) => /^ISI_[A-Z0-9_]+$/.test(a.value))
    .map((a) => a.name);
  console.log(
    `${salinan.nodes.length} node -> ${file}\n` +
      (kosong.length ? `   masih perlu diisi: ${kosong.join(', ')}` : '   semua field terisi')
  );
};

const out = process.argv[2];
const keduanya = (sumber, daftar, file) => {
  tulis(sumber, daftar, file, 'placeholder');
  tulis(sumber, daftar, file.replace(/\.json$/, '.local.json'), 'nyata');
};

keduanya(wf, FIELD, out);
keduanya(wfUlang, FIELD, path.join(path.dirname(out), 'portofolio-ulang.json'));
keduanya(wfRefresh, FIELD_REFRESH, path.join(path.dirname(out), 'refresh-ig-token.json'));
