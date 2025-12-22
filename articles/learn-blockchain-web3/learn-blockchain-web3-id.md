<!-- title: Belajar Web3 dengan Cara yang Tidak Mudah — Dari Idealisme Blockchain ke Arsitektur Hybrid yang Masuk Akal -->
<!-- excerpt: Sebuah perjalanan belajar Web3 dan blockchain lewat praktik langsung — dimulai dari idealisme, bertemu friksi dunia nyata, dan berakhir pada arsitektur hybrid Web2 + Web3 yang benar-benar bisa dipakai. -->
<!-- image: https://github.com/user-attachments/assets/e90bea80-ded7-4e5a-8022-7a39419ab573 -->
<!-- date: 2025-12-23 -->
<!-- posting_date: 2025-12-23 -->
<!-- tags: Web3, Blockchain, Hybrid Architecture, Backend, Smart Contract, System Design -->

# 🔗 Belajar Web3 dengan Cara yang Tidak Mudah — Dari Idealisme ke Arsitektur Hybrid yang Benar-Benar Bekerja

Hari ini bukan soal mengejar buzzword.  
Hari ini soal **memahami realita**.

Aku tidak memulai hari ini dengan niat menulis artikel.  
Aku hanya ingin **belajar Web3 dan blockchain dengan benar** — bukan dari teori, tapi dari membangun sesuatu yang nyata.

Yang aku temukan bukan sekadar cara kerja blockchain.  
Aku belajar **di mana blockchain masuk akal, di mana tidak, dan kenapa sistem hybrid itu ada**.

Tulisan ini adalah refleksi dari proses belajar tersebut.

---

## 🧠 Titik Awal: “Bagaimana Kalau Kita Bikin Voting Berbasis Web3?”

<img width="1139" height="732" alt="image" src="https://github.com/user-attachments/assets/a430a03e-11e4-49b7-ab29-1b6fbdf02a24" />  

Ide awalnya sangat sederhana:

> “Bagaimana kalau sistem voting (RT / OSIS) pakai blockchain supaya tidak bisa dimanipulasi?”

Jawaban awalnya terasa jelas:
- smart contract untuk voting,
- autentikasi berbasis wallet,
- satu address, satu suara.

Lalu aku membangunnya.

**Web3 murni. Blockchain murni. Idealisme murni.**

Repository:
- https://github.com/daffa09/web3-vote

Dan secara teknis?  
Itu **berjalan**.

---

## 🧱 Realita Pertama: Web3 Itu Bukan Gratis, Hanya Terabstraksi

Tidak butuh waktu lama sampai realita muncul.

Bahkan di testnet, aku harus benar-benar paham:
- RPC provider,
- private key,
- wallet deployer,
- gas fee,
- reset state network,
- mismatch ABI,
- error BigInt saat serialisasi.

Ini jelas **tidak ramah pemula** — dan itu tidak masalah.

Tapi ada satu pertanyaan yang lebih penting:

> “Apakah setiap pemilih benar-benar perlu punya wallet?”

Untuk developer, iya.  
Untuk anggota DAO, iya.  
Untuk komunitas crypto-native, tentu saja.

Tapi untuk:
- warga RT,
- siswa,
- pengguna non-teknis?

**Tidak. Dan memaksakan itu justru tidak jujur.**

---

## 🔥 Realita Kedua: UX Web3 vs UX Dunia Nyata

Pendekatan Web3 murni berarti:
- setiap vote adalah transaksi,
- setiap transaksi butuh wallet,
- setiap wallet butuh setup,
- setiap setup menambah friksi.

Ini bukan masalah teknis.  
Ini **masalah manusia**.

Di titik inilah proses belajar sebenarnya dimulai.

---

## 🔄 Pivot: Dari “Web3 di Mana-Mana” ke “Web3 di Tempat yang Tepat”

Alih-alih bertanya:

> “Bagaimana caranya memaksa user masuk ke Web3?”

Aku mulai bertanya:

> “Di bagian mana blockchain benar-benar memberi nilai?”

