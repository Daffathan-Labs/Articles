<!-- title: Membangun Book Agent dengan n8n — Dari Mengajar ke Praktik Nyata -->
<!-- excerpt: Catatan praktik membangun Book Agent berbasis AI menggunakan n8n — dari pengalaman mengajar, desain agent, sub-workflow, hingga pembelajaran dari constraint dunia nyata. -->
<!-- image: https://github.com/user-attachments/assets/22b1ab90-01c8-4b30-a376-2e2c6762376a -->
<!-- date: 2025-12-18 -->
<!-- posting_date: 2025-12-18 -->
<!-- tags: n8n, AI Agent, Book Agent, Workflow Automation, DevOps, System Design -->

# 📚 Membangun Book Agent dengan n8n — Dari Mengajar ke Praktik Nyata

<img width="1537" height="825" alt="image" src="https://github.com/user-attachments/assets/22b1ab90-01c8-4b30-a376-2e2c6762376a" />

Sebelumnya, saat bekerja sebagai mentor, aku sempat **mengajarkan n8n** kepada beberapa mentee. Fokusnya lebih ke konsep dasar: cara kerja workflow, alur automasi, dan bagaimana n8n bisa digunakan untuk menghubungkan berbagai sistem.

Namun jika harus jujur, pada fase tersebut aku **belum benar-benar menggunakan n8n secara langsung di proyek nyata**. Pemahaman yang ada masih berada di level teori — cukup untuk menjelaskan, tapi belum cukup untuk merasakan kompleksitas dunia nyata.

Semua itu berubah ketika aku mulai membangun sebuah use case konkret: **Book Agent**.

---

## 🎯 Apa Itu Book Agent?

**Book Agent** adalah AI Agent yang dirancang untuk:
- menerima pertanyaan user tentang buku,
- memahami konteks dan intent,
- mengambil data dari database (melalui SQL Agent),
- lalu menyusun jawaban yang relevan dan kontekstual.

Di atas kertas, konsep ini terlihat sederhana. Namun ketika mulai dibangun, aku menyadari bahwa tantangan utamanya **bukan di AI**, melainkan di **desain sistem dan orkestrasi workflow**.

---

## 🧠 Dari Mengajar ke Praktik: Cara Pandang yang Berubah

Saat mulai menggunakan n8n secara hands-on, satu hal langsung terasa:  
**n8n bukan sekadar no-code tool.**

n8n memaksa penggunanya untuk berpikir sistem:
- dari mana input datang,
- bagaimana data diproses,
- kapan logic harus dipisah,
- dan bagaimana error ditangani.

Setiap node bukan hanya “langkah”, tapi bagian dari sistem yang harus punya tanggung jawab jelas.

Di titik ini, pemahaman yang sebelumnya hanya konseptual mulai benar-benar terbentuk.

---

## 🧩 Desain Sistem Book Agent

Dalam Book Agent, aku memisahkan peran antar komponen:
```
User Input ->
Book Agent (Conversation & Context) ->
SQL Agent (Query & Data) ->
Book Agent (Response Composition)
```


Pemisahan ini penting agar:
- logic tetap sederhana,
- sistem mudah dikembangkan,
- dan workflow tetap readable.

Sub-workflow di n8n berperan besar di sini. Bukan sekadar fitur tambahan, tapi fondasi untuk membangun sistem yang modular dan scalable.

---

## ⚙️ n8n, DevOps Mindset, dan Fast Delivery

Sebagai seseorang yang menyukai **DevOps**, aku terbiasa melihat sistem sebagai kumpulan komponen kecil yang saling terhubung. Cara kerja n8n sangat selaras dengan pola pikir ini.

Setiap workflow bisa diperlakukan sebagai unit sistem:
- punya input yang jelas,
- proses yang eksplisit,
- dan output yang terkontrol.

Hal lain yang membuat n8n menarik bagiku adalah **kemampuannya mendukung fast delivery**. Banyak ide bisa langsung diuji tanpa perlu membangun service baru atau boilerplate berlebihan. Fokusnya langsung ke value.

---

## 🚧 Belajar dari Constraint Dunia Nyata

Saat Book Agent mulai diuji lebih jauh, berbagai constraint mulai muncul.

### 1. Limit Model AI Gratis
Model AI free-tier memiliki batasan harian. Ini memaksaku berpikir ulang:
- tidak semua langkah perlu AI,
- AI Agent harus dipakai secara strategis,
- workflow harus efisien.

### 2. Kebijakan Platform (WhatsApp Business API)
Secara teknis, workflow n8n berjalan dengan baik. Namun kebijakan platform — seperti pembatasan lintas negara pada nomor testing — membuat sistem tidak bisa langsung digunakan secara operasional.

Di sini aku belajar bahwa:
> **berhasil secara teknis tidak selalu berarti berhasil secara operasional.**

### 3. Integrasi Antar Agent
Menghubungkan Book Agent dengan SQL Agent tidak bisa asal sambung. Dibutuhkan kontrak data yang jelas:
- struktur input,
- format output,
- dan ekspektasi respons.

Banyak kegagalan justru bukan karena AI-nya, tapi karena alur data yang tidak konsisten.

---

## 🧾 Pelajaran Penting

Dari seluruh proses ini, satu hal menjadi semakin jelas:

> **Mengajarkan sebuah tool dan menggunakannya secara langsung adalah dua hal yang sangat berbeda.**

Pemahaman yang matang justru terbentuk saat berhadapan dengan:
- constraint nyata,
- error yang tidak eksplisit,
- dan kebutuhan desain sistem yang realistis.

Sekarang, n8n bukan lagi sekadar tool yang pernah aku ajarkan, tetapi alat yang aku gunakan, aku pahami batasannya, dan aku tahu kapan tepat untuk memakainya.

---

## 🚀 Penutup

Membangun Book Agent dengan n8n mengajarkanku bahwa:
- sistem yang baik bukan yang paling kompleks,
- tapi yang **paling jelas alurnya**,
- **paling sederhana desainnya**,
- dan **paling cepat mengirimkan value**.

Bagi aku, pembelajaran dari praktik nyata seperti ini jauh lebih berharga daripada sekadar memahami teori.

