# Setup pipeline publish

`git push` ke `articles/**` → GitHub Action → webhook n8n → website + LinkedIn + Instagram.

```
publish.js  ──POST──▶  n8n /webhook/portofolio
                          ├─ POST api/articles (ID + EN)   ──▶ balas ke GitHub Actions
                          └─ artikel BARU saja:
                               Gemini caption + 5 slide
                               Gemini gambar → JPEG → render-svc
                               e-mail preview + tombol Approve
                               └─ LinkedIn (EN) + Instagram carousel (ID)
```

Kenapa hanya artikel baru: `publish.js` membaca `git diff --name-status` dan hanya
menandai folder yang **semua** file `.md`-nya berstatus `A`. Edit typo di artikel lama
tetap memperbarui website tapi tidak pernah mem-posting ulang ke sosmed. Tidak ada
tabel status yang perlu dijaga — git sudah menyimpan informasi itu.

---

## 1. Secret GitHub

**Settings → Secrets and variables → Actions**

| Secret | Wajib? | Isi |
|---|---|---|
| `WEBHOOK_URL` | ya | `https://workflow.daffathan-labs.my.id/webhook/portofolio` |
| `WEBHOOK_TOKEN` | tidak | hanya kalau Header Auth dinyalakan di node `Webhook` |

Namanya harus **persis** `WEBHOOK_URL`. Salah nama tidak bikin Action gagal di tempat
yang benar: `secrets.X` yang tidak ada berubah jadi string kosong, dan yang muncul cuma
"WEBHOOK_URL kosong".

> **Webhook-nya sekarang tanpa autentikasi**, sesuai permintaan. Artinya siapa pun yang
> tahu alamatnya bisa menulis artikel ke website dan memicu posting ke LinkedIn dan
> Instagram. Yang menjaganya cuma kerahasiaan URL, dan `portofolio` gampang ditebak.
> Cara termurah menutupnya tanpa membuat credential: ganti `path` di node Webhook jadi
> acak (`portofolio-a7f3k9x2`), lalu perbarui secret `WEBHOOK_URL`.

`NESTJS_API_URL` dan `NESTJS_API_KEY` sudah tidak dipakai Action — pindah jadi env var
n8n di langkah 3. Boleh dihapus dari repo setelah pipeline barunya terbukti jalan.

## 2. Import workflow

n8n → **Workflows → Import from File** → **`n8n/portofolio-publish.local.json`**
(bukan yang tanpa `.local` — itu versi placeholder untuk git; lihat langkah 3).

Workflow-nya sudah membawa `webhookId` yang sama dengan webhook yang sudah kamu buat,
jadi path `/webhook/portofolio` tidak berubah.

### Kredensial node — semuanya sudah terisi

| Node | Jenis kredensial | Kredensial n8n |
|---|---|---|
| `Gemini Flash`, `Gemini gambar` | Google Gemini (`googlePalmApi`) | `Google Gemini(PaLM) Api account 2` |
| `Kirim preview`, `Email hasil`, `Lapor render gagal`, `Lapor dilewati`, `Lapor commit` | Gmail OAuth2 | `Gmail account` |

**ID kredensial di berkas ini nilai asli, dan itu disengaja.** ID-nya bukan rahasia —
cuma nomor rekaman di instance n8n; isinya (API key, token OAuth) tetap tinggal di n8n
dan tidak pernah ikut ter-ekspor.

ID Gemini sempat ditulis sebagai placeholder `ISI_ID_CREDENTIAL_GEMINI`, dan itu keliru:
`tulis()` di `build.mjs` cuma menyulih node `Kredensial`, blok `credentials` di node
tidak ikut. Jadi berkas `.local.json` pun membawa placeholder, dan matinya baru terasa
**di tengah eksekusi** — `Gemini Flash` gagal dengan *"Credential with ID … does not
exist"* setelah artikelnya terlanjur terbit ke website. Ada test yang menolak ID
kredensial berbentuk placeholder di ketiga workflow.

Keempat node e-mail memakai node Gmail, yang mengirim **dari akun Gmail yang
terautentikasi**. Tidak ada alamat pengirim yang bisa diatur; `NOTIFY_EMAIL` hanya
menentukan penerimanya.

## 3. Node `Kredensial`

**Tidak ada env var.** Semua nilai yang perlu diganti manusia ada di satu node Set
bernama `Kredensial`, tepat setelah Webhook. Token LinkedIn kedaluwarsa tiap 60 hari
dan versi API tiap ~12 bulan, jadi tempat menggantinya harus satu dan gampang dicari —
bukan tersebar di `docker-compose.yml` dan belasan parameter node.

Buka node itu di n8n, isi yang masih `ISI_...`, simpan. Selesai.

| Field | Isi |
|---|---|
| `article_api_url` | `https://api.daffathan-labs.my.id` — sudah terisi |
| `article_api_key` | nilai `ARTICLE_API_KEY` milik daffathan-labs-api |
| `site_url` | `https://daffathan-labs.my.id` — sudah terisi |
| `render_url` | domain publik render-svc, **tanpa** trailing slash |
| `render_token` | sama dengan `RENDER_TOKEN` di render-svc |
| `linkedin_token` | → [credentials-linkedin.md](credentials-linkedin.md). **Ini yang diganti tiap 60 hari** |
| `linkedin_urn` | `urn:li:person:B1oVXChp7v` — sudah terisi dan terverifikasi |
| `linkedin_version` | `202607` — sudah terisi. Ganti hanya saat muncul 426 `NONEXISTENT_VERSION` |
| `ig_user_id` | → [credentials-instagram.md](credentials-instagram.md) |
| `ig_token` | idem. Diperpanjang otomatis tiap bulan — lihat workflow 2 |
| `fb_page_id` | → [credentials-facebook.md](credentials-facebook.md) |
| `fb_page_token` | idem. **Tidak kedaluwarsa** selama kamu tetap admin Halamannya |
| `github_token` | PAT untuk commit balik gambar. Yang terpasang sekarang PAT **klasik** (`ghp_`) — berlaku untuk **semua** repo akunmu. Yang dibutuhkan cuma repo `Articles` + **Contents: Read and write**, jadi ganti ke **fine-grained** kalau sempat |
| `notify_email` | alamat **penerima** e-mail; pengirimnya selalu akun Gmail di kredensial |

