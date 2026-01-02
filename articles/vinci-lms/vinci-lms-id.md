<!-- title: Dari GitHub Classroom ke Vinci LMS — Evolusi Sunyi Praktikum Pemrograman -->
<!-- excerpt: Catatan reflektif tentang kenapa Vinci LMS lahir, berangkat dari keterbatasan GitHub Classroom, solusi pragmatis via Telegram + shell script, hingga kebutuhan sistem akademik yang benar-benar terstruktur. -->
<!-- image: https://github.com/user-attachments/assets/vinci-lms-cover-placeholder -->
<!-- date: 2026-01-02 -->
<!-- posting_date: 2026-01-02 -->
<!-- tags: Vinci LMS, GitHub Classroom, Education Technology, Software Engineering, Academic DevOps -->

# 🎓 Dari GitHub Classroom ke Vinci LMS  
## Evolusi Sunyi Praktikum Pemrograman

<img width="6546" height="3676" alt="image" src="https://github.com/user-attachments/assets/vinci-lms-cover-placeholder" />

Vinci LMS **tidak lahir dari ambisi besar**.  
Ia lahir dari **masalah teknis kecil yang terus berulang setiap semester**, sampai akhirnya tidak masuk akal lagi jika diselesaikan dengan cara manual.

Awalnya hanya ingin rapi.  
Lalu ingin konsisten.  
Dan akhirnya sadar:

> **Ini bukan soal tools. Ini soal sistem.**

---

## 🧩 Titik Awal: GitHub Classroom (Secara Konsep Sudah Benar)

Secara konsep, **GitHub Classroom itu tidak salah**.

Ia memberi:
- repository per mahasiswa  
- integrasi native dengan GitHub  
- workflow yang *developer-first*  

Untuk praktikum pemrograman, ini fondasi yang tepat.

Masalahnya bukan di fitur utama.  
Masalahnya muncul di **detail operasional** — hal-hal kecil yang terlihat sepele, tapi menjadi fatal saat jumlah kelas dan mahasiswa bertambah.

---

## ⚠️ Masalah Nyata: Penamaan Repository Tidak Seragam

Satu masalah klasik tapi krusial:

> **Penamaan repository GitHub Classroom tidak benar-benar seragam.**

Di lapangan:
- mahasiswa mengganti nama repo sendiri  
- typo antar repo  
- suffix tambahan yang tidak konsisten  
- format berbeda antar kelas & semester  

Akibatnya:
- script rekap tidak bisa langsung jalan  
- asisten praktikum harus cek manual  
- automation analisis commit jadi rapuh  
- tracking pengumpulan tugas tidak deterministik  

Di titik ini, GitHub Classroom **kehilangan sifat yang paling dibutuhkan sistem akademik**:  
**konsistensi dan keterbacaan data.**

---

## 📩 Peran Telegram (Bukan untuk Diskusi)

Telegram **tidak pernah dimaksudkan sebagai LMS**  
dan **tidak dipakai untuk diskusi akademik**.

Perannya sangat spesifik dan terbatas:

- 🔧 **Rename repository**
- 📦 **Rekap pengumpulan tugas**

Telegram dipakai karena:
- cepat  
- real-time  
- semua pihak sudah familiar  

Bukan karena ideal.  
Tapi karena **praktis untuk menutup celah yang tidak disediakan GitHub Classroom**.

---

## 🧪 Solusi Teknis Sementara: Shell Script

Karena tidak ada solusi resmi, maka muncullah solusi khas engineer:

- shell script custom
- untuk:
  - rename repo secara massal
  - normalisasi format nama
  - generate rekap submission

Script ini **bekerja**.  
Bahkan sangat membantu.

Namun muncul satu kesadaran penting:

> *“Kalau tiap semester butuh script tambahan, berarti sistemnya memang belum selesai.”*

Shell script adalah **penolong**,  
tapi juga **alarm** bahwa ada problem struktural.

---

## 🚨 Titik Patah: Saat Workaround Jadi Beban

Awalnya:
- 1 kelas → masih aman  
- 2 kelas → masih bisa dipegang  
- banyak kelas paralel → mulai chaos  

Yang terjadi:
- script makin kompleks  
- edge case makin banyak  
- dependensi ke manusia tetap tinggi  
- dokumentasi sulit diwariskan  

Di titik ini jelas:

> **Workaround tidak bisa diskalakan.  
> Sistem harus dibangun.**

---

## 🧠 Lahirnya Vinci LMS

Vinci LMS **tidak dibuat untuk menggantikan GitHub Classroom**.

Justru sebaliknya:

> **Vinci LMS adalah lapisan sistem di atas GitHub Classroom.**

Fungsinya:
- menormalkan data
- membaca repository secara konsisten
- menghilangkan kebutuhan script ad-hoc
- memindahkan chaos operasional ke sistem yang repeatable & auditable

---

## 🏗️ Filosofi Dasar Vinci LMS

