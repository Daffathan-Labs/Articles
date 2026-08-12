# Kredensial LinkedIn (posting ke profil pribadi)

Hasil akhirnya tiga field di node **`Kredensial`** dalam workflow n8n:

| Field | Nilai |
|---|---|
| `linkedin_token` | `AQXh...` — token panjang, **jangan pernah masuk ke repo yang publik** |
| `linkedin_urn` | `urn:li:person:B1oVXChp7v` |
| `linkedin_version` | `202607` |

Sekitar 20 menit, sekali jalan. Tidak ada App Review — semua produk yang dipakai
di sini sifatnya self-serve.

**Status:** app sudah jadi, produk sudah aktif, dan person URN di atas sudah terverifikasi
lewat `/v2/userinfo`. `initializeUpload` sudah dites membalas `200`, yang membuktikan
`w_member_social` benar-benar ada di scope token. Yang tersisa cuma menempelkan token
ke env n8n. Langkah 1–4 di bawah ini disimpan untuk saat token perlu dibuat ulang.

---

## 1. Bikin app

Buka <https://www.linkedin.com/developers/apps> → **Create app**.

Isian yang tidak jelas:

- **LinkedIn Page** — wajib diisi walaupun kita mem-posting ke profil pribadi.
  App LinkedIn harus dimiliki oleh sebuah Page. Kalau belum punya, bikin Page kosong
  dulu (`Daffathan Labs`) dan pakai itu. Page ini tidak akan menerima post apa pun.
- **App logo** — wajib ada, ukuran bebas.

Setelah app jadi, buka tab **Settings** → **Verify** dan klik tombol verifikasi.
Sebelum diverifikasi, produk di langkah berikutnya tidak bisa ditambahkan.

## 2. Tambah dua produk

Tab **Products**, request keduanya:

| Produk | Yang diberikan | Buat apa |
|---|---|---|
| **Sign In with LinkedIn using OpenID Connect** | scope `openid`, `profile`, `email` | ambil `sub` untuk menyusun person URN |
| **Share on LinkedIn** | scope `w_member_social` | izin mem-posting |

Keduanya auto-approve, biasanya aktif dalam hitungan detik sampai beberapa menit.
Tanpa **Share on LinkedIn**, `w_member_social` tidak muncul di daftar scope dan
`POST /rest/posts` akan membalas 403 walaupun token-nya valid.

## 3. Ambil access token

### Cara cepat — Token Generator (dipakai untuk ini)

<https://www.linkedin.com/developers/tools/oauth/token-generator>

Pilih app → centang `openid`, `profile`, `w_member_social` → **Request access token**.
Token muncul langsung. Tidak perlu redirect URI, tidak perlu menulis kode OAuth.

Ini cukup karena kita hanya butuh token untuk satu akun: akun sendiri.

### Cara panjang — OAuth manual

Perlu kalau nanti ingin merefresh otomatis. Tambahkan redirect URI di tab **Auth**
(`http://localhost:8080/callback` diterima LinkedIn), lalu:

```bash
# 1. buka di browser, login, salin ?code= dari URL balikan
https://www.linkedin.com/oauth/v2/authorization\
?response_type=code&client_id=<CLIENT_ID>\
&redirect_uri=http://localhost:8080/callback\
&state=xyz&scope=openid%20profile%20w_member_social

# 2. tukar code jadi token
curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
  -d grant_type=authorization_code \
  -d code=<CODE> \
  -d client_id=<CLIENT_ID> \
  -d client_secret=<CLIENT_SECRET> \
  -d redirect_uri=http://localhost:8080/callback
```

Balasannya berisi `access_token` dan `expires_in: 5184000` (60 hari).

## 4. Ambil person URN

```bash
curl -H "Authorization: Bearer <TOKEN>" https://api.linkedin.com/v2/userinfo
```

```json
{ "sub": "B1oVXChp7v", "name": "Daffa Fathan", "email": "..." }
```

`LINKEDIN_PERSON_URN` = `urn:li:person:` + nilai `sub` → **`urn:li:person:B1oVXChp7v`**.
Tulis lengkap dengan prefiks — workflow memakainya apa adanya, tidak menambahkan
prefiks sendiri.

Nilai ini tidak pernah berubah, bahkan kalau token dibuat ulang. Sudah diambil, tinggal
dipakai.

## 5. Verifikasi sebelum dipakai workflow

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST 'https://api.linkedin.com/rest/images?action=initializeUpload' \
  -H "Authorization: Bearer $LINKEDIN_ACCESS_TOKEN" \
  -H 'LinkedIn-Version: 202607' \
  -H 'X-Restli-Protocol-Version: 2.0.0' \
  -H 'Content-Type: application/json' \
  -d '{"initializeUploadRequest":{"owner":"urn:li:person:B1oVXChp7v"}}'