Umur token per platform, supaya jelas mana yang perlu diingat:

| Platform | Umur token | Perawatan |
|---|---|---|
| Instagram | 60 hari | **otomatis** — workflow terjadwal memperpanjang tiap bulan |
| Facebook | tidak kedaluwarsa | **nol** |
| LinkedIn | 60 hari | **manual**, satu-satunya yang harus diingat |

> **App secret Facebook tidak masuk ke sini.** Dia bisa mencetak token baru, dan cuma
> dipakai sekali di terminal saat menukar token. Ada test yang menolak field bernama
> `*_secret` di node `Kredensial`.

### Dua file, satu struktur

Repo ini **publik** — token hidup di file yang ter-commit akan di-scrape bot dalam
hitungan menit dan penerbitnya mencabutnya. Jadi build menghasilkan dua file:

| File | Isi | Git |
|---|---|---|
| `n8n/portofolio-publish.json` | placeholder `ISI_...` | ter-commit |
| `n8n/portofolio-publish.local.json` | nilai asli — **ini yang di-import** | di-gitignore |

Node dan koneksinya identik; yang berbeda hanya nilai di dalam `Kredensial`. Jadi hasil
edit di n8n tetap bisa di-diff terhadap versi ter-commit.

Satu test mengunci ini: `file ter-commit tidak membawa kredensial hidup` gagal kalau ada
nilai asli yang bocor ke file yang ter-commit.

> ### ⚠️ Jangan simpan hasil "Download" dari n8n ke dalam repo
>
> Tombol **Download** di n8n menulis nilai node Set **apa adanya** — tidak ada
> penyamaran, tidak peduli nama berkasnya. Sekali kejadian: sebuah `n8n/Portofolio.json`
> hasil ekspor manual membawa token Instagram, token LinkedIn, token render-svc, **dan**
> API key n8n sekaligus, dan lolos karena `.gitignore` waktu itu cuma menutup pola
> `*.local.json`.
>
> Sekarang ada dua lapis: `.gitignore` menutup `n8n/Portofolio.json` dan
> `n8n/*.export.json`, **dan** ada test yang memindai seluruh berkas yang akan ter-commit
> di `n8n/` dan `.github/` untuk pola token Instagram, LinkedIn, JWT, dan PAT GitHub.
> Lapis kedua itu yang sebenarnya menjaga — dia tidak bergantung pada nama berkas.
>
> Kalau butuh mengekspor untuk di-review, simpan ke luar repo.

## 3b. Gambar artikel — satu wajah di semua tempat

Satu gambar per artikel dipakai di tiga tempat: thumbnail + `og:image` di website,
gambar tunggal di LinkedIn, dan latar slide pertama carousel.

**Artikel punya gambar** (45 dari 45 artikel yang ada): gambarnya diunduh sekali di node
`Ambil cover`, lalu dipakai apa adanya. Tidak ada yang di-generate, tidak ada yang
di-commit.

**Artikel tidak punya gambar**: latar Gemini slide 1 dipromosikan jadi gambar artikel,
dirender lanskap **1200×630** (satu ukuran yang melayani `og:image` dan LinkedIn), lalu
**di-commit balik ke repo** — `articles/<folder>/hero.jpg` plus dua baris di tiap `.md`:

```markdown
<!-- image: https://raw.githubusercontent.com/.../hero.jpg -->   <- thumbnail + og:image
<img width="800" alt="..." src="https://raw.githubusercontent.com/.../hero.jpg" />
```

### Kenapa harus di-commit, bukan cukup POST ke API

`replaceSet` di API melakukan `DELETE` lalu membangun ulang dari payload, dan payload
dibuat dari berkas `.md`. Gambar yang hanya hidup di database akan **terhapus** oleh
`workflow_dispatch` full sync berikutnya — bahkan oleh edit biasa, karena `upsert`
menulis semua kolom termasuk `image: null`. Repo adalah sumber kebenaran.

### Commit-nya sengaja memicu Action, dan loop-nya berhenti sendiri

Tidak pakai `[skip ci]`. Commit balik memicu Action seperti biasa → `publish.js` kirim
artikel yang sekarang sudah punya gambar → website ter-update lewat jalur yang sama
seperti publish normal, tanpa node publish tambahan.

Berhentinya dijamin kode yang sudah ada: `classifyDiff` hanya menghitung status **`A`**
sebagai artikel baru, dan `.md` hasil commit ini berstatus **`M`**. Jadi `new_folders`
kosong → gerbang `Ada artikel baru?` mati → cabang sosmed tidak jalan dua kali → tidak
ada commit kedua. Berhenti setelah tepat satu siklus tambahan.

Konsekuensinya website dapat gambarnya ±1 menit setelah publish pertama, bukan seketika.

### Urutan yang tidak boleh dibalik

Gambar di-commit **dulu**, baru `.md` yang menunjuk ke gambar itu. `Pecah md` menolak
melanjutkan kalau `Simpan gambar` gagal — kalau dibalik, ada jendela di mana `.md`
menautkan URL yang masih 404, dan kalau full sync kebetulan jalan di situ,
`convertSingleImage` gagal dan `image` artikelnya jadi null lagi.

Seluruh cabang ini memakai `onError: continueRegularOutput` karena berjalan berdampingan
dengan approval yang menunggu sampai 48 jam — kegagalan di sini tidak boleh menjatuhkan
eksekusi yang sedang menahan artikel. Hasilnya, berhasil atau gagal, dilaporkan lewat
e-mail `Lapor commit`.