### 1️⃣ GitHub Tetap Tempat Mahasiswa Ngoding
- tidak ada editor buatan  
- tidak ada sandbox palsu  
- real-world tooling tetap dipakai  

---

### 2️⃣ Vinci Mengurus Hal yang GitHub Classroom Abaikan
- struktur akademik  
- konsistensi data  
- rekap otomatis  
- statistik yang bisa dipertanggungjawabkan  

---

### 3️⃣ Tidak Ada Lagi Script “Heroik”
- tidak bergantung ke satu orang  
- tidak ada magic command tanpa konteks  
- semua proses terdokumentasi dan sistematis  

---

## 📊 Dari Rekap ke Insight

Awalnya hanya ingin:
- repo rapi  
- rekap jalan  

Namun setelah data konsisten, muncul pertanyaan yang lebih penting:

- siapa yang benar-benar konsisten belajar?  
- siapa yang hanya submit di akhir?  
- siapa yang progresnya stagnan?  

Di sinilah Vinci LMS berkembang:  
dari **alat rekap**, menjadi **alat observasi akademik**.

---

# 🧩 Fitur & Role Vinci LMS

## 👥 Role Pengguna

### 🟢 Admin / Koordinator Praktikum  
**Pemegang kendali sistem**

- manage tahun ajaran & semester  
- manage kelas & pertemuan  
- import roster mahasiswa (CSV)  
- mapping NIM ↔ GitHub username  
- lihat semua repo & nilai  
- audit log aktivitas  
- export nilai (CSV / Excel)  

---

### 🟡 Dosen  
**Decision maker akademik**

- lihat repo mahasiswa per kelas  
- lihat status submit & keterlambatan  
- input & finalisasi nilai  
- lihat rekap nilai  
- export nilai  
- tanya AI agent (hanya data kelasnya sendiri)  

---

### 🔵 Asisten Praktikum  
**Operator teknis**

- rename repo (kelas / pertemuan tertentu)  
- clone repo  
- cek status submission  
- input nilai (opsional)  

Batasan:
- ❌ tidak bisa finalisasi nilai  
- ❌ tidak bisa manage kelas global  

---

## 🧩 Fitur Utama

### 1️⃣ User & Permission System
- GitHub OAuth  
- Role-Based Access Control (RBAC)  

➡️ Aman & akuntabel  

---

### 2️⃣ Roster & Kelas Management
- import roster CSV  
- multi kelas & multi semester  
- deteksi mahasiswa belum join / repo belum ada  

➡️ Hilangkan kerja manual  

---

### 3️⃣ Repository Management (CORE)
- rename repo (bulk & per kelas)  
- clone repo  
- archive / lock repo  
- status repo (normal / error / missing)  

➡️ Pain utama GitHub Classroom  

---

### 4️⃣ Assignment & Pertemuan
- setup pertemuan (1–14, tubes, UTS/UAS)  
- deadline internal  
- auto-detect telat (last commit)  

➡️ Dosen tidak cek repo satu-satu  

---

### 5️⃣ Grading & Rekap Nilai
- input nilai  
- feedback (opsional)  
- rekap nilai per kelas & mahasiswa  
- export CSV / Excel  

➡️ Fitur paling “dibayar” kampus  

---

### 6️⃣ Activity Log & Audit
- siapa melakukan apa  
- kapan  
- ke repo siapa  

➡️ Aman untuk akreditasi & konflik nilai  

---

### 7️⃣ 🤖 AI Agent (Asisten Sistem)
Bisa:
- jawab pertanyaan dosen / asprak / admin  
- rekap data kelas & nilai  
- jelaskan error repo & submission  
-  rename repo  
- hapus data  
- finalisasi nilai
- dan banyak lagi...  

---

### 8️⃣ 📊 Student Coding Analytics
Analitik per mahasiswa berbasis commit & struktur kode:

- pola commit  
- konsistensi pengerjaan  
- evolusi solusi  
- gaya & struktur koding  
- indikasi AI-generated code (heuristic, non-hukuman)  

Digunakan untuk:
- deteksi kebutuhan bimbingan  
- refleksi dosen  
- evaluasi metode praktikum  

---

## 🎯 Kenapa LMS Biasa Tidak Cukup

LMS konvensional:
- fokus file  
- fokus deadline  

Praktikum pemrograman:
- hidup dari proses  
- hidup dari iterasi  
- hidup dari error  

Dua dunia ini **butuh jembatan**.

---

## 🌱 Penutup

Telegram + shell script **bukan kesalahan**.  
Itu solusi engineer yang realistis.

Namun ketika solusi sementara:
- dipakai terus  
- diwariskan antar semester  
- jadi dependensi utama  

Maka itu bukan lagi solusi.

**Vinci LMS lahir untuk menghentikan siklus workaround**  
dan memberikan praktikum pemrograman **sistem yang layak, rapi, dan bisa dipertanggungjawabkan**.

Bukan karena ingin kompleks.  
Tapi karena **realita menuntutnya**.
