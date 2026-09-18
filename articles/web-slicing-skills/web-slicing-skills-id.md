<!-- title: web-slicing-skills — Slicing UI 1:1 buat Claude Code, Playwright Udah Nempel -->
<!-- excerpt: Dua skill Claude Code buat slicing UI web dan mobile 1:1 dari mockup, sekarang jadi plugin publik. Playwright kepasang otomatis, tanpa langkah manual setelah install. -->
<!-- date: 2026-09-18 -->
<!-- posting_date: 2026-09-18 -->
<!-- tags: Claude Code, Playwright, Plugin, Frontend, Developer Tools -->

# 🔪 web-slicing-skills
## Slicing UI 1:1, Playwright Udah Nempel

Nyocokin UI ke mockup persis piksel biasanya kerjaan manual: buka DevTools, ukur satu-satu, bolak-balik bandingin screenshot sama mata sendiri. Dua skill ini aku bikin buat mindahin kerjaan itu ke Claude Code.

`/slice-web` buat website dan web app, termasuk tampilan mobile web. `/slice-mobile` buat Flutter, React Native/Expo, Android native, dan iOS native. Sumbernya bebas: URL, file HTML, gambar, atau MCP desain kayak Figma.

Cara kerjanya sama buat keduanya. Sumber diukur pakai Playwright: computed style, warna, jarak, semuanya dari hasil ukur, bukan tebakan. Hasil implementasinya ditumpuk di atas sumber pakai `mix-blend-mode: difference`. Hitam berarti cocok, terang berarti meleset. Diulang section per section sampai selisihnya tinggal noise tipis di tepi teks.

Aku publish jadi repo terpisah, publik, siap dipasang sebagai plugin Claude Code:
👉 [github.com/daffa09/web-slicing-skills](https://github.com/daffa09/web-slicing-skills)

## Pasang

Paling gampang, lewat plugin:

```
/plugin marketplace add daffa09/web-slicing-skills
/plugin install web-slicing-skills@web-slicing-skills
```

Playwright kepasang otomatis di sesi Claude Code pertama setelah install. Nggak perlu `npm install playwright` manual.

Mau nama pendek `/slice-web` dan `/slice-mobile` tanpa plugin? Copy folder `skills/slice-web` dan `skills/slice-mobile` dari repo ke `~/.claude/skills/`.

## Cara pakai

```
/slice-web https://contoh.com/pricing src/app/pricing/page.tsx
/slice-mobile ./mockup/onboarding.png OnboardingScreen
```

Sumber atau target kosong, ditanya sekali di awal. Setelah itu jalan sampai selesai tanpa nanya lagi, kecuali sumbernya memang nggak bisa dibuka.

## Yang dijaga

- Tiru persis, tanpa redesign, ganti teks, atau nambah-ngurang elemen.
- Tanpa dependency baru di project yang di-slice. Playwright jalan di folder terpisah, di luar repo target.
- Pakai komponen dan token yang udah ada di project, bukan bikin baru.

Detail lengkap tiap aturan dan langkah pengerjaannya ada di `SKILL.md` masing-masing skill, di repo-nya.