Artikel yang **sudah** punya gambar tidak menyentuh cabang ini sama sekali: `Susun commit`
mengembalikan nol item, dan nol item berarti seluruh rantai di bawahnya tidak dieksekusi.

## 3c. Cabang Facebook

Tiga node: `FB unggah foto` → `Kumpulkan foto FB` → `FB posting`. **Aktif.**

Facebook tidak punya endpoint carousel. Polanya dua langkah:

```
1. tiap slide:  POST /{page-id}/photos   url=..., published=false   -> id
2. sekali:      POST /{page-id}/feed     message=..., attached_media[0..4]
```

`published=false` di langkah 1 itu wajib. Tanpa itu tiap slide jadi post sendiri dan
satu artikel membanjiri Halaman dengan 5 post, bukan satu post berisi 5 foto.

### Mematikannya lagi kalau perlu

Satu baris di `n8n/src/build.mjs`:

```js
const FB_AKTIF = true;   // -> false
```

Lalu `node n8n/src/build.mjs n8n/portofolio-publish.json` dan pasang ulang.
**Tidak ada langkah manual di kanvas n8n.**

Saklar itu tidak cuma mematikan tiga node — dia juga memutus sambungannya ke node
Merge dan mengembalikan Merge ke dua input. Itu bukan kerapian: **node nonaktif tidak
dieksekusi n8n, sementara Merge menunggu semua input yang tersambung.** Cabang FB yang
nonaktif tapi tetap tersambung membuat `Email hasil` menunggu masukan yang tidak akan
pernah datang — dan yang mati bukan Facebook saja, tapi seluruh laporan hasil publish.
Ada test yang mengunci "nonaktif berarti nonaktif DAN terputus".

Selama nonaktif, baris Facebook di e-mail hasil berbunyi `nonaktif`. Baris itu dijaga
`$('FB posting').isExecuted` — tanpa penjaga itu ekspresinya melempar
*"Referenced node is unexecuted"* dan e-mailnya hilang seluruhnya, bukan satu barisnya.

### Caption dipisah per platform

Satu panggilan `Gemini copy`, tiga caption, karena tiga platform memotong dan menautkan
dengan cara yang berbeda:

| Field | Bahasa | Panjang | Diakhiri | Hashtag |
|---|---|---|---|---|
| `linkedin_caption` | Inggris | 120–200 kata | URL EN | tidak |
| `ig_caption` | Indonesia | **30–60 kata** | "Link lengkapnya di bio" | ya, maks 5 |
| `fb_caption` | Indonesia | **150–250 kata** | `Baca lengkapnya: <URL ID>` | tidak |

Instagram sependek itu karena feed memotong di ±125 karakter, dan URL-nya tidak
dibuat-buat pun tidak bisa diklik. Facebook tidak memotong sependek itu dan tautannya
hidup, jadi di sana URL-nya ditulis utuh.

## 3d. Workflow kedua: kirim ulang tanpa LinkedIn

Untuk artikel yang **sudah terlanjur ada di LinkedIn** tapi belum di Instagram/Facebook —
misalnya artikel yang terbit sebelum pipeline ini ada. `Approve?` bercabang ke semua
platform tanpa syarat, jadi `[repost:]` lewat workflow normal berarti LinkedIn kena
dua kali.

| | Portofolio Publish | Portofolio Ulang |
|---|---|---|
| Node | 50 | 46 |
| Platform | LinkedIn + Instagram + Facebook | Instagram + Facebook |
| Subject e-mail | `[Portofolio] …` | **`[ULANG] [Portofolio] …`** |
| `path` webhook | `portofolio` | `portofolio` — **sama** |

**Diturunkan, bukan disalin.** `tanpaLinkedIn()` di `build.mjs` mengambil workflow normal
yang sudah jadi lalu membuang 4 node LinkedIn, merapatkan indeks input node Merge,
membersihkan dua template e-mail, dan memberi awalan `[ULANG]`. Berkas kedua yang dirawat
tangan pasti melenceng dari yang pertama, dan melencengnya baru ketahuan waktu postingan
salah sudah tayang.

Indeks Merge dirapatkan, bukan sekadar jumlahnya dikurangi: Merge menunggu **semua** input
yang tersambung, jadi input 0 yang tidak pernah terisi bikin `Email hasil` menggantung
selamanya — tanpa pesan error apa pun. Ada test yang mengunci indeksnya rapat di **kedua**
workflow.

### Prosedur kirim ulang

```bash
# 1. di n8n: nonaktifkan "Portofolio Publish", aktifkan "Portofolio Ulang"
# 2. picu:
git commit --allow-empty -m "[repost: nama-folder-artikel]"
git push
# 3. approve dari e-mail  -> subject HARUS berawalan [ULANG]
# 4. di n8n: kembalikan — nonaktifkan yang Ulang, aktifkan yang Publish
```

`path` webhook sengaja sama, jadi `WEBHOOK_URL` di secret GitHub tidak perlu disentuh:
yang menjawab adalah workflow yang sedang aktif. n8n juga **menolak** dua workflow aktif
berbagi path yang sama — jadi "cuma satu yang aktif" dipaksa n8n, bukan kedisiplinan yang
harus diingat.

Awalan `[ULANG]` di subject itu penjaga satu-satunya jebakan yang tersisa: kalau lupa
langkah 4, artikel berikutnya diam-diam tidak naik ke LinkedIn. Dengan awalan itu,
e-mail preview-nya sendiri yang memberi tahu workflow mana yang berjalan — **sebelum**
tombol Approve diklik.

> **Satu artikel per eksekusi.** `siapkan-brief.js` cuma memproses `baru[0]`; sisanya
> masuk daftar `dilewat` dan **tidak disimpan di mana pun**. Jadi menyusulkan banyak
> artikel berarti satu commit dan satu e-mail approval per artikel, bukan sekali jalan.

