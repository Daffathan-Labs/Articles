<!-- title: From GitHub Classroom to Vinci LMS — The Quiet Evolution of Programming Practicums -->
<!-- excerpt: A reflective note on why Vinci LMS was born—starting from GitHub Classroom’s limitations, pragmatic fixes using Telegram and shell scripts, to the need for a truly structured academic system. -->
<!-- image: https://github.com/user-attachments/assets/vinci-lms-cover-placeholder -->
<!-- date: 2026-01-02 -->
<!-- posting_date: 2026-01-02 -->
<!-- tags: Vinci LMS, GitHub Classroom, Education Technology, Software Engineering, Academic DevOps -->

# 🎓 From GitHub Classroom to Vinci LMS  
## The Quiet Evolution of Programming Practicums

<img width="6546" height="3676" alt="image" src="https://github.com/user-attachments/assets/vinci-lms-cover-placeholder" />

Vinci LMS **was not born from grand ambition**.  
It emerged from **small technical problems that kept repeating every semester**, until solving them manually no longer made sense.

At first, the goal was simply to be neat.  
Then, to be consistent.  
And eventually, it became clear:

> **This is not about tools. This is about systems.**

---

## 🧩 The Starting Point: GitHub Classroom (Conceptually Correct)

Conceptually, **GitHub Classroom is not wrong**.

It provides:
- a repository per student  
- native integration with GitHub  
- a *developer-first* workflow  

For programming practicums, this is a solid foundation.

The issue is not in the core features.  
The problem lies in **operational details**—small things that seem trivial, but become critical as the number of classes and students grows.

---

## ⚠️ The Real Problem: Inconsistent Repository Naming

One classic yet crucial issue:

> **GitHub Classroom repository naming is not truly consistent.**

In practice:
- students rename repositories themselves  
- typos appear across repos  
- random suffixes are added  
- naming formats differ between classes and semesters  

As a result:
- recap scripts fail to run reliably  
- teaching assistants must check manually  
- commit analysis automation becomes fragile  
- submission tracking loses determinism  

At this point, GitHub Classroom **loses the very property an academic system needs most**:  
**consistency and data readability.**

---

## 📩 The Role of Telegram (Not for Discussion)

Telegram was **never intended to be an LMS**,  
and **never used for academic discussion**.

Its role was very specific and limited:

- 🔧 **Repository renaming**
- 📦 **Assignment submission recap**

Telegram was chosen because it is:
- fast  
- real-time  
- familiar to everyone involved  

Not because it is ideal,  
but because it was **a practical way to cover gaps left by GitHub Classroom**.

---

## 🧪 A Temporary Technical Fix: Shell Scripts

With no official solution available, a familiar engineer’s response emerged:

- custom shell scripts
- used to:
  - bulk rename repositories  
  - normalize naming formats  
  - generate submission recaps  

These scripts **worked**.  
They were genuinely helpful.

But one realization slowly surfaced:

> *“If every semester requires additional scripts, then the system itself is incomplete.”*

Shell scripts became both **a helper**  
and **a warning sign** of deeper structural issues.

---

## 🚨 The Breaking Point: When Workarounds Become a Burden

Initially:
- 1 class → manageable  
- 2 classes → still under control  
- many parallel classes → chaos begins  

What followed:
- scripts grew more complex  
- edge cases multiplied  
- human dependency remained high  
- documentation became hard to pass down  

At this point, one thing was clear:

> **Workarounds do not scale.  
> A system must be built.**

---

## 🧠 The Birth of Vinci LMS

Vinci LMS **was not designed to replace GitHub Classroom**.

On the contrary:

> **Vinci LMS is a system layer built on top of GitHub Classroom.**

Its purpose:
- normalize data  
- read repositories consistently  
- eliminate ad-hoc scripts  
- move operational chaos into a repeatable and auditable system  

---

## 🏗️ The Core Philosophy of Vinci LMS

### 1️⃣ GitHub Remains Where Students Code
- no custom editors  
- no artificial sandboxes  
- real-world tooling stays intact  

