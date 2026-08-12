<!-- title: Portfolio Evolution: From JSON to SQLite & AI Automation with n8n -->
<!-- excerpt: How I revamped my portfolio system using SQLite for simplicity and built an AI-powered content distribution pipeline to LinkedIn & Instagram using n8n. -->
<!-- image: https://raw.githubusercontent.com/Daffathan-Labs/Articles/main/articles/update-portfolio-sqlite-n8n/portfolio_automation_architecture.jpg -->
<!-- date: 2026-08-12 -->
<!-- posting_date: 2026-08-12 -->
<!-- tags: Tech, Portfolio, SQLite, n8n, AI, Automation, Architecture -->

# 🚀 Portfolio Evolution: From JSON to SQLite & AI Automation with n8n

<img width="800" alt="Portfolio Automation Architecture" src="https://raw.githubusercontent.com/Daffathan-Labs/Articles/main/articles/update-portfolio-sqlite-n8n/portfolio_automation_architecture.jpg" />

As time went by, managing projects and articles on my portfolio started to feel tedious. Initially, I used static JSON files to store all the data. It was simple at first, but JSON has a fatal flaw when it comes to updating data. Even if the file size is small, every time I add a single new article, the system has to rewrite the entire JSON file from start to finish. Imagine having 400 articles—does it make sense to rewrite all 400 just to add one? Absolutely not.

I finally decided it was time for a system upgrade. But not an over-engineered one. Instead of setting up heavy Docker containers just to run a database like PostgreSQL or MySQL, I chose the absolute simplest, most efficient path: **SQLite**.

### 🗃️ Why SQLite?
It's simple: SQLite runs directly on the server without needing any container setups. Since it exists as a single file, management is a breeze, yet it still provides the full power of a relational database. I can use standard SQL queries to manipulate, filter, and organize my portfolio content freely. It is the most straightforward solution—doing the simplest thing that actually works.

### 🤖 The Magic of n8n & AI Automation
The most exciting part of this update isn't just the database, it's the **automated publishing pipeline**. I built a full automation architecture using **n8n**. 

Here is how the workflow goes:
1. **Trigger:** I write my articles directly in my code editor using Markdown (`.md`), and then push them to my repository.
2. **AI Processing:** The moment the article is pushed, n8n catches the trigger. The Markdown text is fed into an AI agent. The AI reads the article, understands the context, generates relevant illustration images (like the one above!), and drafts the social media captions.
3. **Manual Approval via n8n:** Before anything goes live, the n8n system sends me an approval notification. All the drafted content—whether it is the caption for LinkedIn or the visual carousel for Instagram—is placed on hold. Once I review it and hit *approve*, the content is then automatically launched to both LinkedIn and Instagram.

With this system, my only job is to write code and text on GitHub. Everything else—image design, caption optimization, and social media distribution—is entirely handled by AI and n8n. The amount of time saved is incredible!

### 🔮 Next Step: Automated Educational Content
Looking forward, I don't want my social media feeds to go completely dead when I'm too busy to create organic content. So, the next mission is to implement **automated static content**. 

While organic, personal content will always be the main dish, I will instruct this AI system to periodically generate non-organic educational content—sharing tech knowledge, tutorials, and interesting facts. This ensures that the feed stays active and continues spreading knowledge even when I am hands-off.

Work smart, not just hard, right?