## 3e. Desain slide — foto jadi bintangnya

Semua slide dulu terlihat sama: kotak gelap berteks putih, tidak peduli artikelnya review
film atau catatan SQLite. Penyebabnya **tiga lapis yang saling menumpuk**, bukan palet
yang kurang:

| Lapis | Efek |
|---|---|
| prompt gambar dipaksa `muted desaturated palette, dark moody background` | foto lahir gelap dan seragam |
| `.bg { opacity: .42 }` | sisa 42% |
| `.veil` `rgba(11,15,20,.62 → .96)` menutup **seluruh** kanvas | sisa **16% di ujung atas, 1,7% di bawah** |

Sekarang foto tampil `opacity: 1` dan tidak ada lapisan yang menutup sekanvas selain
`.redup` `.22`. Kontras dijaga **lokal** — hanya di belakang teks.

### Binary di instance ini ada di DISK, bukan di dalam item

Kalau suatu saat semua slide keluar dengan ikon gambar rusak, **ini penyebabnya**, dan
tidak ada satu pun error yang menunjukkannya.

Instance ini jalan dengan `N8N_DEFAULT_BINARY_DATA_MODE=filesystem`. Konsekuensinya:

```
binary.data.data     = "filesystem-v2"     ← string biasa, BUKAN base64
binary.data.id       = "filesystem-v2:workflows/…/binary_data/<uuid>"
binary.data.mimeType = "image/webp"        ← metadata lain tetap utuh
```

Jadi `binary.data.data` yang dipasang ke `<img src="data:image/webp;base64,…">`
menghasilkan `…base64,filesystem-v2` — gambar rusak, di setiap slide, sementara n8n
melaporkan sukses dan render-svc membalas 200.

Yang membacanya dari disk adalah dua Code node dengan sumber yang sama
(`n8n/src/ke-base64.js`): **`Cover base64`** setelah `Ambil cover`, dan
**`Slide base64`** setelah `Jadi JPEG`. Isinya satu loop
`this.helpers.getBinaryDataBuffer(i, 'data')`, dan hasilnya ada di `json.b64` + `json.mime`.

**Jangan ganti dengan node `Extract From File`.** Node itu memang mengubah binary jadi
base64, dan sempat dipakai — tapi dia **membuang** item yang tidak punya binary alih-alih
menandainya. Akibatnya dua-duanya sunyi:

| Kasus | Keluaran `Extract From File` | Akibat |
|---|---|---|
| 2 dari 5 gambar berhasil | 2 item | gambar slide 3 terpasang di slide 1 — pasangan indeks hilang |
| 0 dari 5 berhasil (kuota habis) | 0 item | cabang berhenti, `Rakit slide` tidak jalan, n8n tetap "success" |

Yang kedua benar-benar terjadi di eksekusi 4216. `alwaysOutputData` menambal kasus kedua
tapi tidak kasus pertama; Code node menyelesaikan dua-duanya karena mengeluarkan tepat
satu item per item masuk.

Fixture test meniru mode filesystem: `binary.data.data` diisi `"filesystem-v2"`, satu test
gagal begitu string itu muncul di HTML mana pun, dan `ke-base64.js` dijalankan langsung
dengan `this.helpers` palsu yang isinya diturunkan dari indeks yang diminta — jadi
meminta indeks yang salah pun ketahuan.

### Slide 1 foto artikel, slide 2+ gambarnya masing-masing

Model gambar **menolak menggambar karakter berhak cipta dan wajah orang nyata**, jadi
"Spider-Man" atau "Sadie Sink sebagai Jean Grey" tidak akan pernah keluar dari Gemini.
Satu-satunya foto yang benar-benar menampilkan subjek artikel adalah foto artikelnya —
jadi foto itu memegang **slide 1**.

Sempat dipakai di **kelima** slide dengan titik potong berbeda, dan hasilnya ditolak:
foto yang sama tetap terbaca sebagai satu gambar diulang lima kali, seberapa pun
cropnya digeser. Slide 2+ punya teksnya sendiri, jadi gambarnya juga dibuat dari teks
itu lewat `Gemini gambar`.

Yang mengikat kelimanya jadi satu seri ada di `pecah-slide.js`: slide 2+ diminta
memakai **cahaya dan warna yang sama** tapi **adegan, subjek, dan sudut kamera yang
jelas berbeda**. Baris itu dulu mengunci `same location` juga — dan itu yang membuat
lima frame keluar nyaris identik.

Titik potong (`CROP`) sekarang cuma berlaku untuk slide yang memakai foto artikel:
slide 1, dan slide mana pun yang gambar Gemini-nya gagal. Raster Gemini tidak digeser,
karena tiap frame sudah dikomposisikan.

**Kalau semua gambar Gemini gagal** (kuota habis, seperti 2026-08-13), kelima slide
jatuh ke foto artikel dengan crop berbeda — bukan kanvas kosong. Artikel tanpa foto
**dan** tanpa gambar Gemini baru jatuh ke kartu warna aksen.

> Konsekuensi kuota: tiap artikel memanggil `Gemini gambar` 5x lagi, dan gambar slide 1
> tidak terpakai kalau artikelnya punya cover. Menyaringnya butuh node Filter plus
> aritmetika offset indeks antara `Pecah slide` dan `Jadi JPEG` — hemat 20% dengan
> risiko pasangan indeks meleset. Belum sepadan.

> **Bug yang ini menutup:** API mengembalikan `image` sebagai path **relatif**
> (`/uploads/articles/<md5>.webp`). Diteruskan apa adanya, `Ambil cover` menolaknya
> dengan *"Invalid URL: … must start with http"* lalu jatuh diam-diam ke gambar Gemini
> karena node itu `onError: continueRegularOutput`. Foto artikel tidak pernah sekali pun
> sampai ke carousel **maupun ke LinkedIn**, dan tidak ada satu pun error yang terlihat.
> Prefiksnya sekarang dipasang di `siapkan-brief.js`, satu tempat.