---

### 2️⃣ Vinci Handles What GitHub Classroom Ignores
- academic structure  
- data consistency  
- automated recaps  
- accountable statistics  

---

### 3️⃣ No More “Heroic” Scripts
- no dependency on a single person  
- no magic commands without context  
- every process is documented and systematic  

---

## 📊 From Recap to Insight

At first, the goal was simply:
- clean repositories  
- working recaps  

Once the data became consistent, more meaningful questions emerged:

- who is truly learning consistently?  
- who only submits at the last minute?  
- whose progress is stagnating?  

This is where Vinci LMS evolved:  
from **a recap tool** into **an academic observation system**.

---

# 🧩 Vinci LMS Features & Roles

## 👥 User Roles

### 🟢 Admin / Practicum Coordinator  
**System authority holder**

- manage academic years & semesters  
- manage classes & sessions  
- import student rosters (CSV)  
- map Student ID ↔ GitHub username  
- view all repositories & grades  
- audit activity logs  
- export grades (CSV / Excel)  

---

### 🟡 Lecturer  
**Academic decision maker**

- view student repositories per class  
- check submission status & lateness  
- input & finalize grades  
- view grade recaps  
- export grades  
- ask the AI agent (only their own class data)  

---

### 🔵 Teaching Assistant  
**Technical operator**

- rename repositories (specific classes / sessions)  
- clone repositories  
- check submission status  
- input grades (optional)  

Limitations:
- ❌ cannot finalize grades  
- ❌ cannot manage global classes  

---

## 🧩 Core Features

### 1️⃣ User & Permission System
- GitHub OAuth  
- Role-Based Access Control (RBAC)  

➡️ Secure and accountable  

---

### 2️⃣ Roster & Class Management
- CSV roster import  
- multi-class & multi-semester support  
- detect students who haven’t joined or whose repos are missing  

➡️ Eliminates manual work  

---

### 3️⃣ Repository Management (CORE)
- bulk and per-class repository renaming  
- repository cloning  
- archive / lock repositories  
- repository status (normal / error / missing)  

➡️ Solves GitHub Classroom’s core pain point  

---

### 4️⃣ Assignments & Sessions
- session setup (1–14, projects, midterms/finals)  
- internal deadlines  
- automatic late detection (last commit)  

➡️ Lecturers no longer check repos one by one  

---

### 5️⃣ Grading & Grade Recaps
- per-student grade input  
- optional feedback  
- per-class & per-student recaps  
- CSV / Excel export  

➡️ The most “paid-for” feature by universities  

---

### 6️⃣ Activity Logs & Auditing
- who did what  
- when  
- on which repository  

➡️ Safe for accreditation and grade disputes  

---

### 7️⃣ 🤖 AI Agent (System Assistant)
Can:
- answer questions from lecturers, TAs, and admins  
- recap class data & grades  
- explain repository and submission errors  
- rename repositories  
- delete data  
- finalize grades  
- and more  

---

### 8️⃣ 📊 Student Coding Analytics
Per-student analytics based on commit history and code structure:

- commit patterns  
- work consistency  
- solution evolution  
- coding style & structure  
- AI-generated code indications (heuristic, non-punitive)  

Used for:
- identifying students who need guidance  
- lecturer reflection  
- practicum methodology evaluation  

---

## 🎯 Why Traditional LMSs Are Not Enough

Conventional LMSs:
- focus on files  
- focus on deadlines  

Programming practicums:
- live through process  
- grow through iteration  
- improve through errors  

These two worlds **need a bridge**.

---

## 🌱 Closing

Telegram and shell scripts **were not mistakes**.  
They were realistic engineering solutions.

But when temporary solutions:
- are used continuously  
- passed down every semester  
- become core dependencies  

They stop being solutions.

**Vinci LMS exists to break the workaround cycle**  
and give programming practicums **a system that is structured, calm, and accountable**.

Not because complexity is desired,  
but because **reality demands it**.
