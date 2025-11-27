const cheerio = require('cheerio');

// 1. Mock the Tech Stacks DB (subset for testing)
const techStacks = [
    'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'Angular',
    'Vue.js', 'Java', 'Spring Boot', 'Python', 'Django', 'Flask', 'AWS'
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 2. Replicate the collectKeywords logic EXACTLY from server/index.js
const collectKeywords = ($, pageText = '') => {
    const keywords = new Set();
    const metaKeywords = $('meta[name="keywords"]').attr('content');
    if (metaKeywords) {
        metaKeywords
            .split(',')
            .map((keyword) => keyword.trim())
            .filter(Boolean)
            .forEach((keyword) => keywords.add(keyword));
    }

    $('meta[property="article:tag"]').each((_, element) => {
        const tag = $(element).attr('content');
        if (tag) {
            keywords.add(tag.trim());
        }
    });

    const scriptText = $('script')
        .map((_, element) => $(element).text() || '')
        .get()
        .join('\n');

    const rawText = `${pageText || $('body').text()}\n${scriptText}`;

    // Log the raw text size for context
    console.log(`\n[DEBUG] Total Raw Text Size: ${rawText.length} characters`);

    techStacks.forEach((label) => {
        if (!label || typeof label !== 'string') return;

        const normalized = label.trim();
        if (!normalized) return;

        let patternSource = `\\b${escapeRegex(normalized)}\\b`;

        if (/^React$/i.test(normalized)) {
            patternSource = '\\bReact(?:JS|\\.js)?\\b';
        } else if (/^Node(?:\\.js)?$/i.test(normalized)) {
            patternSource = '\\bNode(?:\\.js|JS)?\\b';
        } else if (/^JavaScript$/i.test(normalized)) {
            // THE FIX:
            patternSource = '(?<!(text|application)\\/)\\bJavaScript\\b|(?<![\\w./\'"-])JS(?![\\w])';
        } else if (/^TypeScript$/i.test(normalized)) {
            patternSource = '\\bTypeScript\\b|(?<!\\w)TS(?!\\w)';
        } else if (/^AWS$/i.test(normalized)) {
            patternSource = '\\bAWS\\b|\\bAmazon Web Services\\b';
        }

        const pattern = new RegExp(patternSource, 'i');
        if (pattern.test(rawText)) {
            keywords.add(label);

            // Extra Debugging for JavaScript matches
            if (label === 'JavaScript') {
                console.log(`\n[DEBUG] MATCH FOUND for "${label}"`);
                const globalPattern = new RegExp(patternSource, 'gi');
                let match;
                let count = 0;
                while ((match = globalPattern.exec(rawText)) !== null) {
                    count++;
                    const start = Math.max(0, match.index - 40);
                    const end = Math.min(rawText.length, match.index + 40);
                    const snippet = rawText.substring(start, end).replace(/\n/g, ' ');
                    console.log(`   Match #${count}: "${match[0]}" at index ${match.index}`);
                    console.log(`   Context: "...${snippet}..."`);
                    if (count >= 5) {
                        console.log('   (Stopping after 5 matches for brevity)');
                        break;
                    }
                }
            }
        }
    });

    return Array.from(keywords);
};

// 3. Fetch and Process
async function run() {
    const targetUrl = "https://www.radarfirst.com/careers/?gh_jid=4916448008&gh_src=Simplify";
    console.log(`Fetching ${targetUrl}...`);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'JD-Filter/1.0 (+https://github.com/openai) Mozilla/5.0',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const pageText = $('body').text();
        const metaDescription = $('meta[name="description"]').attr('content');
        const ogDescription = $('meta[property="og:description"]').attr('content');

        const textForStacksScan = [pageText, metaDescription, ogDescription].filter(Boolean).join('\n');

        console.log('\n--- START OF EXTRACTED CONTENT (Truncated) ---');
        console.log(textForStacksScan.substring(0, 500) + '...');
        console.log('--- END OF EXTRACTED CONTENT ---\n');

        const foundStacks = collectKeywords($, textForStacksScan);

        console.log('\n--------------------------------------------------');
        console.log('FINAL FILTERED RESULT (Tech Stacks):');
        console.log(JSON.stringify(foundStacks, null, 2));
        console.log('--------------------------------------------------');

    } catch (error) {
        console.error('Error:', error);
    }
}

run();
