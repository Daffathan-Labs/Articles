# Kredensial Instagram (carousel via Instagram API)

Hasil akhirnya dua field di node **`Kredensial`**:

| Field | Contoh |
|---|---|
| `ig_user_id` | `17841400000000000` |
| `ig_token` | `IGAA...` |

Sekitar 20 menit. **Tidak perlu App Review**, dan **tidak perlu Halaman Facebook**.

---

## Dua jalur Instagram API — pilih satu, jangan campur

Meta punya dua jalur yang **tidak saling kompatibel**. Ini sumber kebingungan
terbesar, karena hampir semua tutorial di internet memakai jalur yang satunya.

| | **Login Instagram** ← yang kita pakai | Login Facebook |
|---|---|---|
| Halaman Facebook | tidak perlu | wajib, dan IG harus tertaut ke sana |
| Host API | `graph.instagram.com` | `graph.facebook.com` |
| Izin | `instagram_business_*` | `instagram_basic`, `instagram_content_publish` |
| Umur token | 60 hari, **bisa diperpanjang** | 60 hari, atau abadi lewat System User |
| Business Manager | tidak perlu | perlu untuk token abadi |

Token dari satu jalur dibalas **`#190`** kalau ditembakkan ke host jalur lain.
Workflow ini memakai `graph.instagram.com` di keempat node IG-nya.

Jalur login Facebook baru perlu kalau nanti butuh hashtag search atau insights —
dua hal yang tidak dipakai pipeline ini.

---

## 0. Prasyarat

Akun Instagram harus bertipe **Business** atau **Creator** (bukan Personal).
Ubah di aplikasi: **Settings → Account type and tools → Switch to professional account**.

Halaman Facebook **tidak** diperlukan di jalur ini.

## 1. App dan izin

<https://developers.facebook.com/apps> → app kamu → **Kasus penggunaan → Instagram API**
→ **Penyiapan API dengan login Instagram**.

Buka **Izin dan fitur**, pastikan keempatnya ada:

- `instagram_business_basic`
- **`instagram_business_content_publish`** ← ini yang paling sering kelewat
- `instagram_business_manage_comments` *(opsional)*
- `instagram_business_manage_messages` *(opsional)*

Default setup cuma memberi tiga yang pertama tanpa `content_publish`, dan tanpa itu
`POST /media` dibalas `#10 permission`. **Token yang terlanjur dibuat tidak otomatis
mendapat izin baru** — tambahkan izinnya dulu, buat tokennya belakangan.

## 2. Peran Instagram Tester ← penyebab `Insufficient Developer Role`

Kalau "Tambahkan akun" di langkah 2 dashboard melempar

```
instagram.com/oauth/authorize/third_party/error/?message=Insufficient%20Developer%20Role
```

itu **bukan** soal tipe akun dan bukan soal izin. Akun IG-nya belum jadi tester di app.

1. Dashboard app → **Peran → Peran** → bagian **Instagram Tester** → **Tambahkan orang**
   → isi username IG (mis. `dafathan.v2`)
2. Buka <https://www.instagram.com/accounts/manage_access_tools/> —
   **login sebagai akun IG itu**, bukan akun lain di browser yang sama →
   tab **Undangan penguji** → **Terima**
3. Balik ke dashboard → **Tambahkan akun** → lanjut

Penyebab paling umum kalau masih gagal: browser sedang login sebagai akun Instagram
yang berbeda dari yang diundang. Cek dulu di pojok kanan atas instagram.com.

## 3. Buat token dan ambil `ig_user_id`

Setelah akun tertambah, dashboard menampilkan tombol **Generate token**. Salin
tokennya — itu isi `ig_token`. Umurnya 60 hari sejak dibuat.

Lalu:

```bash
curl -G 'https://graph.instagram.com/v23.0/me' \
  -d fields=user_id,username,account_type \
  -d access_token=$IG_TOKEN
```

```json
{ "user_id": "17841400000000000", "username": "dafathan.v2", "account_type": "BUSINESS" }
```

`ig_user_id` = **`user_id`**, bukan `id`. Keduanya muncul di respons dan nilainya beda;
memakai `id` bikin semua panggilan berikutnya balas `#100 nonexisting field`.

