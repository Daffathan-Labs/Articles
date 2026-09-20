<!-- title: web-slicing-skills — 1:1 UI Slicing for Claude Code, Playwright Included -->
<!-- excerpt: Two Claude Code skills for pixel-perfect web and mobile UI slicing from a mockup, now a public plugin. Playwright installs itself, no manual step after install. -->
<!-- date: 2026-09-18 -->
<!-- posting_date: 2026-09-18 -->
<!-- tags: Claude Code, Playwright, Plugin, Frontend, Developer Tools -->

# 🔪 web-slicing-skills
## 1:1 UI Slicing, Playwright Already Wired In

Matching a UI to a mockup pixel-for-pixel is usually manual work: open DevTools, measure everything by hand, flip back and forth between screenshots and eyeball the difference. I built these two skills to hand that work to Claude Code instead.

`/slice-web` covers websites and web apps, including mobile web. `/slice-mobile` covers Flutter, React Native/Expo, native Android, and native iOS. The source can be anything: a URL, an HTML file, an image, or a design MCP like Figma.

Both work the same way. The source gets measured with Playwright: computed style, color, spacing, all pulled from measurements, never guessed. The build gets laid over the source with `mix-blend-mode: difference`. Black means it matches, bright means it's off. It repeats section by section until what's left is just faint noise at the edges of the text.

I published it as its own public repo, ready to install as a Claude Code plugin:
👉 [github.com/daffa09/web-slicing-skills](https://github.com/daffa09/web-slicing-skills)

## Install

Easiest path, as a plugin:

```
/plugin marketplace add daffa09/web-slicing-skills
/plugin install web-slicing-skills@web-slicing-skills
```

Playwright installs itself during the first Claude Code session after install. No manual `npm install playwright`.

Want the short names `/slice-web` and `/slice-mobile` without the plugin? Copy the `skills/slice-web` and `skills/slice-mobile` folders from the repo into `~/.claude/skills/`.

## Usage

```
/slice-web https://example.com/pricing src/app/pricing/page.tsx
/slice-mobile ./mockup/onboarding.png OnboardingScreen
```

Leave out the source or target and it asks once upfront. After that it runs to completion without asking again, unless the source genuinely can't be opened.

## What it holds to

- Copy exactly, no redesigning, no swapped text, no added or missing elements.
- No new dependency in the project being sliced. Playwright runs in a separate folder, outside the target repo.
- Reuse the project's existing components and tokens instead of inventing new ones.

Full rules and steps live in each skill's `SKILL.md`, in the repo.
