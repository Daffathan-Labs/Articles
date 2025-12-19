
function testLocale(file) {
  let locale = "id"; // default
  const lowerFile = file.toLowerCase();
  if (lowerFile.endsWith(".en.md") || lowerFile.endsWith("-en.md")) {
    locale = "en";
  } else if (lowerFile.endsWith(".id.md") || lowerFile.endsWith("-id.md")) {
    locale = "id";
  }
  return locale;
}

const testFiles = [
  "readme.en.md",
  "readme-en.md",
  "readme.id.md",
  "readme-id.md",
  "my-article-en.md",
  "my.article.id.md",
  "normal.md"
];

testFiles.forEach(f => {
  console.log(`File: ${f} => Locale: ${testLocale(f)}`);
});