Cek kuota harian (akun ini: **100 post per 24 jam**, terukur 2026-08-12 — angkanya
berbeda per akun, jangan berpatokan pada angka 50 yang beredar di dokumen lama):

```bash
curl -G "https://graph.instagram.com/v23.0/$IG_USER_ID/content_publishing_limit" \
  -d access_token=$IG_TOKEN
```

## 4. Perpanjang token sebelum 60 hari

Beda dari jalur login Facebook, token di sini bisa diperpanjang **tanpa OAuth ulang**:

```bash
curl -G 'https://graph.instagram.com/refresh_access_token' \
  -d grant_type=ig_refresh_token \
  -d access_token=$IG_TOKEN
```

Balasannya token baru dengan umur 60 hari lagi. Syaratnya token minimal berumur
24 jam dan **belum kedaluwarsa** — lewat dari itu harus ulang dari langkah 3.

Karena bisa dipanggil berulang, ini praktis bikin tokennya abadi. Pasang pengingat
kalender 50 hari, atau minta dibuatkan workflow n8n terjadwal yang memanggil endpoint
ini tiap bulan dan menulis hasilnya balik ke node `Kredensial`.

---

## Syarat gambar — ini yang paling sering menggagalkan posting

Meta **meng-cURL** URL gambar dari servernya sendiri saat container dibuat. Jadi:

| Syarat | Kenapa |
|---|---|
| URL publik, balas **200 tanpa redirect** | satu `Location:` saja membuat pembuatan container gagal |
| **JPEG betulan** | PNG yang sekadar dinamai `.jpg` ditolak — Meta memeriksa isi file, bukan ekstensi |
| Rasio 4:5 sampai 1.91:1 | slide 1080×1350 = 0.8, tepat di batas bawah |
| Semua anak carousel serasio | makanya `Jadi JPEG` di-set 1080×1350, bukan 1080×1080 |
| Maksimal 8 MB per gambar | q85 dari render-svc jauh di bawah ini |

render-svc sudah memenuhi semuanya. Cek sebelum posting pertama:

```bash
curl -I https://<render>/a/portofolio/<code>/01.jpg
```

Harus `200` + `Content-Type: image/jpeg`, **tanpa** baris `Location:`, tanpa auth.

## Alur carousel yang dipakai workflow

```
POST graph.instagram.com/v23.0/{ig_user_id}/media          image_url=<slide>, is_carousel_item=true   ×5
POST graph.instagram.com/v23.0/{ig_user_id}/media          media_type=CAROUSEL, children=<id1,…,id5>, caption=…
POST graph.instagram.com/v23.0/{ig_user_id}/media_publish  creation_id=<id carousel>
GET  graph.instagram.com/v23.0/{id}?fields=permalink
```

Semua parameter dikirim sebagai **form body**, bukan query string: caption berisi
baris baru, emoji, dan URL, dan encoding query string untuk isi seperti itu gagalnya
cuma sesekali — jenis bug yang paling susah dilacak.

Batas: carousel 2–10 item, kuota post per 24 jam sesuai
`content_publishing_limit` (akun ini 100), container kedaluwarsa 24 jam kalau
tidak di-publish.

## Tabel error

| Kode / pesan | Artinya |
|---|---|
| `Insufficient Developer Role` | akun IG belum jadi Instagram Tester, atau undangannya belum diterima — langkah 2 |
| `#10` `permission` | `instagram_business_content_publish` tidak ada di token. Tambah izin, lalu **buat ulang token** |
| `#190` | token kedaluwarsa/dicabut — **atau** token jalur login Instagram ditembakkan ke `graph.facebook.com` |
| `#100` `nonexisting field` | `ig_user_id` salah; kemungkinan terisi `id` padahal harus `user_id` |
| `#9004` `Media could not be fetched` | URL tidak bisa diambil Meta: ada redirect, butuh auth, atau belum publik |
| `#2207026` `Unsupported format` | bukan JPEG asli, atau rasio di luar 4:5–1.91:1 |
| `#4` / `#17` | kena rate limit, tunggu |

Tautan di caption Instagram **tidak bisa diklik**. Karena itu slide terakhir carousel
selalu mencetak URL artikel sebagai teks, dan caption menutup dengan
`Baca lengkapnya: <url>` — dua-duanya harus diketik ulang pembaca, jadi URL-nya
sengaja ditampilkan utuh tanpa dipendekkan.
