<!-- title: Daffathan-Labs — Production-Grade DevOps Architecture -->
<!-- excerpt: Secure, automated, zero-downtime microservices infrastructure powered by Docker, GitHub Actions, and internal gateway architecture. -->
<!-- image: <img width="1024" height="915" alt="Gemini_Generated_Image_muw7lsmuw7lsmuw7" src="https://github.com/user-attachments/assets/330f4a0b-b6a0-49d6-9a64-09a8dbf53d7b" />  -->
<!-- date: 2026-02-15 -->
<!-- posting_date: 2026-02-15 -->
<!-- tags: Github Action, CI/CD, Docker, DevOps -->

# 🚀 Daffathan-Labs  
## Production-Grade DevOps Architecture

<img width="1024" height="915" alt="Gemini_Generated_Image_muw7lsmuw7lsmuw7" src="https://github.com/user-attachments/assets/330f4a0b-b6a0-49d6-9a64-09a8dbf53d7b" />  


Daffathan-Labs is a production-ready microservices platform designed with **security, automation, and zero-downtime deployment** as first-class priorities.

This repository documents the architecture and infrastructure philosophy behind the system.

---

# 🏗 Architecture Overview

<pre style="font-family: monospace; line-height: 1.4;">
Internet
   │
   ▼
┌─────────────┐
│   Caddy     │  (Host Reverse Proxy)
└─────────────┘
   │
   ▼
┌─────────────────────┐
│ Internal Nginx GW   │  (Docker Network)
└─────────────────────┘
   │        │        │
   ▼        ▼        ▼
┌────┐   ┌────┐   ┌────┐
│ UI │   │ API│   │ AI │
└────┘   └────┘   └────┘
</pre>


### Key Principles

- Only Caddy is exposed publicly.
- All services bind to `127.0.0.1`.
- Internal Nginx handles load balancing.
- Microservices live inside private Docker network.
- CI/CD is fully automated.

---

# 🔐 Security Model

## OS-Level Firewall (UFW)

Default policy:

```bash
sudo ufw default deny incoming
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Docker Port Discipline

All services bind strictly to localhost:

```yaml
ports:
  - "127.0.0.1:3000:3000"
```

This prevents Docker from bypassing UFW rules.

---

# 🔁 CI/CD Pipeline

Each microservice repository contains a GitHub Actions workflow.

## Features

- Automatic version detection from `package.json`
- Branch-based tagging strategy:
  - `main-latest`
  - `univ-pancasila-latest`
- Multi-arch build via Docker Buildx
- Push to Docker Hub
- Auto-deploy via SSH

## Example Workflow Snippet

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

Instead of restarting containers, we use a rolling update strategy.

## Deployment Script

```bash
# Scale up (create second replica)
docker compose up -d --scale api=2 --no-recreate

# Wait for service boot (NestJS / AI warmup)
sleep 20

# Scale down (remove old replica)
docker compose up -d --scale api=1

# Reload internal gateway
docker exec nginx-gateway nginx -s reload
```

## Result

- No 502 errors
- No dropped connections
- Seamless user experience

---

# 🧩 Internal Gateway (Nginx)

Internal Nginx handles load balancing between replicas.

## Example Upstream Config

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

# 🐳 Docker Compose Structure

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

# 🧠 Engineering Philosophy

Production-grade systems require:

- Automation over manual SSH
- Secure defaults
- Isolation by design
- Observability readiness
- Deployment invisibility

This project is built on those principles.

---

# ✅ Current Guarantees

- 🔐 Hardened VPS with OS firewall
- 🐳 Private container network
- 🔁 Fully automated CI/CD
- ⚡ Zero-downtime deployments
- 🧩 Clean separation of concerns
- 🚀 Ready for scale

---

# 📌 Roadmap

- [ ] Observability (Prometheus + Grafana)
- [ ] Container health monitoring
- [ ] Canary deployment strategy
- [ ] Blue/Green deployment pipeline
- [ ] Auto-scaling cluster migration

---

# 🏁 Conclusion

Daffathan-Labs is no longer a project that "just runs".

It is an infrastructure-first system designed to scale, survive, and evolve.

Deployments are boring.  
Security is default.  
Uptime is respected.  

The foundation is ready.
