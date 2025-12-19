const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { marked } = require("marked");

async function main() {
  const dir = path.join(process.cwd(), "articles");
  const articles = [];

  const folders = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory());

  for (const folder of folders) {
    const folderPath = path.join(dir, folder);
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".md"));

    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      const rawMd = fs.readFileSync(fullPath, "utf8");

      // Extract locale from filename (e.g. "readme.en.md" or "readme-en.md" -> "en")
      let locale = "id"; // default
      const lowerFile = file.toLowerCase();
      if (lowerFile.endsWith(".en.md") || lowerFile.endsWith("-en.md")) {
        locale = "en";
      } else if (lowerFile.endsWith(".id.md") || lowerFile.endsWith("-id.md")) {
        locale = "id";
      }

      // Extract metadata
      const getMeta = (key) => {
        const regex = new RegExp(`<!--\\s*${key}:\\s*(.*?)\\s*-->`, "i");
        const match = rawMd.match(regex);
        return match ? match[1].trim() : null;
      };

      const title = getMeta("title");
      const excerpt = getMeta("excerpt");
      const date = getMeta("date");
      const image = getMeta("image");
      const posting_date = getMeta("posting_date");
      const tagsStr = getMeta("tags");
      const tags = tagsStr ? tagsStr.split(",").map(t => t.trim()) : [];

      // Remove metadata comments only
      let md = rawMd.replace(/<!--[\s\S]*?-->/g, "").trim();

      // Fix list formatting (very important)
      md = md.replace(/([^\n])\n(\s*[-*]\s)/g, "$1\n\n$2");

      // Convert Markdown → HTML
      let html = marked(md);

      // Clean unwanted HTML wrappers
      html = html
        .replace(/<\/?html[^>]*>/gi, "")
        .replace(/<\/?head[^>]*>/gi, "")
        .replace(/<\/?body[^>]*>/gi, "")
        .trim();

      console.log(`✔ Parsed [${locale.toUpperCase()}]: ${title}`);

      articles.push({
        title,
        excerpt,
        date,
        image,
        posting_date,
        tags,
        content: html,
        locale: locale,
      });
    }
  }

  console.log(`\n>> Sending ${articles.length} articles to backend...\n`);

  await axios.post(
    `${process.env.API_URL}/articles/sync`,
    articles,
    {
      headers: {
        Authorization: `Bearer ${process.env.API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log("🎉 Successfully published all articles!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
