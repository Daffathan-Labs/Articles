<!-- title: RAM Diet & Cloud Migration: How I Saved My Server from a Resource Crisis -->
<!-- excerpt: A complete explanation of how I saved the Daffathan Labs server from a resource crisis by optimizing and migrating to Cloudflare Pages. -->
<!-- image: https://github.com/user-attachments/assets/e768a74e-8e6d-400d-8b02-9946d227a964 -->
<!-- date: 2026-04-21 -->
<!-- posting_date: 2026-04-21 -->
<!-- tags: optimize, server, cloudflare, mariadb, docker, FrankenPHP -->


# RAM Diet & Cloud Migration: How I Saved My Server from a Resource Crisis

<img width="1536" height="1024" alt="Infrastructure Optimization" src="https://github.com/user-attachments/assets/e768a74e-8e6d-400d-8b02-9946d227a964" />

## **"When Speed Becomes a Disaster"**

At first, **I** was genuinely amazed by **FrankenPHP**. This modern PHP stack is incredibly fast, especially when I implemented it for my new project, **Browstime**. However, that admiration quickly turned into a disaster for my other server ecosystems.

Because Browstime—running on FrankenPHP + MySQL 8.0—was incredibly resource-hungry, my main project, **Vinci LMS**, took a major hit. My VPS, with only 4GB of RAM, began to choke. It reached a breaking point when I received numerous complaints from **Teaching Assistants (Asprak)** because Vinci LMS had become painfully slow.

I realized that if I let this slide, all services at Daffathan Labs could go down. That’s when I decided to perform some aggressive optimization.

---

<img width="945" height="658" alt="image" src="https://github.com/user-attachments/assets/a78bd1c6-5a95-49d8-b95f-280764aa5948" />  

# 🔥 Three Crucial Steps to Saving Server Resources

## **1. Offloading Frontend Weight to Cloudflare Pages**

The first step I took was "evicting" all UI/Frontend loads from the main server. Projects like **Vinci Agent**, **Vinci Gallery**, and **Vinci LMS UI**, which were previously running on Docker inside the VPS, were all migrated to **Cloudflare Pages**.

Why? Because **you** shouldn't waste server RAM just to serve static files. By using Cloudflare Pages:
- The RAM usage on my VPS dropped drastically.
- Landing page access speeds became faster thanks to the Edge Network.
- My server can now focus solely on handling APIs and heavy backend logic.

---

## **2. Resizing Browstime: Migrating from MySQL 8 to MariaDB Alpine**

The biggest issue with Browstime was **MySQL 8.0**. In a limited VPS environment, MySQL 8 is like a "monster" that devours RAM without mercy. I frequently encountered *broken pipe* logs and "unhealthy" container statuses.

I eventually performed a total migration:
- Swapped MySQL 8 for **MariaDB Alpine**. **You** need to know that MariaDB Alpine is much lighter yet remains powerful for Laravel/FrankenPHP.
- Implemented **Docker Healthcheck**. Now, my `app` container won't start until the `db` is officially ready (healthy).
- The result? Database RAM usage plummeted from 400MB+ to just around **90MB**!

---

## **3. Taming the Monitoring Stack & Implementing a Swap File**

Finally, I audited all running containers. It turned out that **cAdvisor** in my monitoring stack was eating up **700MB** of RAM! I immediately tuned its housekeeping interval to 15 seconds so it wouldn't be so aggressive.

Additionally, I set up a **2GB Swap File** as a "spare tire."
- **The Advantage:** When my 4GB of physical RAM is full, the server won't panic and start killing random containers (OOM Killer).
- **The End Result:** My server RAM is now stable, and the Teaching Assistants have stopped complaining about Vinci LMS being laggy.

---

# 🎯 **Conclusion**

This experience taught me that being fast isn't enough. As developers, **you** have to be smart about where you place the resource load. If you feel your server is slowing down, check if your UI is still huddling inside the VPS, or if your database is too massive for your available RAM.

The optimizations I performed:
- Migrated the UI to **Cloudflare Pages**.
- Used **MariaDB Alpine** for RAM efficiency.
- Tuned monitoring and implemented a **Swap File**.

Now, the Daffathan Labs server can breathe easy, and I can get back to coding without fearing another complaint notification!
