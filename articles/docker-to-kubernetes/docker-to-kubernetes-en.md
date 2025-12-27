<!-- title: From Docker to Kubernetes — A Slow but Steady Path Toward DevOps That Makes Sense -->
<!-- excerpt: A reflective and technical journey of learning Docker, Kubernetes, and Cloud—from real confusion and hardware limitations to finally understanding how they complete each other. -->
<!-- image: https://github.com/user-attachments/assets/placeholder-k8s-docker -->
<!-- date: 2025-12-27 -->
<!-- posting_date: 2025-12-27 -->
<!-- tags: Docker, Kubernetes, Cloud Computing, DevOps, Engineering Journey -->

# 🐳 From Docker to ☸️ Kubernetes  
## A Slow but Steady Path Toward DevOps That Makes Sense

When I started my first job, I was **hit by reality—hard**.

Imagine this:
- an intern  
- freshly graduated from vocational high school  
- only really confident with **Laravel**  
- suddenly expected to deal with:
  - Docker  
  - Golang  
  - Vue.js  
  - and very tight timelines  

I should have panicked.  
But strangely, what I felt was **excitement**.

Because for the first time, I was touching technologies that had only been dreams back when I was still in school—without knowing when I’d ever get the chance to try them for real.

And that was the beginning of everything.

---

## 🐳 My First Encounter with Docker

Docker was the first technology that made me think:

> *“Oh… this is how applications are handled seriously.”*

No more:
- `php artisan serve`
- uploading files to shared hosting
- and hoping nothing breaks

Instead, I started learning about:
- images  
- containers  
- consistent environments  
- repeatable deployments  

From that moment on, Docker wasn’t just a tool.  
Docker became a **way of thinking**.

---

## 🧠 Going Deeper with Docker (and Slowly Getting Addicted)

Without realizing it:
- 1 year  
- 2 years  
- 3 years  

Docker kept following my journey.

Even while writing this article, I’m **still learning Docker**.

There’s one moment that perfectly describes this phase of my life:

> During a class at campus,  
> I was updating a server,  
> editing `docker-compose.yml` through the terminal.  
>  
> A friend said:  
> **“Watching you is more interesting than this class.”**

That was when I realized—  
this wasn’t just a job anymore.  
It had become a **serious interest**.

---

## 🚧 Wanting to Level Up, but Blocked by Hardware Reality

From Docker, my goals were clear:
➡️ Kubernetes  
➡️ Cloud Services  

But reality didn’t cooperate.

At one point, my boss said:

> *“If you want to go there, you’ll need to change your laptop first.”*

The meaning was obvious:
- Kubernetes and Cloud workflows are very **Linux / macOS–oriented**
- I was using a **Windows gaming laptop**
- Dual boot? Storage was already full
- Full Linux? Almost impossible

So for nearly **three years**, I stayed with Docker.

Not because I didn’t want to move forward,  
but because of **technical and practical limitations**.

---

## ☸️ Finally Stepping into Kubernetes

After that phase, I finally decided to start learning Kubernetes—  
using **WSL on Windows**, and continuing the rest on **VPS and cloud environments**.

One thing became very clear early on:

> If you want to learn Kubernetes properly, you must be comfortable with Docker first.

The syntax is different,  
but the underlying concepts are closely related.

When I truly started learning Kubernetes, one realization stood out immediately:

> *Docker is the foundation. Kubernetes is what brings that foundation to life at real scale.*

Kubernetes is not just about:
- running containers  
- exposing services  

It’s about:
- auto-healing  
- auto-scaling  
- rolling updates with minimal downtime  
- optimal resource utilization  
- declarative systems  

At this point, I understood:
**Docker and Kubernetes are not competitors.**  
They complete each other.

---

## 🏗️ When Is Kubernetes Actually Necessary?

This is often misunderstood.

Kubernetes is **not** for:
- simple landing pages  
- static websites  
- small projects with little traffic  

Kubernetes **makes sense** for:
- marketplaces  
- online shops  
- POS systems  
- campus applications  
- systems with thousands of users  
- applications that *must not go down*  

Because Kubernetes can:
- fully utilize server resources  
- scale automatically  
- update applications without stopping services  
- handle load balancing without complex manual configuration  

---

## 🐳 So Where Does Docker Stand on Its Own?

Docker by itself:
- turns applications into container-based systems  
- ensures consistent environments  
- simplifies CI/CD pipelines  

However:
- scaling is still mostly manual  
- version changes often require intervention  
- downtime is still possible  

Docker is **powerful**,  
but **not enough** for large-scale systems on its own.

---

## 🤝 Docker and Kubernetes: Not an Either-Or Choice

This is where everything finally clicks.

Docker:
- builds images  
- defines application runtime  

Kubernetes:
- manages lifecycle  
- scaling  
- healing  
- traffic distribution  

Cloud:
- elastic infrastructure  
- managed services  
- observability  
- production-ready environments  

They are not separate paths,  
but **one continuous journey**.

---

## ☁️ Cloud Services: The Final Piece

Honestly, there’s a small regret:

> *Why didn’t I choose Cloud Computing during the Bangkit Independent Study program?*

Because after understanding:
- Docker  
- Kubernetes  

Cloud no longer feels:
- intimidating  
- overly expensive  
- excessively complex  

Instead, it feels like:
- a natural next step  
- the place where all DevOps concepts finally come together  

---

## ❓ Difficulties and Questions I Faced

Throughout this journey, I had countless questions:

- Why doesn’t HPA work even when the YAML looks correct?
- Why is the metrics server mandatory for autoscaling?
- What’s the real difference between pods, services, deployments, and ingress?
- Why is memory-based autoscaling often a trap?
- Why does Kubernetes feel so complicated at first but incredibly clean once understood?
- When should I stop at Docker, and when should I move to Kubernetes?

None of these questions were answered instantly.  
Most of them only made sense after **repeated failures and errors**.

---

## 🌱 Final Reflection

The journey from Docker to Kubernetes is not an instant one.

It’s about:
- patience  
- limitations  
- hardware reality  
- and deeply understanding systems  

But one thing is certain:

> *When Docker, Kubernetes, and Cloud are understood together, the DevOps path becomes much clearer.*

Not because everything becomes easy,  
but because **every component finally has its place and purpose**.

And for me, this journey is still ongoing.
