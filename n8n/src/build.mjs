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

const GEMINI_CRED = { googlePalmApi: { id: 'ISI_ID_CREDENTIAL_GEMINI', name: 'Gemini — Daffathan' } };
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

const nodes = [];
const conn = {};

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
  ['notify_email', 'ISI_EMAIL_TUJUAN', 'daffa.fathan9@gmail.com'],
];
const kondisi = (leftValue, operator, rightValue) => ({
  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
  conditions: [{ id: 'c1', leftValue, rightValue, operator }],
  combinator: 'and',
});

// ─────────────────────────────────────────────── 1. terima & publish ke website
N('Webhook', 'n8n-nodes-base.webhook', 2.1, [-720, 300], {
  httpMethod: 'POST',
  path: 'portofolio',
  // Membalas lewat node Respond, bukan langsung: GitHub Actions jadi tetap menerima
  // status asli publish website, sementara cabang sosmed berjalan setelahnya.
  responseMode: 'responseNode',
  // Webhook ini publik dan memicu penulisan ke website. Tanpa auth siapa pun bisa.
  authentication: 'headerAuth',
  options: {},
}, {
  webhookId: '7df7abbe-8eb6-43b7-9b47-5061592604aa',
  credentials: { httpHeaderAuth: { id: 'ISI_ID_CREDENTIAL_WEBHOOK', name: 'Portofolio webhook token' } },
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

// ─────────────────────────────────────────────── 3. caption + slide
N('Gemini copy', '@n8n/n8n-nodes-langchain.chainLlm', 1.7, [1040, 460], {
  promptType: 'define',
  // docs/voice.md adalah satu-satunya sumber voice; disisipkan di sini supaya tidak
  // pernah ada salinan kedua yang diam-diam berbeda.
  text: '=' + baca('prompt-copy.txt').replace('{{VOICE}}', bacaRoot('docs/voice.md')),
  hasOutputParser: true,
}, { retryOnFail: true, maxTries: 5, waitBetweenTries: 5000 });
hubung('Siapkan brief', 'Gemini copy');

N('Gemini Flash', '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', 1, [1000, 680], {
  modelName: 'models/gemini-3-flash-preview',
  options: {},
}, { credentials: GEMINI_CRED });
sub('Gemini Flash', 'Gemini copy', 'ai_languageModel');

N('Skema copy', '@n8n/n8n-nodes-langchain.outputParserStructured', 1.2, [1180, 680], {
  schemaType: 'manual',
  inputSchema: JSON.stringify({
    type: 'object',
    required: ['linkedin_caption', 'ig_caption', 'hashtags', 'slides', 'image_series'],
    properties: {
      linkedin_caption: { type: 'string', description: 'Bahasa Inggris, 120-200 kata, diakhiri URL EN' },
      ig_caption: { type: 'string', description: 'Bahasa Indonesia, 80-150 kata, diakhiri "Baca lengkapnya: <URL ID>"' },
      hashtags: { type: 'array', items: { type: 'string' }, description: 'maksimal 5 hashtag huruf kecil' },
      image_series: { type: 'string', description: 'Satu kalimat Inggris pengikat kelima gambar' },
      slides: {
        type: 'array',
        description: 'Tepat 5 slide: hook, 3 poin, CTA',
        items: {
          type: 'object',
          required: ['heading', 'body', 'image_prompt', 'image_mode'],
          properties: {
            heading: { type: 'string', description: 'Bahasa Indonesia, MAKSIMAL 8 kata' },
            body: { type: 'string', description: 'Bahasa Indonesia, MAKSIMAL 25 kata, boleh kosong di slide 1' },
            image_prompt: { type: 'string', description: 'Inggris, 1-2 kalimat, foto latar saja, dilarang ada teks di gambar' },
            image_mode: { type: 'string', enum: ['konseptual', 'tekstur', 'dokumenter', 'tempat', 'properti'] },
          },
        },
      },
    },
  }, null, 2),
});
sub('Skema copy', 'Gemini copy', 'ai_outputParser');

N('Pecah slide', 'n8n-nodes-base.code', 2, [1260, 460], { jsCode: baca('pecah-slide.js') });
hubung('Gemini copy', 'Pecah slide');

N('Gemini gambar', '@n8n/n8n-nodes-langchain.googleGemini', 1, [1480, 460], {
  resource: 'image',
  modelId: { __rl: true, value: 'models/gemini-3-pro-image-preview', mode: 'id' },
  prompt: '={{ $json.image_prompt }}',
  options: {},
}, {
  credentials: GEMINI_CRED,
  // 5 adalah maksimum maxTries n8n. Slide yang tetap gagal setelah itu tidak
  // menahan pipeline: `Rakit slide` meminjam latar tetangga, dan kalau nol gambar
  // pun slide-nya tetap terbit dengan latar polos.
  retryOnFail: true,
  maxTries: 5,
  waitBetweenTries: 5000,
  onError: 'continueRegularOutput',
});
hubung('Pecah slide', 'Gemini gambar');

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

// Logo disisipkan saat build sebagai data URI, bukan URL: render-svc memakai
// waitUntil:'networkidle0', jadi satu URL lambat menggantung render 30 detik.
// Varian 192 dipilih, bukan 512 — tampil di 112px jadi 192 sudah 1,7x, sementara
// 512 menambah ~568 KB base64 per carousel dibanding ~101 KB.
N('Rakit slide', 'n8n-nodes-base.code', 2, [1920, 460], {
  jsCode: baca('rakit-slide.js').replace('{{LOGO}}', dataUri('icons/icon-192.png', 'image/png')),
});
hubung('Jadi JPEG', 'Rakit slide');

N('Render', 'n8n-nodes-base.httpRequest', 4.2, [2140, 460], http({
  method: 'POST',
  url: `={{ ${K('render_url')} }}/render`,
  sendHeaders: true,
  headerParameters: { parameters: [bearer(`{{ ${K('render_token')} }}`)] },
  sendBody: true,
  specifyBody: 'json',
  jsonBody:
    "={{ JSON.stringify({ brand: 'portofolio', code: $json.code, caption: $json.ig_caption, " +
    "images: $json.slides.map((h, i) => ({ name: String(i + 1).padStart(2, '0'), html: h })) }) }}",
  options: { timeout: 60000 },
}), { onError: 'continueErrorOutput' });
hubung('Rakit slide', 'Render');

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

N('Ambil slide 01', 'n8n-nodes-base.httpRequest', 4.2, [3240, 180], {
  url: "={{ $('Render').first().json.urls[0] }}",
  options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
}, { onError: 'continueRegularOutput' });
hubung('LinkedIn init upload', 'Ambil slide 01');

N('LinkedIn upload', 'n8n-nodes-base.httpRequest', 4.2, [3460, 180], http({
  method: 'PUT',
  url: "={{ $('LinkedIn init upload').item.json.value.uploadUrl }}",
  sendHeaders: true,
  headerParameters: { parameters: [bearer(`{{ ${K('linkedin_token')} }}`)] },
  sendBody: true,
  contentType: 'binaryData',
  inputDataFieldName: 'data',
}), { onError: 'continueRegularOutput' });
hubung('Ambil slide 01', 'LinkedIn upload');

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
]), { onError: 'continueRegularOutput' });
hubung('Pecah URL slide', 'IG item container');

