<!-- title: Daffathan-Labs — Arsitektur DevOps Production-Grade -->
<!-- excerpt: Infrastruktur microservices yang aman, otomatis, dan zero-downtime menggunakan Docker, GitHub Actions, dan arsitektur internal gateway. -->
<!-- image: -->
<!-- date: 2026-02-15 -->
<!-- posting_date: 2026-02-15 -->
<!-- tags: Github Action, CI/CD, Docker, DevOps -->

# 🚀 Daffathan-Labs  
## Arsitektur DevOps Production-Grade

<img width="585" height="427" alt="Daffathan Labs DevOps Architecture" src="https://github.com/user-attachments/assets/PLACEHOLDER_IMAGE_LINK_HERE" />

Daffathan-Labs adalah platform microservices yang dirancang dengan standar **production-ready**, menjadikan **keamanan, otomatisasi, dan zero-downtime deployment** sebagai prioritas utama.

Repository ini mendokumentasikan filosofi arsitektur dan infrastruktur yang membangun sistem ini.

---

# 🏗 Gambaran Arsitektur

```text
             Internet
                 │
             ┌───────┐
             │ Caddy │  (Reverse Proxy Host)
             └───────┘
                 │
      ┌────────────────────┐
      │ Internal Nginx GW  │  (Docker Network)
      └────────────────────┘
        │        │        │
     ┌────┐   ┌────┐   ┌────┐
     │ UI │   │ API│   │ AI │
     └────┘   └────┘   └────┘
```

### Prinsip Utama

- Hanya Caddy yang terekspos ke publik.
- Semua service binding ke `127.0.0.1`.
- Internal Nginx menangani load balancing.
- Microservices berjalan di private Docker network.
- CI/CD berjalan sepenuhnya otomatis.

---

# 🔐 Model Keamanan

## Firewall Level OS (UFW)

Kebijakan default:

```bash
sudo ufw default deny incoming
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Disiplin Port Docker

Semua service hanya bind ke localhost:

```yaml
ports:
  - "127.0.0.1:3000:3000"
```

Hal ini mencegah Docker melakukan bypass terhadap aturan UFW.

---

# 🔁 CI/CD Pipeline

Setiap repository microservice memiliki workflow GitHub Actions.

## Fitur

- Deteksi versi otomatis dari `package.json`
- Strategi tagging berbasis branch:
  - `main-latest`
  - `univ-pancasila-latest`
- Multi-architecture build dengan Docker Buildx
- Push otomatis ke Docker Hub
- Auto-deploy via SSH

## Contoh Workflow

```yaml
name: Build and Deploy

on:
  push:
    branches:
      - main
      - univ-pancasila

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login DockerHub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and Push
        run: |
          VERSION=$(node -p "require('./package.json').version")
          docker buildx build \
            --platform linux/amd64,linux/arm64 \
            -t daffathan/api:${VERSION} \
            -t daffathan/api:main-latest \
            --push .
```

---

# ⚡ Zero Downtime Deployment (ZDT)

Alih-alih me-restart container, kita menggunakan strategi rolling update.

## Script Deployment

```bash
# Scale up (buat replica kedua)
docker compose up -d --scale api=2 --no-recreate

# Tunggu service siap (warmup NestJS / AI)
sleep 20

# Scale down (hapus replica lama)
docker compose up -d --scale api=1

# Reload internal gateway
docker exec nginx-gateway nginx -s reload
```

## Hasil

- Tidak ada 502 error
- Tidak ada koneksi terputus
- Update berjalan tanpa disadari user

---

# 🧩 Internal Gateway (Nginx)

Internal Nginx bertugas melakukan load balancing antar replica.

## Contoh Konfigurasi Upstream

```nginx
upstream api_service {
    server api:3000;
    server api:3000;
}

server {
    listen 80;

    location / {
        proxy_pass http://api_service;
    }
}
```

---

# 🐳 Struktur Docker Compose

```yaml
version: "3.9"

services:

  gateway:
    image: nginx:alpine
    container_name: nginx-gateway
    ports:
      - "127.0.0.1:8080:80"
    networks:
      - internal

  ui:
    image: daffathan/ui:main-latest
    networks:
      - internal

  api:
    image: daffathan/api:main-latest
    networks:
      - internal

  ai:
    image: daffathan/ai:main-latest
    networks:
      - internal

networks:
  internal:
    driver: bridge
```

---

# 🧠 Filosofi Engineering

Sistem production-grade membutuhkan:

- Otomatisasi, bukan SSH manual
- Keamanan sebagai default
- Isolasi arsitektur yang jelas
- Kesiapan observability
- Deployment yang tidak mengganggu user

Project ini dibangun dengan prinsip tersebut.

---

# ✅ Jaminan Saat Ini

- 🔐 VPS telah di-hardening dengan firewall OS
- 🐳 Container berjalan di private network
- 🔁 CI/CD berjalan otomatis
- ⚡ Deployment tanpa downtime
- 🧩 Arsitektur terpisah dengan jelas
- 🚀 Siap untuk scaling

---

# 📌 Roadmap

- [ ] Observability (Prometheus + Grafana)
- [ ] Monitoring health container
- [ ] Strategi Canary Deployment
- [ ] Blue/Green Deployment Pipeline
- [ ] Migrasi ke auto-scaling cluster

---

# 🏁 Penutup

Daffathan-Labs bukan lagi sekadar project yang "bisa jalan".

Ini adalah sistem dengan fondasi infrastruktur yang kuat,  
dirancang untuk tumbuh, bertahan, dan berkembang.

Deployment terasa membosankan.  
Keamanan menjadi default.  
Uptime dihormati.  

Fondasinya sudah siap.