### Yang dipilih model, per artikel

| Field | Isi | Kalau ngawur |
|---|---|---|
| `accent` | `#RRGGBB` dari **keluarga biru** (hue 180–265) | jatuh ke biru brand `#5EC8FF` |
| `layout` | `blok-bawah` · `pias-bawah` · `tengah` | jatuh ke `blok-bawah` |
| `image_mood` | 3–8 kata Inggris, arah cahaya dan warna foto | prompt jalan tanpa arah |

`accent` diperiksa **tiga kali**, dan tiap pemeriksaan menutup kegagalan yang berbeda:

1. **Bentuk `#RRGGBB`** — model rutin mengembalikan bentuk yang tidak diminta.
2. **Kontras ≥ 4,5:1 terhadap putih** — dia jadi latar chip berteks putih, jadi hex yang
   sah pun bisa tidak terbaca. Pastel lolos pemeriksaan bentuk tapi gagal yang ini.
3. **Hue 180–265** — foto dan layout boleh beda tiap artikel; warnanya tetap satu
   keluarga supaya orang mengenali postingannya tanpa membaca nama.

Tiga layout, bukan bebas: tiap bentuk harus bisa dibuktikan tidak meluber lewat test.

> **Apa pun yang di-`transform: scale` wajib dibungkus `overflow: hidden`.** Transform
> tidak mengubah layout tapi **tetap menambah scrollable overflow**, jadi zoom 1.12 pada
> foto setinggi kanvas bikin render-svc mengukur 1431px dan membalas 422 di **setiap**
> artikel — dan loop penyusutan tidak pernah menyembuhkannya karena penyebabnya bukan
> teks. Cuma ketahuan dengan benar-benar merender; unit test tidak mengukur piksel.

### Yang tidak pernah berubah

Logo DF + wordmark, nomor slide, slide 5 sebagai CTA tetap, dan **nol URL di raster mana
pun**. Keempatnya dikunci test yang dijalankan ulang di ketiga layout.

### Nol foto = kartu warna, bukan lubang

Konsekuensi langsung dari foto jadi bintangnya. Dulu gambar gagal tetap terlihat "normal"
karena foto cuma dekorasi 16%; sekarang gagal berarti kanvas kosong. Jadi slide tanpa
raster jatuh ke **kartu gradien dari `accent`** — bentuk yang terlihat seperti pilihan
desain. Urutannya: raster sendiri → pinjam raster tetangga → kartu warna.

> **`.teks` tidak boleh diberi `overflow: hidden`.** render-svc aturan 11 mengukur
> `scrollHeight` setelah layout jadi; kalau zona teks menutup luapannya sendiri,
> `scrollHeight` tidak pernah tumbuh, render dibalas 200, dan loop penyusutan ronde tidak
> pernah jalan — teks terpotong diam-diam dan tidak ada yang tahu. Ada test yang
> menjaganya di ketiga layout.

### Melihat hasilnya tanpa menyentuh workflow

Render langsung ke render-svc dengan `brand` dan `code` sekali pakai, lalu buka
`previewUrl`-nya. Tidak memicu posting apa pun, tidak menimpa render artikel asli:

```
POST /render  { brand: "uji", code: "desain-blok", images: [...] }
```

## 4. render-svc

Sudah ter-deploy. Workflow memakainya dengan `brand: "portofolio"`, dan service-nya
memang multi-brand lewat path `/a/:brand/:code/` — tidak ada perubahan kode yang perlu.
Diverifikasi 2026-08-12: render brand `portofolio` balas 200, JPEG-nya asli
(`FF D8 FF`), dan Meta berhasil mengambilnya lewat `http://` biasa di IP mentah —
TLS ternyata tidak diwajibkan untuk `image_url`.

**`render_url` harus base URL saja** — `http://34.128.95.69:8080`, **tanpa** `/render`.
Workflow yang menambahkan `/render`; kalau field-nya sudah memuatnya, hasilnya
`/render/render` dan balasannya 404 tanpa menyebut sebabnya. Ada test yang menjaga ini.

Satu hal yang gampang terlewat: `urls[]` yang dikembalikan render-svc disusun dari
env `PUBLIC_URL` **milik container itu**, bukan dari `render_url` yang kita kirim.
Kalau nanti service-nya dipindah ke domain ber-TLS, `PUBLIC_URL` di container harus
ikut diubah — mengubah `render_url` saja membuat gambar tetap disajikan di alamat lama.

Dua hal yang harus dipastikan sebelum posting pertama:

```bash
curl -s  https://<render>/health                        # "font" harus menyebut Inter
curl -s -o /dev/null -D - https://<render>/a/portofolio/uji/01.jpg
```

Pakai GET, **jangan `curl -I`**. Server-nya hanya melayani `GET`, jadi HEAD jatuh ke
handler 404 dan lu bakal mengira gambarnya hilang padahal ada.

Font salah tidak memunculkan error apa pun — teksnya cuma jatuh ke metrik lain dan
layout 1080×1350 bergeser diam-diam. Route `/a/` juga tidak boleh punya redirect:
Meta meng-cURL URL itu apa adanya, satu `Location:` saja membuat posting gagal.

### Render ulang artikel yang sama (perlu redeploy, v1.0.2)

JPEG disajikan `Cache-Control: public, max-age=31536000, immutable`. Selama `code`
sekali pakai itu benar, tapi di sini `code` adalah nama folder artikel — dirender ulang
tiap `[repost:]`. URL-nya identik, dan browser maupun pengambil media Meta sudah
diberitahu "ini tidak akan berubah setahun", jadi yang tampil gambar lama padahal
berkas di disk sudah baru.

