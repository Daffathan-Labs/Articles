<!-- title: Learn MCP Works — Memahami Cara Kerja Model Context Protocol Lewat MCP Playground -->
<!-- excerpt: Artikel teknis yang membedah cara kerja MCP (Model Context Protocol) secara praktis menggunakan MCP Playground — dari UI, client, server, hingga tool execution. -->
<!-- image: https://github.com/user-attachments/assets/e270e31d-7fee-431a-b6b5-d086dee62f7d -->
<!-- date: 2025-12-16 -->
<!-- posting_date: 2025-12-16 -->
<!-- tags: MCP, Model Context Protocol, AI Agent, LLM, Developer, Playground -->

# 🧠 Learn MCP Works — Memahami MCP Lewat MCP Playground

<img width="1376" height="478" alt="image" src="https://github.com/user-attachments/assets/e270e31d-7fee-431a-b6b5-d086dee62f7d" />

**Model Context Protocol (MCP)** adalah standar komunikasi yang memungkinkan Large Language Model (LLM) **berinteraksi dengan dunia nyata** — seperti file system, tools, API, dan resource eksternal — secara **terstruktur, aman, dan dapat diaudit**.

Repo **mcp-playground** dibuat untuk satu tujuan utama:  
👉 **membuat MCP yang biasanya abstrak jadi kelihatan nyata dan bisa dicoba langsung**.

Ini bukan cuma dokumentasi teori MCP, tapi **simulasi end-to-end cara MCP bekerja di dunia nyata**.

---

## 🎯 Apa Itu MCP Playground?

**MCP Playground** adalah sandbox project yang mendemonstrasikan:

- bagaimana user input → dipahami LLM  
- bagaimana intent → dipetakan ke MCP tools  
- bagaimana MCP server → mengeksekusi tool  
- bagaimana hasil → dikembalikan ke UI  

Semua itu terjadi **tanpa LLM diberi akses langsung ke sistem**.

LLM **tidak bebas**.
Ia hanya boleh memanggil tool yang **terdaftar secara eksplisit**.

Dan di situlah kekuatan MCP.

---

## 🧩 Gambaran Arsitektur MCP Playground

Secara sederhana, alur sistemnya seperti ini:
```
User (Browser UI)
↓
MCP Client (Intent Resolver)
↓
MCP Server (Tool Registry)
↓
Workspace (Sandbox File System)
```

Setiap layer punya tanggung jawab jelas dan **tidak saling menembus batas**.

---

## 🖥️ 1. Browser UI (Frontend)

Bagian ini adalah **antarmuka interaksi manusia**.

Fungsinya:
- menerima input natural language
- menampilkan hasil eksekusi tool
- menampilkan jejak proses (tool calls)

UI **tidak tahu** cara kerja tool secara detail.  
UI hanya tahu: *kirim perintah → terima hasil*.

---

## 🧠 2. MCP Client — Penerjemah Intent

Di sinilah “kepintaran” awal terjadi.

Tugas MCP Client:
- menerima input teks user
- menentukan **tool MCP mana yang relevan**
- menyusun payload sesuai schema tool

Contoh:
```php
User: "Tampilkan semua file TypeScript"
Client akan menerjemahkan menjadi:
tool: list_files
args:
pattern: "*.ts"
```

⚠️ Penting:  
Client **tidak mengeksekusi apa pun** — hanya menerjemahkan niat.

---

## 🧰 3. MCP Server — Tool Registry & Executor

Ini adalah **jantung MCP**.

Server bertanggung jawab untuk:
- mendaftarkan tools MCP
- memvalidasi input
- mengeksekusi tool
- mengembalikan hasil secara terstruktur

LLM **tidak bisa sembarang ngakses sistem**.  
Ia hanya boleh memanggil tool yang sudah diregistrasi di server.

Contoh tools yang tersedia di playground:
- `read_file`
- `list_files`
- `search_files`
- `directory_tree`
- `file_metadata`
- `workspace_stats`

Semua tool:
- punya schema input
- punya batasan
- punya kontrol keamanan

---

## 📂 4. Workspace — Sandbox yang Aman

Workspace adalah **file system palsu yang dikontrol**.

Ciri pentingnya:
- hanya folder tertentu yang bisa diakses
- tidak bisa keluar dari sandbox
- ada batas ukuran file
- ada validasi path

Ini mencegah:
- directory traversal
- akses file sensitif
- perintah destruktif

Dengan kata lain:  
**LLM boleh baca, tapi tidak boleh liar.**

---

## 🔄 Contoh Alur Nyata

Prompt:
> “Cari kata `server` di semua file TypeScript.”

Alurnya:
1. UI kirim teks ke MCP Client  
2. Client memilih tool `search_files`  
3. Payload dikirim ke MCP Server  
4. Server validasi input  
5. Tool dieksekusi di workspace  
6. Hasil dikembalikan ke UI  

LLM **tidak pernah**:
- membaca file langsung
- mengeksekusi shell
- mengakses OS

Semua lewat MCP.

---

## 🛡️ Kenapa MCP Itu Penting?

Tanpa MCP:
- LLM = terlalu bebas
- susah diaudit
- rawan kebocoran data
- sulit diskalakan

Dengan MCP:
- tool usage eksplisit
- keamanan terkontrol
- log bisa ditelusuri
- arsitektur agent lebih rapi

MCP adalah **fondasi AI Agent yang serius**, bukan sekadar chatbot.

---

## 🚀 Kenapa MCP Playground Layak Dipelajari?

Karena repo ini:
- bukan sekadar teori
- bukan cuma contoh potongan kode
- memperlihatkan **alur MCP dari UI sampai tool execution**
- cocok buat engineer yang mau bikin AI agent beneran

Kalau lu mau:
- bikin AI agent internal
- hubungkan LLM ke data perusahaan
- bikin tooling AI yang aman

👉 **repo ini adalah starting point yang tepat.**

---

## 🧾 Kesimpulan

**MCP Playground** membuktikan bahwa:
> LLM yang powerful itu bukan yang paling bebas,  
> tapi yang paling terkontrol dengan baik.

Lewat MCP, AI tidak lagi sekadar menjawab —  
tapi **bertindak dengan aturan yang jelas**.

Dan repo ini adalah contoh nyata bagaimana MCP seharusnya dipakai.

📌 Repo: https://github.com/daffa09/mcp-playground

