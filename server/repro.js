const cheerio = require('cheerio');

// Mock tech stacks
const techStacks = ['JavaScript', 'TypeScript', 'React'];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const collectKeywords = ($, pageText = '') => {
    const keywords = new Set();

    // Mocking the script text extraction from the original code
    const scriptText = $('script')
        .map((_, element) => $(element).text() || '')
        .get()
        .join('\n');

    const rawText = `${pageText || $('body').text()}\n${scriptText}`;

    techStacks.forEach((label) => {
        if (!label || typeof label !== 'string') return;

        const normalized = label.trim();
        if (!normalized) return;

        let patternSource = `\\b${escapeRegex(normalized)}\\b`;

        if (/^JavaScript$/i.test(normalized)) {
            // Match "JavaScript" or standalone "JS"
            // Exclude "text/javascript", "application/javascript", "text/JS", "application/JS"
            patternSource = '(?<!(text|application)\\/)\\bJavaScript\\b|(?<!(text|application)\\/|\\w)JS(?!\\w)';
        }

        const pattern = new RegExp(patternSource, 'i');
        if (pattern.test(rawText)) {
            keywords.add(label);
        }
    });

    return Array.from(keywords);
};

// Test Case 1: Mime type "text/javascript"
const html1 = `
<html>
<body></body>
<script>
  var type = "text/javascript";
</script>
</html>
`;

// Test Case 2: Mime type "application/javascript"
const html2 = `
<html>
<body></body>
<script>
  var type = "application/javascript";
</script>
</html>
`;

// Test Case 3: Valid "C/C++/JavaScript"
const html3 = `
<html>
<body>
  <p>Requirements: C/C++/JavaScript</p>
</body>
</html>
`;

// Test Case 4: Valid "JavaScript"
const html4 = `
<html>
<body>
  <p>Must know JavaScript.</p>
</body>
</html>
`;

const $1 = cheerio.load(html1);
console.log('Test 1 (text/javascript):', collectKeywords($1, $1('body').text()));

const $2 = cheerio.load(html2);
console.log('Test 2 (application/javascript):', collectKeywords($2, $2('body').text()));

const $3 = cheerio.load(html3);
console.log('Test 3 (C/C++/JavaScript):', collectKeywords($3, $3('body').text()));

const $4 = cheerio.load(html4);
console.log('Test 4 (JavaScript):', collectKeywords($4, $4('body').text()));

// Test Case 5: Mime type "text/JS" (less common but possible)
const html5 = `
<script>
  var type = "text/JS";
</script>
`;
const $5 = cheerio.load(html5);
console.log('Test 5 (text/JS):', collectKeywords($5, $5('body').text()));