Diperbaiki di repo [render-svc](https://github.com/daffa09/render-svc), dua hal:

- `urls[]` sekarang membawa `?v=<stempel>`, ganti tiap render. `immutable` jadi jujur.
- Folder `code` dibersihkan sebelum ditulis, jadi slide yang hilang di render baru
  (carousel 7 slide jadi 5) tidak bertahan sebagai `06.jpg` dan `07.jpg` yatim.

Workflow n8n **tidak berubah** — dia memang membaca `urls` dan `previewUrl` dari
balasan render, tidak pernah menyusun alamatnya sendiri. Yang perlu dilakukan cuma
redeploy service-nya:

```bash
docker compose pull && docker compose up -d
```

---

## Ketahanan terhadap gagal

Tiga lapis, dari yang paling murah:

**1. Retry di dalam node** — `Gemini copy` dan `Gemini gambar` di-set `maxTries: 5`
(maksimum n8n) dengan jeda 5 detik. Ini yang menangani error transien API.

**2. Gambar tidak pernah memblokir** — slide yang tetap gagal setelah 5 percobaan
meminjam latar slide tetangga. Kalau **semua** gambar gagal, slide tetap terbit dengan
latar polos gelap. Latar itu tampil di opacity 42% di balik veil gelap — teksnya yang
jadi isi, gambarnya dekorasi. Jumlah yang gagal disebut di e-mail preview.

**3. Loop render 8 ronde** — `Render` yang gagal kembali ke `Rakit slide`, sampai 8×.

Yang penting di lapis ketiga: **tiap ronde teksnya diperkecil.** 422 `overflow` itu
deterministik — kirim HTML yang sama ke render-svc, dapat 422 yang sama. Mengulang
input identik 8 kali cuma menghabiskan waktu. Jadi tiap ronde `Rakit slide` memakai
`$runIndex` untuk menskala font (100% → 70%, lantai di ronde 5) dan memangkas kata
(heading 8→5, body 25→10). Ronde 8 praktis mustahil meluber.

Loop-nya kembali ke `Rakit slide`, **bukan** ke `Gemini gambar`: penyebab overflow
adalah teks, bukan gambar, jadi gambar yang sudah jadi dipakai ulang. Regenerasi lima
gambar tiap ronde cuma membakar kuota Gemini tanpa mengubah apa pun.

Kalau render akhirnya berhasil di ronde >1, e-mail preview menyebutkannya — kalau itu
sering terjadi, perpendek batas kata di `Skema copy` supaya ronde pertama sudah muat.

---

## Verifikasi bertahap

Tiap langkah berdiri sendiri — jangan lompat ke akhir.

### a. Parser dan workflow

```bash
node --test .github/scripts/publish.test.mjs      # 12 test
node --test n8n/portofolio-publish.test.mjs       # 26 test
```

Yang kedua membaca `portofolio-publish.json` langsung: referensi `$('Nama Node')` yang
menggantung, Code node yang tidak lolos parse, dan node yang tidak terjangkau dari
Webhook semuanya ketahuan di sini, bukan saat produksi.

### b. Kredensial sosmed, sebelum menyentuh workflow

Jalankan blok verifikasi di masing-masing dokumen:
[LinkedIn §5](credentials-linkedin.md), [Instagram §6](credentials-instagram.md).

### c. Jalur website saja

Kirim payload palsu tanpa artikel baru — cabang sosmed harus diam:

```bash
curl -X POST https://workflow.daffathan-labs.my.id/webhook/portofolio \
  -H "X-Portofolio-Token: $N8N_WEBHOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"delta","sha":"uji","repo":"uji","new_folders":[],
       "articles":[{"id":"artikel-uji","locale":"id","title":"Artikel Uji",
       "excerpt":"Ringkasan uji.","date":"2026-08-12","posting_date":"2026-08-12",
       "content":"<p>Isi uji.</p>","tags":["Uji"]}]}'
```

Harus balas `{"ok":true,"mode":"delta","published":1,...}` dan **tidak** ada e-mail
yang masuk. Hapus artikel ujinya lewat `workflow_dispatch` (full sync akan
mem-prune apa pun yang tidak ada di repo).

Cek token juga benar-benar menjaga: request yang sama tanpa header harus `403`.

### d. End-to-end

1. Bikin `articles/<slug-baru>/` isi `<slug-baru>-id.md` dan `<slug-baru>-en.md`, push ke `main`
2. Action hijau; log step `Publish updated articles` menampilkan balasan n8n
3. `https://daffathan-labs.my.id/id/articles/<slug>` langsung hidup
   (halaman daftar artikel dan sitemap menyusul sampai 1 jam — ISR, itu normal)
4. E-mail preview masuk; buka `previewUrl` di HP, periksa kelima slide
5. Klik **Approve** → e-mail hasil berisi permalink LinkedIn dan Instagram

### e. Uji anti-double

Edit satu typo di artikel yang sama, push lagi. Website ikut ter-update, **tidak ada
e-mail preview**. Ini yang menahan artikel lama dari ter-posting berulang kali.

---

## Kapan artikel masuk sosmed

Satu aturan: **folder dianggap baru kalau SEMUA berkas `.md` di dalamnya berstatus `A`
di `git diff`.** Selain itu, tidak ada yang dikirim ke LinkedIn/Instagram.

| Yang lu lakukan | Website | Sosmed |
|---|---|---|
| Folder artikel baru | terbit | ✅ e-mail approval |
| Edit isi / ganti judul / ganti gambar | ter-update | ❌ |
| Tambah terjemahan EN ke artikel lama | ter-update | ❌ (berkas ID-nya `M`, bukan `A`) |
| Ganti nama folder | folder baru terbit | ❌ (rename `R`, bukan `A`) |
| `workflow_dispatch` | full sync | ❌ |
| Commit berisi `[repost: nama-folder]` | ter-update | ✅ |

Website tidak akan pernah dobel apa pun yang lu lakukan: tabelnya ber-`PRIMARY KEY
(id, locale)` dengan `ON CONFLICT DO UPDATE`, dan `id` diisi nama folder. Edit = UPDATE
baris yang sama. Ganti judul juga aman — `slug` bukan bagian dari kunci, jadi dia ikut
ter-update di baris itu.

### `[repost: nama-folder]`

Git tahu artikel mana yang baru, tapi tidak tahu artikel mana yang **berhasil**
diposting. Tiga keadaan bikin satu artikel hangus permanen tanpa penanda ini:

- approval di-**Reject**
- render menyerah setelah 8 ronde
- satu push membawa beberapa artikel baru — yang tidak terpilih masuk daftar `dilewat`

Tulis penandanya di pesan commit. Commit kosong boleh, dan justru itu bentuk yang
paling sering dipakai — artikelnya sudah benar, cuma posting-nya yang gagal:

```bash
git commit --allow-empty -m "[repost: review-supergirl]"
git push
```

Boleh lebih dari satu penanda dalam satu pesan, tapi tetap satu artikel per eksekusi;
sisanya disebut di `dilewat`. Nama folder yang salah ketik **menggagalkan Action**
dengan pesan jelas, bukan diam-diam tidak melakukan apa-apa.

Penandanya sengaja di pesan commit, bukan flag di dalam berkas `.md`. Flag di berkas
harus dibalik jadi "sudah" setelah posting berhasil, dan yang tahu itu cuma n8n — yang
tidak punya akses tulis ke repo ini. Jadi pembalikannya manual, dan sekali lupa, flag
tersangkut sampai suatu hari perbaikan typo ikut mem-posting ulang ke Instagram. Pesan
commit tidak bisa basi.

`[repost]` diabaikan di mode `sync`: di sana daftar folder berisi **semua** artikel,
jadi satu `workflow_dispatch` bisa mengantre puluhan posting.

> **Kenapa Action-nya tidak lagi memfilter `paths: articles/**`.** Karena commit kosong
> tidak menyentuh berkas apa pun, filter itu bikin GitHub **melewati Action-nya diam-diam**
> — push berhasil, Action tidak pernah muncul di daftar, dan gejalanya terlihat seperti
> n8n yang bermasalah. Filter itu ada sampai 2026-08-13, dan selama itu `[repost:]`
> tidak pernah sekali pun benar-benar bisa jalan.
>
> Gantinya ada di `publish.js`: kalau nol folder artikel berubah **dan** tidak ada
> penanda `[repost:]`, dia berhenti sebelum memanggil webhook. Jadi push yang cuma
> menyentuh `docs/` atau `n8n/` tetap murah, cuma sekarang lewat gerbang yang tahu soal
> `[repost:]`. Ada test yang menolak filter itu dikembalikan.

---

## Kalau ada yang salah

| Gejala | Sebabnya |
|---|---|
| Action merah, `HTTP 403` | `N8N_WEBHOOK_TOKEN` beda dengan value di kredensial Header Auth |
| Action merah, `HTTP 400 property ... should not exist` | ada field asing di payload artikel; `/articles` memakai `forbidNonWhitelisted` |
| Action hijau tapi tidak ada e-mail | `new_folders` kosong — folder tidak semua `.md`-nya berstatus `A`. Cek `git diff --name-status HEAD~1 HEAD -- articles/`. Kalau memang mau diposting, pakai `[repost: nama-folder]` |
| Slide di preview masih gambar lama | render-svc belum di-redeploy ke v1.0.2; JPEG-nya masih disajikan `immutable` setahun di URL yang sama |
| E-mail `RENDER GAGAL 8x` | render gagal 8 ronde berturut-turut. Kalau errornya `overflow` padahal font sudah menyusut ke 70%, masalahnya di template `Rakit slide`, bukan di isi artikel. Kalau bukan 422, cek `GET /health` render-svc |
| Tombol Approve tidak melakukan apa-apa | eksekusi sudah lewat 48 jam dan Wait node kedaluwarsa |
| LinkedIn gagal, Instagram terbit | token LinkedIn kedaluwarsa (60 hari). Kedua cabang memang sengaja tidak saling menjatuhkan |
| Semua slide berlatar sama | sebagian panggilan Gemini gambar gagal dan slide yang gagal meminjam raster tetangga; jumlahnya disebut di e-mail preview |

## Batasan yang disengaja

- **Satu artikel per eksekusi.** Kalau satu push membawa dua artikel baru, yang kedua
  disebut namanya di e-mail preview dan tidak diproses. Ambil sisanya dengan
  `[repost: nama-folder]` — push ulang saja tidak cukup, karena berkasnya sudah
  berstatus `M` dan `workflow_dispatch` tidak pernah mem-posting.
- **Tidak ada backlog cron.** 44 artikel lama tidak akan pernah ter-posting otomatis.
- **`workflow_dispatch` tidak pernah mem-posting ke sosmed.** Mode itu memakai
  `/articles/sync` yang destruktif (menghapus artikel yang tidak ada di payload) dan
  hanya untuk memperbaiki keadaan website.
- **Push di luar `main` tidak mem-publish sama sekali.**

---

## Workflow 2 — perpanjang token Instagram otomatis

Token Instagram hidup **60 hari**. Ada endpoint yang memberi 60 hari lagi tanpa OAuth
ulang, dan bisa dipanggil berkali-kali:

```
GET https://graph.instagram.com/refresh_access_token
    ?grant_type=ig_refresh_token&access_token=<token sekarang>
```

Diverifikasi 2026-08-12 dengan token asli: **HTTP 200**, `expires_in` 5.168.940 detik
= 60 hari, token barunya beda dari yang lama.

Yang penting dipahami: **memanggil endpoint ini tidak memperpanjang token yang lama.**
Dia menerbitkan token *baru*; yang lama tetap mati di tanggalnya sendiri. Jadi panggilan
yang hasilnya tidak disimpan sama sekali tidak berguna. Karena itu workflow ini menulis
balik nilainya ke node `Kredensial` workflow publish lewat REST API n8n.

Alurnya: `Tiap bulan` → `Ambil workflow` (GET) → `Ambil token lama` → `Refresh token` →
`Susun workflow baru` → `Simpan workflow` (PUT) → `Cek token` → `Lapor token`.

Bulanan, bukan tiap 55 hari: satu eksekusi boleh gagal total dan masih tersisa satu
bulan penuh untuk menyadarinya.

### Setup

1. n8n → **Settings → n8n API → Create an API key**. Salin kuncinya.
2. Buka workflow publish di n8n, ambil ID-nya dari URL: `/workflow/<id>`
3. **Overview → Create Workflow** dulu, baru **Import from File** di halaman kosong itu →
   `n8n/refresh-ig-token.local.json`
4. Buka node `Kredensial` di workflow baru itu, isi `n8n_api_key` dan `workflow_id`
5. **Aktifkan** workflow-nya (toggle Active) — Schedule Trigger tidak jalan kalau tidak aktif
6. Klik **Execute workflow** sekali untuk membuktikannya jalan, jangan tunggu tanggal 1

> ⚠️ **Jangan import saat workflow publish sedang terbuka.** "Import from File" itu
> menempel ke kanvas yang sedang aktif, bukan membuat workflow baru. Kalau tertimpa,
> gejalanya: satu workflow berisi 49 node, nama workflow ikut ketimpa jadi nama file
> yang di-import, dan node `Kredensial` bawaan refresh berubah nama jadi `Kredensial1`
> karena bentrok. Yang berbahaya adalah yang terakhir — semua node refresh memanggil
> `$('Kredensial')`, dan setelah ditabrak namanya, panggilan itu nyasar ke `Kredensial`
> milik workflow publish yang tidak punya `n8n_api_key`. Tidak ada error saat import;
> baru ketahuan saat jadwalnya jalan.
>
> Kalau terlanjur: hapus 9 node refresh (`Tiap bulan`, `Kredensial1`, `Ambil workflow`,
> `Ambil token lama`, `Refresh token`, `Susun workflow baru`, `Simpan workflow`,
> `Cek token`, `Lapor token`), kembalikan nama workflow ke `Portofolio Publish`, lalu
> ulangi dari langkah 3.

Diverifikasi 2026-08-12 langsung ke instance produksi: rantai lengkap GET → refresh →
PUT jalan, 40 node sebelum dan sesudah, satu-satunya node yang berubah `Kredensial`,
workflow tetap aktif, dan token ter-refresh sampai **2026-10-11**.

Kunci API n8n bisa mengubah **semua** workflow di instance-mu — perlakukan seperti
password, dan jangan pernah menaruhnya di berkas yang ter-commit. `refresh-ig-token.json`
(tanpa `.local`) sengaja cuma berisi placeholder, dan ada test yang menguncinya.

### Yang diperiksa sebelum dianggap berhasil

HTTP 200 dari PUT tidak cukup. `Cek token` membaca balasan PUT dan mengeluh kalau:

- nilai `ig_token` yang tersimpan ternyata masih yang lama
- workflow jadi nonaktif setelah disimpan
- refresh gagal sama sekali

E-mailnya hanya memuat **enam karakter terakhir** token lama dan baru, cukup untuk
memastikan nilainya benar-benar berganti tanpa menyimpan token utuh di kotak masuk.

Badan PUT sengaja hanya berisi `name`, `nodes`, `connections`, `settings`. Skema API
n8n memakai `additionalProperties: false` dan menandai `id`/`active`/`createdAt`/
`updatedAt` sebagai read-only — menyertakannya dibalas 400 dengan pesan yang tidak
menyebut properti mana yang salah. Spec-nya bisa dibaca sendiri di
`GET /api/v1/openapi.yml`, tanpa autentikasi.

### LinkedIn tidak punya ini

Tidak ada endpoint refresh untuk token profil pribadi. Token LinkedIn **tetap harus
diganti tangan tiap 60 hari** di node `Kredensial` workflow publish. Gejalanya khas:
Instagram terbit, LinkedIn gagal, dan e-mail hasil menyebutkannya.

---

## Mengubah workflow

`n8n/portofolio-publish.json` dan `n8n/refresh-ig-token.json` adalah **hasil build**,
bukan sumber. Sumbernya di `n8n/src/`: `build.mjs` plus tiap Code node sebagai berkas
`.js` sendiri, prompt, dan badan e-mail. Menyunting JSON-nya langsung akan tertimpa
pada build berikutnya.

```bash
node n8n/src/build.mjs n8n/portofolio-publish.json
```

Satu perintah menghasilkan **empat** berkas: dua workflow × (versi placeholder untuk
git, versi `.local.json` bernilai asli yang di-gitignore).

```bash
node n8n/src/build.mjs n8n/portofolio-publish.json
node --test n8n/portofolio-publish.test.mjs
```

Build menghasilkan dua berkas (versi placeholder dan `.local.json`) dan menyisipkan dua
hal dari luar `n8n/src/`:

| Disisipkan | Dari | Ke |
|---|---|---|
| Profil voice | `docs/voice.md` | placeholder `{{VOICE}}` di `prompt-copy.txt` |
| Logo hexagon | `icons/icon-192.png` | placeholder `{{LOGO}}` di `rakit-slide.js`, sebagai data URI |

Keduanya disisipkan saat build supaya tidak ada salinan kedua yang diam-diam berbeda.
Ubah `docs/voice.md`, jalankan build, prompt ikut berubah.

Catatan soal `docs/voice.md`: **seluruh isinya** dikirim ke model. Tulis sebagai aturan
yang bisa diikuti, jangan sebagai catatan tentang berkasnya sendiri — dan jangan menulis
literal `{{VOICE}}` di dalamnya, karena itu menyisipkan ulang placeholder-nya.

Kalau workflow diubah lewat UI n8n, salin balik perubahannya ke `n8n/src/` — jangan cuma
men-download JSON-nya.