```

`200` = semuanya benar. Ini memesan slot upload yang tidak dipakai — tidak ada
yang tayang, aman diulang berkali-kali.

---

## Versi API kedaluwarsa tiap ~12 bulan

Ini jebakan kedua, dan gejalanya terlihat seperti masalah izin padahal bukan.

LinkedIn hanya menjaga sekitar 12 bulan versi API. Header `LinkedIn-Version` yang lewat
dibalas **426 `NONEXISTENT_VERSION`** — mendadak, tanpa ada yang diubah di workflow.
Versi `202411` yang beredar di banyak contoh di internet sudah mati.

**Jendela aktif per 2026-08-12: `202508` sampai `202607`.** Nilainya ada di field
`linkedin_version` pada node `Kredensial` dan dipakai bersama oleh kedua node LinkedIn,
jadi tidak mungkin keduanya jadi beda versi — kalau beda, `initializeUpload` berhasil
tapi `/rest/posts` gagal 426, dan kegagalan separuh jalan seperti itu yang paling susah
dilacak.

Cari versi yang masih hidup dengan menyapu beberapa bulan:

```bash
for V in 202608 202611 202702 202705; do
  printf '%s -> %s\n' "$V" "$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST 'https://api.linkedin.com/rest/images?action=initializeUpload' \
    -H "Authorization: Bearer $LINKEDIN_ACCESS_TOKEN" -H "LinkedIn-Version: $V" \
    -H 'X-Restli-Protocol-Version: 2.0.0' -H 'Content-Type: application/json' \
    -d '{"initializeUploadRequest":{"owner":"urn:li:person:B1oVXChp7v"}}')"
done
```

Ambil `200` yang paling baru, lalu isi `linkedin_version` di node `Kredensial`.

---

## Token kedaluwarsa 60 hari

Ini bagian yang paling sering bikin kaget: posting mendadak gagal 2 bulan setelah
setup dan tidak ada yang berubah.

**Refresh token tidak diberikan secara default.** LinkedIn hanya memberikannya ke app
yang sudah disetujui untuk itu, dan persetujuan itu terpisah dari kedua produk di atas.
Selama belum dapat, satu-satunya jalan adalah mengulang langkah 3 tiap ~60 hari dan
memperbarui `LINKEDIN_ACCESS_TOKEN` di n8n.

Pasang pengingat kalender 55 hari dari tanggal pembuatan token. Gejalanya kalau lupa:
e-mail hasil dari workflow menulis `LinkedIn: GAGAL` dengan status 401, sementara
Instagram tetap terbit — kedua cabang memang sengaja dibuat tidak saling menjatuhkan.

Cara menggantinya: ulangi langkah 3, lalu tempel token baru ke field `linkedin_token`
di node `Kredensial`. Satu tempat, tidak perlu restart n8n.

## Tabel error

| Status | Isi | Artinya |
|---|---|---|
| 401 | `Invalid access token` | token kedaluwarsa (60 hari) atau salah salin |
| 403 | `ACCESS_DENIED ... POST /rest/posts` | produk **Share on LinkedIn** belum aktif, atau token dibuat sebelum produk ditambahkan — buat ulang token |
| 400 | `owner is required` | `LINKEDIN_PERSON_URN` kosong atau tanpa prefiks `urn:li:person:` |
| 426 | `NONEXISTENT_VERSION` | versi API sudah kedaluwarsa — lihat bagian di atas. **Bukan** masalah izin |
| 426 | `Upgrade Required` | header `LinkedIn-Version` hilang sama sekali |
| 422 | `unprocessable entity` | format `LinkedIn-Version` salah; harus `YYYYMM` |

Setelah menambah produk baru, **token lama tidak otomatis mendapat scope baru.**
Selalu buat ulang token setelah mengubah daftar produk.

## Yang dilakukan workflow

`Approve?` → 4 langkah, semuanya `n8n-nodes-base.httpRequest`:

1. `POST /rest/images?action=initializeUpload` dengan `owner` = person URN → `uploadUrl` + `image` URN
2. `GET` slide `01.jpg` dari render-svc sebagai binary
3. `PUT` binary itu ke `uploadUrl`
4. `POST /rest/posts` dengan `author` = person URN, `commentary` = caption EN, `content.media.id` = image URN

Satu gambar (slide hook), bukan carousel. LinkedIn punya `content.multiImage` untuk
multi-gambar — belum dipakai; tambahkan kalau nanti terlihat lebih berhasil.
