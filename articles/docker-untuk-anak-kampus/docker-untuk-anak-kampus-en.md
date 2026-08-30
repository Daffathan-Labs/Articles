<!-- title: Docker for Campus Students — One Lab PC, 40 Students, Zero Collisions -->
<!-- excerpt: A step-by-step Docker guide for SE, DS, and AI students who have to install their thesis projects on one shared lab PC. Includes case studies from repositories that actually run, plus a GitHub Actions path for anyone who would rather not install Docker on their own laptop. -->
<!-- image: https://raw.githubusercontent.com/Daffathan-Labs/Articles/main/articles/docker-untuk-anak-kampus/hero.jpg -->
<!-- date: 2026-08-31 -->
<!-- posting_date: 2026-08-31 -->
<!-- tags: Docker, Docker Compose, GitHub Actions, DevOps, Tutorial -->

# 🐳 Docker for Campus Students
## One Lab PC, 40 Students, Zero Collisions

<img width="800" alt="Docker for Campus Students — One Lab PC, 40 Students, Zero Collisions" src="https://raw.githubusercontent.com/Daffathan-Labs/Articles/main/articles/docker-untuk-anak-kampus/hero.jpg" />

There is one lab PC. There are 40-odd students who need to install their thesis projects on it.

Picture everyone installing by hand. You need PHP 8.3, the person next to you needs PHP 7.4. You need Python 3.11, your friend needs Python 3.9 because a library has not caught up. One person needs MySQL 8, another needs PostgreSQL 18. Somebody reinstalls PHP and three other thesis projects die on the spot.

Then there is the time. Install PHP, install Composer, install Node, install MySQL, create the database, import the SQL, edit `.env`, fix permissions on `storage`. That is 45 minutes per person if nothing goes wrong. Times 40. That is 30 hours, and it assumes the optimistic case.

Docker solves both problems at once. This guide walks through it from zero, using repositories that actually run rather than invented examples.

---

## ⚡ In a hurry? Start with these five commands

If the project already ships a `Dockerfile`, you do not need the whole article right now. Run the five lines below, then come back when something looks odd.

```bash
git clone <repo-url> && cd <folder-name>    # 1. get the code
docker compose pull                         # 2. pull the ready-made image
docker compose -p yourname up -d            # 3. start it
docker compose -p yourname logs -f          # 4. watch what happens
docker compose -p yourname down             # 5. stop when you finish
```