Jawabannya jelas:
- immutability,
- auditability,
- transparansi,
- ketahanan terhadap manipulasi.

**Bukan autentikasi. Bukan UX. Bukan form input.**

Kesadaran ini memaksa desain sistem untuk berubah.

---

## 🧩 Model Hybrid: UX Web2, Trust Web3

<img width="1223" height="781" alt="image" src="https://github.com/user-attachments/assets/e90bea80-ded7-4e5a-8022-7a39419ab573" />  

Aku membangun ulang sistemnya dengan **arsitektur hybrid**.

Repository:
- https://github.com/daffa09/web3-hybrid-vote

Model barunya:
```
User (Form Web Biasa)
->
Backend Server (Node.js)
->
Smart Contract (Blockchain)
```


Keputusan desain utama:
- user TIDAK perlu wallet,
- user TIDAK melihat MetaMask,
- user TIDAK membayar gas,
- backend menandatangani transaksi dengan wallet admin,
- blockchain tetap menjadi sumber kebenaran.

Pendekatan ini sering disebut:
- gasless transaction,
- relayed transaction,
- hybrid Web2 + Web3.

Dan ya — **inilah cara banyak sistem nyata dibangun**.

---

## ⚖️ Trade-off (Dan Kenapa Itu Masuk Akal)

Pendekatan ini memang tidak “terdesentralisasi sempurna”.

Dan itu tidak apa-apa.

Yang didapat:
- UX realistis,
- aksesibilitas lebih luas,
- beban kognitif lebih rendah,
- peluang adopsi yang lebih masuk akal.

Yang diterima:
- backend yang dipercaya,
- tanggung jawab operasional,
- biaya gas ditanggung sistem, bukan user.

Untuk sistem voting di lingkungan non-crypto-native,  
**trade-off ini sangat masuk akal**.

Engineering bukan soal ideologi.  
Engineering adalah **memilih kompromi yang tepat**.

---

## 💸 Pelajaran Penting: “Tanpa Wallet” ≠ “Tanpa Biaya”

Salah satu pelajaran paling penting hari ini:

> Menghilangkan wallet dari user TIDAK menghilangkan gas fee.

Yang terjadi hanyalah **perpindahan tanggung jawab**:
- dari user,
- ke sistem.

Komputasi di blockchain tidak pernah gratis.  
Ia hanya **diabstraksikan dengan cara berbeda**.

Hal ini memaksa desain sistem yang lebih dewasa:
- rate limiting,
- manajemen kuota,
- pemilihan network (L2 vs mainnet),
- monitoring biaya.

Ini adalah **masalah dunia nyata**, bukan masalah tutorial.

---

## 🧠 Apa yang Aku Pelajari Tentang Web3

Web3 bukan:
- pengganti Web2,
- solusi semua masalah,
- jawaban untuk UX.

Web3 adalah:
- lapisan kepercayaan,
- lapisan integritas,
- lapisan verifikasi.

Dan seperti lapisan lain:
> **Ia harus digunakan dengan sengaja, bukan di semua tempat.**

---

## 🧭 Refleksi Akhir

Pembelajaran hari ini bukan soal menulis Solidity.  
Bukan soal Hardhat atau ethers.js.

Ini tentang **cara berpikir sistem**.

Memahami:
- di mana desentralisasi membantu,
- di mana justru menyulitkan,
- dan bagaimana merancang sistem yang benar-benar bisa dipakai manusia.

Web3 murni mengajarkanku aturannya.  
Hybrid Web2 + Web3 mengajarkanku **pertimbangan engineering**.

Dan perbedaan itu sangat penting.

---

## 🧾 Penutup

Kalau harus dirangkum dalam satu kalimat:

> **Web3 itu kuat — tapi hanya jika dipadukan dengan kerendahan hati dan pragmatisme.**

Aku tidak meninggalkan Web3.  
Aku belajar **menggunakannya secara bertanggung jawab**.

Dan itu jauh lebih berharga daripada sekadar ikut arus “fully decentralized”.

Perjalanan ini belum selesai.  
Tapi hari ini, semuanya akhirnya **masuk akal**.