N('Kumpulkan children', 'n8n-nodes-base.code', 2, [3460, 460], { jsCode: baca('kumpulkan-children.js') });
hubung('IG item container', 'Kumpulkan children');

N('IG carousel container', 'n8n-nodes-base.httpRequest', 4.2, [3680, 460], igBody([
  { name: 'media_type', value: 'CAROUSEL' },
  { name: 'children', value: '={{ $json.children }}' },
  { name: 'caption', value: "={{ $('Rakit slide').first().json.ig_caption }}" },
  { name: 'access_token', value: `={{ ${K('ig_token')} }}` },
]), { onError: 'continueRegularOutput' });
hubung('Kumpulkan children', 'IG carousel container');

N('IG publish', 'n8n-nodes-base.httpRequest', 4.2, [3900, 460], http({
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
}), { onError: 'continueRegularOutput' });
hubung('IG carousel container', 'IG publish');

N('IG permalink', 'n8n-nodes-base.httpRequest', 4.2, [4120, 460], http({
  url: '=https://graph.instagram.com/v23.0/{{ $json.id }}',
  sendQuery: true,
  queryParameters: {
    parameters: [
      { name: 'fields', value: 'permalink' },
      { name: 'access_token', value: `={{ ${K('ig_token')} }}` },
    ],
  },
}), { onError: 'continueRegularOutput' });
hubung('IG publish', 'IG permalink');

// ─────────────────────────────────────────────── 6. lapor
// Barrier: e-mail hasil baru dikirim setelah kedua cabang selesai, supaya isinya
// tidak melaporkan LinkedIn saja padahal Instagram masih jalan.
N('Tunggu 2 cabang', 'n8n-nodes-base.merge', 3, [4340, 320], {
  mode: 'chooseBranch',
  numberInputs: 2,
  useDataOfInput: 1,
  options: {},
});
hubung('LinkedIn post', 'Tunggu 2 cabang', 0, 'main', 0);
hubung('IG permalink', 'Tunggu 2 cabang', 0, 'main', 1);

N('Email hasil', 'n8n-nodes-base.gmail', 2.2, [4560, 320], gmail(
  "=[Portofolio] Terbit: {{ $('Rakit slide').first().json.folder }}",
  baca('email-hasil.html')
), { credentials: GMAIL_CRED });
hubung('Tunggu 2 cabang', 'Email hasil');

// ───────────────────────────────────────────────
const wf = {
  name: 'Portofolio Publish',
  nodes,
  connections: conn,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: {
    templateCredsSetupCompleted: true,
    instanceId: 'f2a4228fc7039c0f0d943b69f0bc71caf753a0f2af9f4141781bcfa693f87ee3',
  },
};

// Dua keluaran dari sumber yang sama. Repo ini publik — token hidup di file yang
// ter-commit akan di-scrape bot dalam hitungan menit dan penerbitnya mencabutnya.
// Yang berbeda HANYA nilai di node Kredensial; struktur node-nya identik, jadi
// hasil edit di n8n tetap bisa di-diff terhadap versi ter-commit.
const out = process.argv[2];
const tulis = (file, kolom) => {
  const salinan = structuredClone(wf);
  const set = salinan.nodes.find((n) => n.name === 'Kredensial');
  set.parameters.assignments.assignments = FIELD.map(([name, , nyata]) => ({
    id: name,
    name,
    value: kolom === 'nyata' ? nyata : FIELD.find((f) => f[0] === name)[1],
    type: 'string',
  }));
  fs.writeFileSync(file, JSON.stringify(salinan, null, 2) + '\n', 'utf8');
  const kosong = set.parameters.assignments.assignments
    .filter((a) => /^ISI_[A-Z_]+$/.test(a.value))
    .map((a) => a.name);
  console.log(
    `${salinan.nodes.length} node -> ${file}\n` +
      (kosong.length ? `   masih perlu diisi: ${kosong.join(', ')}` : '   semua field terisi')
  );
};

tulis(out, 'placeholder');
tulis(out.replace(/\.json$/, '.local.json'), 'nyata');