Replace `yourname` with your own name, and change the port numbers in `docker-compose.yml` if somebody already claimed them. Those two cause most failures on a shared machine, and both get their own section in [House rules for a shared lab PC](#lab).

### What is in here

1. [What Docker actually is](#konsep), the analogy, image versus container versus volume, why the industry uses it
2. [How it works](#cara-kerja), `Dockerfile` and `docker-compose.yml` line by line
3. [What to prepare](#persiapan), on the lab PC and on your own laptop
4. [Build on your laptop, run in the lab](#build), including the GitHub Actions path if you skip installing Docker
5. [House rules for a shared lab PC](#lab), ports, container names, and `-p`
6. [SE case studies](#se), Laravel with MySQL, and a four-container stack
7. [DS and AI case studies](#ds), Flask with React, and what to do with large models
8. [Daily commands](#perintah)
9. [When things break](#error), a table of error messages and their causes

---

<a id="konsep"></a>

# 🍱 What Docker actually is

Think about ordering food through an app.

You never need to know what brand of stove the kitchen uses, how big the gas tank is, or what size the pan was. The food arrives in a sealed container, ready to eat, and it tastes the same as what somebody in another city received.

Docker does that for software. Your application gets sealed into one container together with everything it needs: its PHP version, its Python version, its libraries, its configuration. That container behaves the same way on your laptop, on the lab PC, and on a server.

"It works on my machine" stops being an excuse, because now you ship the machine too.

## Three words you must keep apart

People get lost here because the three words look similar. They are not.

| Word | Analogy | Nature |
|---|---|---|
| **Image** | The recipe plus the groceries already bought | Still, unchanging, shareable |
| **Container** | The dish being served at the table | Alive, running, can be stopped |
| **Volume** | The fridge | Survives even when the dish is thrown out |

One image can run ten containers at once. Delete a container and the image stays. Data in a volume also stays, which is why your database survives a restart.

If you study DS or AI and have used `venv` or `conda`, the mental model transfers. Docker isolates deeper: not only the Python packages but the Python version itself, system libraries like `libgl` that OpenCV keeps asking for, and the database version.

## Why the industry stopped debating this

Four reasons, and every one of them shows up on campus:

**Versions stop fighting.** One machine runs PHP 8.3, Python 3.11, and Node 22 side by side without interference. That is your lab PC problem, solved.

**Onboarding takes minutes.** A new teammate joins, runs `git clone` and `docker compose up -d`, and starts working. No 12-page setup document that went stale three months ago.

**What you test is what you ship.** The image that passed testing is the same image that reaches production. Not a similar one, the same one.

**Deploys can be undone.** New version misbehaving? Pull the previous image, run it, done. Nobody reinstalls a server at two in the morning.

Most backend, data engineering, and ML engineering job posts list Docker now. Not for style points, but because no team has time to babysit five different laptops.

---

<a id="cara-kerja"></a>

# ⚙️ How it works: two files, two jobs

You only need to understand two files.

## 1. `Dockerfile`, the recipe for building one image

A `Dockerfile` answers one question: **what does this application need in order to run?**

It reads top to bottom, one line per step. Each line produces a layer that Docker caches. Unchanged layers get reused, which is why your second build finishes far faster than your first.

| Instruction | What it does |
|---|---|
| `FROM` | Start from somebody else's image. Always the first line. |
| `WORKDIR` | Move into a working folder inside the container |
| `COPY` | Copy files from your machine into the image |
| `RUN` | Execute a command **while building** the image |
| `ENV` | Set an environment variable |
| `EXPOSE` | Document the port the app uses |
| `CMD` | The command that runs **when the container starts** |

The difference between `RUN` and `CMD` trips people up. `RUN npm install` executes once, at build time. `CMD ["node", "server.js"]` executes every time a container starts. Put them in the wrong place and your app never comes alive.

Order is not a matter of taste either. Watch this pattern, which nearly every good Dockerfile uses:

```dockerfile
COPY package*.json ./     # copy the shopping list first
RUN npm install           # go shopping
COPY . .                  # then copy the code
```

Put `COPY . .` first and every single character you change in your code invalidates the cache, so `npm install` runs again from scratch. With the order above, `npm install` reruns only when `package.json` genuinely changes. That is the difference between 5 minutes and 5 seconds.

## 2. `docker-compose.yml`, the order slip for several containers

One `Dockerfile` handles one application. Your thesis project is rarely one application. It usually has a backend, a frontend, a database, and sometimes an nginx sitting in front.

`docker-compose.yml` answers the second question: **which containers must run together, and how do they find each other?**

It looks roughly like this:

```yaml
services:          # the containers you want running
  service_name:
    image: ...     # pull a ready-made image from Docker Hub
    build: .       # OR build it yourself from the Dockerfile here
    ports:         # "port_on_your_machine:port_inside_container"
      - "8080:80"
    environment:   # settings the app reads
      KEY: value
    volumes:       # folders whose contents survive
      - data:/var/lib/mysql
    depends_on:    # start this other service first
      - db
    networks:      # private network between containers
      - mynetwork
```

One thing makes Compose pleasant: **containers reach each other by service name**, not by IP. If your database service is called `db`, your backend simply talks to `db:3306`. No shifting IP addresses, no misdirected `localhost`.

And `localhost` inside a container means **that container itself**, not your computer. This is beginner mistake number one: the backend gets told to connect to `localhost:5432` while the database lives in a neighbouring container. The correct address is `postgres:5432`, matching the service name.

---

<a id="persiapan"></a>

# 🧰 What you need to prepare

## If you use the lab PC

The lab PC already has Docker Desktop and WSL. You install nothing. You bring:

1. **A folder under your own name** containing your program, your database, and your install instructions. Shared labs usually require this, and the reason holds up: if everything piles into one folder, nobody knows whose is whose.
2. **A Docker Hub account**, if you want to pull your own image from the internet.
3. **A port number nobody else is using.** That gets its own section below. Do not skip it.

## If you want to try it on your own laptop

**Windows:** install Docker Desktop and enable WSL 2 when prompted. Docker Desktop handles WSL for you, you just click through. You need Windows 10 version 2004 or newer with virtualisation enabled in the BIOS. 8 GB of RAM works, 16 GB feels comfortable.

**macOS:** install Docker Desktop. Check your chip, there is one installer for Apple Silicon and another for Intel.

**Linux:** install Docker Engine plus the Compose plugin. Run `sudo usermod -aG docker $USER` and log out, so you stop typing `sudo` on every command.

Confirm it worked with two commands:

```bash
docker --version
docker compose version
```

Notice that `docker compose` has no hyphen. Older tutorials write `docker-compose`, which is the retired version. If the example you are following uses the hyphen and the errors look strange, the tutorial is probably out of date.

---

<a id="build"></a>

# 🏗️ The workflow: build on your laptop, run in the lab

Building on the lab PC is a bad idea. A build downloads the base image, installs dependencies, and compiles. For Laravel with `composer install` plus `npm run build`, that runs 5 to 15 minutes. With 40 students taking turns on one machine, the day ends and nobody has finished.

So split it: **build once elsewhere, run many times in the lab.**

```
[ Your laptop ]                    [ Docker Hub ]              [ Lab PC ]
docker build          ──push──>    image stored      ──pull──>  docker compose up
(5-15 min, once)                                                (30 seconds, just runs)
```

## Path A: build on your own laptop

Four commands, once per thesis (repeated only when the code changes).

```bash
# 1. Log in once
docker login

# 2. Build the image, named after your Docker Hub account
docker build -t yourname/thesis-app:1.0 .

# 3. Send it to Docker Hub
docker push yourname/thesis-app:1.0

# 4. On the lab PC, pull and run
docker compose pull
docker compose up -d
```

The name must follow `account/image:tag`. Get the format wrong and `docker push` refuses with a message about a missing repository, without mentioning that the naming is what broke.

About tags: **do not rely on `latest` alone.** Give it version numbers like `1.0`, `1.1`, `1.2`. When version 1.2 breaks in front of your supervisor, you change one digit back to `1.1` and you are alive again. With only `latest`, you have no way home.

## Path B: skip Docker on your laptop, let GitHub Actions build

Your laptop is slow, you have 4 GB of RAM, or you simply do not want Docker Desktop. That is fine. **GitHub will build the image for you, free of charge.**

All you do is push code. GitHub's servers download the base image, install dependencies, build, and send the result to Docker Hub. Your laptop does nothing beyond `git push`.

Create `.github/workflows/docker-build.yml`:

```yaml
name: Build & Push Image

on:
  push:
    branches:
      - master        # change this if your main branch is called main

env:
  IMAGE_NAME: yourname/thesis-app
  IMAGE_VERSION: 1.0.0

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - name: Check out the code
        uses: actions/checkout@v4

      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          push: true
          tags: |
            ${{ env.IMAGE_NAME }}:${{ env.IMAGE_VERSION }}
            ${{ env.IMAGE_NAME }}:latest
```

Before it runs, register two secrets in your GitHub repo under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Contents |
|---|---|
| `DOCKERHUB_USERNAME` | your Docker Hub username |
| `DOCKERHUB_TOKEN` | an Access Token from Docker Hub, **not your account password** |

Generate the token in Docker Hub under **Account Settings → Personal access tokens → Generate new token**, with Read & Write permission. You can revoke a token at any time without touching your account, which is not true of a password. And never paste that token directly into the YAML file, because that file gets committed and anyone can read it.

After `git push`, open the **Actions** tab in your repo. A green check means your image is on Docker Hub. On the lab PC you then run `docker compose pull` and `up -d`.

My thesis uses the same pattern, just longer because it adds security scanning and automatic deployment. The full version lives in [`.github/workflows/main.yml`](https://github.com/daffa09/emobo-ecommerce-api/blob/master/.github/workflows/main.yml). Five stages in sequence: Trivy scans the source, the image gets built and pushed, Trivy scans the finished image, the result deploys over SSH without downtime, and OWASP ZAP attacks the live application. For campus purposes, the second stage alone is enough.

---

<a id="lab"></a>

# 🚦 House rules for a shared lab PC

This is the section people skip, and the one that causes the most arguments.

## Ports cannot repeat

Two containers cannot claim the same port on one machine. If yours says `8080:80` and your friend's also says `8080:80`, the second one fails immediately with `port is already allocated`.

Let your student ID decide. Take the last two digits and add them to 8000:

```yaml
ports:
  - "8042:80"     # student ID ending in 42
```

The number on the **left** is the one that must be unique between students. The number on the right is the port inside the container, which belongs to your application. Leave it alone.

## Container names cannot repeat either

Look at this line, which shows up in most examples you will copy:

```yaml
container_name: laravel_app
```

If two people run the same compose file, the second one fails because the name is taken. Pick one fix: delete the `container_name` line, or attach your own name to it.

```yaml
container_name: laravel_app_daffa
```

## The tidiest approach: use a project name

Docker Compose can give each person their own namespace through `-p`:

```bash
docker compose -p daffa up -d
docker compose -p daffa down
```

Your containers, networks, and volumes all get a `daffa_` prefix, so they cannot collide with anyone. One condition: **delete the `container_name` lines first**, because a hardcoded name overrides this automatic naming.

Keep in mind that `-p` has to be typed every time. Forget it on `down` and you might shut down somebody else's work.

## Clean up when you finish

The lab PC gets passed around. When you are done, shut yours off:

```bash
docker compose -p daffa down          # stop, volume data stays safe
docker compose -p daffa down -v       # stop and delete the data too
```

Be careful with `-v`. It removes volumes, which means your database contents disappear. Use it only when you actually want to start from an empty database.

---

<a id="se"></a>

# 💻 SE case studies

## Case 1: Laravel + MySQL (Browstime)

Repository: [`daffa09/E-Commerce-Browstime`](https://github.com/daffa09/E-Commerce-Browstime/tree/dev) (branch `dev`)
Files: [`Dockerfile`](https://github.com/daffa09/E-Commerce-Browstime/blob/dev/Dockerfile) and [`docker-compose.yml`](https://github.com/daffa09/E-Commerce-Browstime/blob/dev/docker-compose.yml)

This is the closest match for an SE student with a Laravel thesis. Two containers: the app itself and MySQL.

Let us take the `Dockerfile` apart:

```dockerfile
FROM dunglas/frankenphp:php8.3-alpine
```
Start from an image that already contains PHP 8.3 and the FrankenPHP web server. No installing PHP, no installing Nginx, no configuring PHP-FPM. The `alpine` suffix means a small Linux base, which keeps the size down.

```dockerfile
WORKDIR /app
```
Every following command runs in `/app` inside the container.

```dockerfile
RUN install-php-extensions \
    pdo_mysql mbstring exif pcntl bcmath gd intl zip \
    && apk add --no-cache unzip git curl nodejs npm
```
Install the PHP extensions Laravel asks for. `pdo_mysql` connects to MySQL, `gd` handles images, `intl` formats dates and currency. Then `apk add` installs system-level tools including Node and npm, because the frontend assets need building. `--no-cache` stops download leftovers from bloating the image.

```dockerfile
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
```
Take Composer straight from its official image instead of installing it by hand. One line, finished.

```dockerfile
COPY . /app
RUN composer install --no-dev --optimize-autoloader
RUN npm ci && npm run build
```
Copy the code, install PHP dependencies, build frontend assets. `--no-dev` drops packages only used during development such as PHPUnit, keeping the image lean. `npm ci` follows `package-lock.json` exactly, unlike `npm install` which may still bump versions.

```dockerfile
RUN chown -R www-data:www-data /app/storage /app/bootstrap/cache
```
Laravel writes logs and cache into those two folders. Without this line you meet that legendary `Permission denied`.

Now the `docker-compose.yml`:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
```
`build` means build it here from the Dockerfile. Compare with `image:`, which pulls a finished one from Docker Hub. **For the lab PC, switch this to `image:`** so nothing has to build there.

```yaml
    ports:
      - "8080:80"
```
Open `localhost:8080` in your browser and reach port 80 inside the container. **This is the number you change** when sharing the machine.

```yaml
    volumes:
      - ./.env:/app/.env
```
Inject the `.env` file from outside into the container, so you can change configuration without rebuilding the image.

```yaml
    depends_on:
      - db
```
Start `db` before `app`. Note that this only orders the startup, it does not wait for MySQL to actually accept connections. The next case study shows how to wait properly.

```yaml
  db:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: ${DB_DATABASE:-browstime_ecommerce}
      MYSQL_ALLOW_EMPTY_PASSWORD: 1
```
MySQL 8.0 straight from Docker Hub. The `${DB_DATABASE:-browstime_ecommerce}` syntax means "use `DB_DATABASE` if it exists, otherwise use `browstime_ecommerce`". An empty password is fine while this container stays local, and that setting must never follow you to an internet-facing server.

```yaml
    volumes:
      - dbdata:/var/lib/mysql
```
Here is the fridge. MySQL data lives in a volume called `dbdata`, so the container can be destroyed and recreated without losing the database.

To run it:

```bash
git clone -b dev https://github.com/daffa09/E-Commerce-Browstime.git
cd E-Commerce-Browstime
cp .env.example .env
docker compose -p yourname up -d
```

Then open `localhost:8080`. If Laravel complains about a missing application key, run this once:

```bash
docker compose -p yourname exec app php artisan key:generate
docker compose -p yourname exec app php artisan migrate --seed
```

`exec` means "run this command inside a container that is already alive". You never install PHP or Artisan on your own machine.

## Case 2: four containers at once (Node + Next.js thesis)

Repository: [`daffa09/emobo-ecommerce-api`](https://github.com/daffa09/emobo-ecommerce-api)
Files: [`Dockerfile`](https://github.com/daffa09/emobo-ecommerce-api/blob/master/Dockerfile) and [`deployments/docker-compose.local.yml`](https://github.com/daffa09/emobo-ecommerce-api/blob/master/deployments/docker-compose.local.yml)

The first case had two containers. This one has four: database, API, frontend, and nginx as the front door. A thesis with a separated backend and frontend tends to look like this.

The Dockerfile uses a **multi-stage build**, a technique worth copying:

```dockerfile
# Stage 1: the kitchen
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
RUN npx prisma generate
COPY . .
RUN npm run build

# Stage 2: the serving table
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
```

Notice there are **two** `FROM` lines. The first stage is the kitchen: build tools, the TypeScript compiler, and development dependencies all live there. The second stage is the serving table, and only the finished dish moves across through `COPY --from=builder`.

The kitchen equipment stays behind. The final image can shrink by hundreds of megabytes, and more importantly the compiler never reaches the server. The less an image contains, the less anyone can exploit.

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
```
Every time the container starts, database migrations run first, then the server. Your schema always matches the running code without you remembering to do it by hand.

The compose file has two parts worth stealing. First, **waiting until the database is genuinely ready** rather than merely started:

```yaml
  postgres:
    image: pgvector/pgvector:pg18
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d emobo_ecommerce -h 127.0.0.1"]
      interval: 5s
      retries: 30

  api:
    depends_on:
      postgres:
        condition: service_healthy
```

The `healthcheck` tells Docker to poke Postgres every 5 seconds until it can actually serve. Then `condition: service_healthy` holds the API back until that check passes. Without this, the API often starts first, fails to connect, dies, and you sit there confused because you "already used `depends_on`".

About that image: `pgvector/pgvector:pg18` is Postgres 18 carrying the vector extension. If your thesis stores embeddings for semantic search or AI features, this is what you need instead of plain Postgres. Turn it on once with `CREATE EXTENSION vector;`.

Second, **ports pinned to localhost**:

```yaml
  gateway:
    ports:
      - "127.0.0.1:3006:80"
      - "127.0.0.1:5006:81"
```

The `127.0.0.1:` prefix keeps those ports reachable only from the machine itself. Without it, Docker opens them to the whole network, and anyone sharing the lab WiFi can reach your application. In a crowded campus lab, that habit costs nothing and saves you.

To run it:

```bash
git clone https://github.com/daffa09/emobo-ecommerce-api.git
cd emobo-ecommerce-api/deployments
docker compose -f docker-compose.local.yml -p yourname up -d
```

`-f` points at which compose file to use, since this repo has two. Open `localhost:3006` for the frontend and `localhost:5006/api/v1` for the API.

The schema and sample data load themselves through this block:

```yaml
    volumes:
      - ../db_schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ../dummy_data.sql:/docker-entrypoint-initdb.d/02-dummy.sql:ro
```

The Postgres image runs every `.sql` file in `docker-entrypoint-initdb.d` the first time the database is created, in filename order. That is why they carry `01-` and `02-` prefixes. The `:ro` marker means read-only, so the container cannot modify your original files.

This answers the "the database has to live in your folder" requirement. No manual export and import, just drop the SQL files in and let Compose handle it.

---

<a id="ds"></a>

# 🤖 DS and AI case studies

## Flask + React in one compose file (EduLaptop Advisor)

Repository: [`daffa09/edulaptop-advisor`](https://github.com/daffa09/edulaptop-advisor)
Files: [`docker-compose.yml`](https://github.com/daffa09/edulaptop-advisor/blob/master/docker-compose.yml), [`backend/Dockerfile`](https://github.com/daffa09/edulaptop-advisor/blob/master/backend/Dockerfile), [`frontend/Dockerfile`](https://github.com/daffa09/edulaptop-advisor/blob/master/frontend/Dockerfile)

An intelligent systems project: a Flask backend that loads the model, a React frontend for the interface. The same shape works for image classification, recommendation, or a chatbot.

The backend stays simple, which is exactly right:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0
CMD ["flask", "run"]
```

What matters for DS students:

`python:3.11-slim` pins the Python version. Your friend can run 3.9 in their own container and nothing collides. This is the `venv` comparison from earlier, taken deeper.

`COPY requirements.txt` before `COPY . .` follows the caching pattern discussed above. Your model and notebooks change daily, `requirements.txt` rarely does. With this order, that slow `pip install` stops rerunning every time you touch the code.

`ENV FLASK_RUN_HOST=0.0.0.0` is the line people forget most. By default Flask listens on `127.0.0.1`, and inside a container that means "reachable only from inside this container". The container looks healthy, the logs look clean, and your browser still cannot get in. Do not waste an afternoon guessing, just write `0.0.0.0`.

If your libraries need system packages, add them before `pip install`. OpenCV often asks for these:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
```

The frontend goes multi-stage too, in the usual React shape:

```dockerfile
FROM node:22-alpine AS build
...
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
```

React compiles down to static HTML, CSS, and JS. After that Node has no job left, so nginx serves the files instead. The final image gets tiny, and no Node runtime sits around on the server.

The compose file joins them:

```yaml
services:
  backend:
    image: daffa09/edulaptop-backend:latest
    ports:
      - "5000:5000"
    networks:
      - edulaptop_net

  frontend:
    image: daffa09/edulaptop-frontend:latest
    ports:
      - "8200:80"
    depends_on:
      - backend
    networks:
      - edulaptop_net
```

Both use `image:` rather than `build:`. The images were built beforehand and only get pulled. **This is exactly the pattern you want on the lab PC.**

Run it with:

```bash
docker compose -p yourname up -d
```

Open `localhost:8200`. Remember to change `8200` and `5000` if somebody already claimed them.

## Keep large models out of the image

One warning aimed at DS and AI students.

If your model weighs hundreds of megabytes or more, do not `COPY` it into the image. The image balloons, pushing to Docker Hub drags, and every one-line code change reuploads the same model.

Mount it through a volume instead:

```yaml
  backend:
    volumes:
      - ./models:/app/models
```

The model stays in your own `models` folder and the container reads it from there. Lean image, model still delivered.

## Exercise: write the compose file yourself

[`daffa09/chaldea-ai`](https://github.com/daffa09/chaldea-ai) already has two Dockerfiles ([Flask backend](https://github.com/daffa09/chaldea-ai/blob/master/backend/Dockerfile) and [React frontend](https://github.com/daffa09/chaldea-ai/blob/master/frontend/Dockerfile)) but no `docker-compose.yml`.

Write one. Note that its backend uses `EXPOSE 5005` rather than 5000, so the port mapping changes with it. Compare your result against the EduLaptop compose above.

If yours runs, you understand Docker Compose. If it stalls, read the error message all the way through, because the answer almost always sits inside it.

---

<a id="perintah"></a>

# 📋 Commands you will use daily

```bash
docker compose up -d           # start everything, -d means in the background
docker compose ps              # see what is alive and what died
docker compose logs -f api     # follow the logs of the "api" service
docker compose down            # stop everything, data stays safe
docker compose pull            # fetch the newest images
docker compose restart api     # restart a single service

docker ps                      # every container running on this machine
docker exec -it skripsi-api sh # step inside a container, leave with exit
docker system df               # check how much disk Docker eats
docker system prune -a         # big cleanup, HANDLE WITH CARE
```

The command you will reach for most is `logs`. A container that dies on its own nearly always leaves the reason behind. Read it before you start guessing.

<a id="error"></a>

# 🔧 When things break

| The message | The cause | What you do |
|---|---|---|
| `port is already allocated` | Somebody else has the port | Change the left-hand number in `ports` |
| `Cannot connect to the Docker daemon` | Docker Desktop is not running | Open Docker Desktop, wait for the green icon |
| Container starts then dies | The app crashed | `docker compose logs service_name` |
| Page will not load though the container is alive | The app listens on `127.0.0.1` | Switch it to `0.0.0.0` inside the container |
| `connection refused` to the database | Wrong address, or the DB is not ready | Use the service name, not `localhost`. Add a `healthcheck` |
| `denied: requested access to the resource is denied` | Image name does not match your account | Use `account/image:tag`, and run `docker login` |
| Every build crawls | `COPY . .` sits before the install step | Copy dependency files first, code second |
| Disk full | Old images and volumes piled up | `docker system df` then `docker system prune` |

---

# 🏁 Wrapping up

For everyone installing a thesis project in the lab, here is the short version:

1. Write a `Dockerfile` for your app, and a `docker-compose.yml` if you need more than one container.
2. Build the image on your own laptop, or hand it to GitHub Actions if your laptop cannot cope.
3. Push it to Docker Hub with a clear version number.
4. On the lab PC, run `docker compose pull` then `up -d`. Done in seconds.
5. Use your own port and project name, and shut your containers down when you finish.

One thing worth holding onto: run it yourself instead of handing it to whichever friend already knows how. Docker is what makes that reasonable. You memorise three commands, and the rest already lives inside your repository.

When you get stuck, bring **the error message**, not the sentence "mine is broken". Docker errors usually name the cause in the first line, and reading it to the end is half the repair.

Give it a try. Once it clicks, you will not want to go back to installing things by hand.

---

### Further reading

- [From Docker to Kubernetes: A Slow but Steady Path Toward DevOps That Makes Sense](https://daffathan-labs.my.id/en/articles/from-docker-to-kubernetes-a-slow-but-steady-path-toward-devops-that-makes-sense), for anyone curious about what comes after Docker.
- [Daffathan-Labs: Production-Grade DevOps Architecture](https://daffathan-labs.my.id/en/articles/daffathan-labs-production-grade-devops-architecture), Docker used seriously on a real server.
- [Official Docker documentation](https://docs.docker.com/), the reference to trust when internet examples contradict each other.
