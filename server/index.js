const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

const TECH_STACKS_DB_PATH = path.join(__dirname, 'tech_stacks.json');

// Built-in defaults used on first run or if the DB file is missing/corrupt
const DEFAULT_TECH_STACKS = [
  'React',
  'Next.js',
  'TypeScript',
  'JavaScript',
  'Node.js',
  'Angular',
  'Vue.js',
  'Java',
  'Spring Boot',
  'Python',
  'Django',
  'Flask',
];

const readTechStacksFromFile = () => {
  try {
    const raw = fs.readFileSync(TECH_STACKS_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_err) {
    // If the file does not exist or is malformed, fall through to defaults
  }

  return DEFAULT_TECH_STACKS;
};

const writeTechStacksToFile = (stacks) => {
  try {
    fs.writeFileSync(TECH_STACKS_DB_PATH, JSON.stringify(stacks, null, 2), 'utf8');
  } catch (err) {
    // Failing to persist should not crash the server; log for visibility.
    console.error('Failed to persist tech stacks DB:', err);
  }
};

// In-memory cache of tech stacks used when parsing job descriptions.
let techStacks = readTechStacksFromFile();

// Utility to escape user-provided labels when building regexes
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeUrl = (rawUrl) => {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch (_err) {
    return null;
  }
};

const extractText = (node) => (node ? node.trim() : '');

const pickFirst = (...values) => values.find((value) => !!value && value.length > 0);

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

  // Fall back to scanning the full page text for well-known tech stack names.
  // Many modern job boards (including Workday-hosted pages) embed the full job
  // description inside JSON blobs in <script> tags, so we also include all
  // script contents in the text we scan.
  const scriptText = $('script')
    .map((_, element) => $(element).text() || '')
    .get()
    .join('\n');

  const rawText = `${pageText || $('body').text()}\n${scriptText}`;

  // Build simple case-insensitive "word-ish" matchers based on the current tech stack DB.
  techStacks.forEach((label) => {
    if (!label || typeof label !== 'string') return;

    const normalized = label.trim();
    if (!normalized) return;

    let patternSource = `\\b${escapeRegex(normalized)}\\b`;

    // Heuristics for common tech variants so that, for example, a saved
    // "React" stack will still match "ReactJS" or "React.js" in job ads,
    // and "JavaScript" will also match a bare "JS" mention.
    if (/^React$/i.test(normalized)) {
      patternSource = '\\bReact(?:JS|\\.js)?\\b';
    } else if (/^Node(?:\\.js)?$/i.test(normalized)) {
      patternSource = '\\bNode(?:\\.js|JS)?\\b';
    } else if (/^JavaScript$/i.test(normalized)) {
      // Match "JavaScript" or standalone "JS" (not part of words like "NestJS")
      // Exclude "text/javascript", "application/javascript"
      // Exclude "enable JavaScript" (common browser warning)
      // AND exclude .js, /js, 'js', "js" to avoid code artifacts in scripts/urls
      patternSource = '(?<!(text|application)\\/|enable\\s)\\bJavaScript\\b|(?<![\\w./\'"-])JS(?![\\w])';
    } else if (/^TypeScript$/i.test(normalized)) {
      // Match "TypeScript" or standalone "TS" (not part of other words)
      patternSource = '\\bTypeScript\\b|(?<!\\w)TS(?!\\w)';
    } else if (/^AWS$/i.test(normalized)) {
      patternSource = '\\bAWS\\b|\\bAmazon Web Services\\b';
    }

    const pattern = new RegExp(patternSource, 'i');
    if (pattern.test(rawText)) {
      keywords.add(label);
    }
  });

  return Array.from(keywords);
};

const extractLocationHints = ($) => {
  const hints = new Set();

  $('p, span, li, div').each((_, element) => {
    const text = $(element).text().trim();
    if (!text || text.length < 4 || text.length > 100) return;

    // Generic "location-ish" descriptors we want to surface
    if (/on[-\s]?site|onsite|in[-\s]?office|hybrid/i.test(text)) {
      hints.add(text);
    }

    // Simple city/state or state/city patterns, e.g. "CA, San Jose" or "San Jose, CA"
    if (text.includes(',')) {
      const cityStateMatch = text.match(/\b[A-Z][a-zA-Z.\s]+,\s*[A-Z]{2}\b/);
      const stateCityMatch = text.match(/\b[A-Z]{2},\s*[A-Z][a-zA-Z.\s]+\b/);

      if (cityStateMatch) {
        hints.add(cityStateMatch[0].trim());
      }
      if (stateCityMatch) {
        hints.add(stateCityMatch[0].trim());
      }
    }
  });

  return Array.from(hints);
};

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Tech stacks CRUD (used by the client modal)
app.get('/api/tech-stacks', (_req, res) => {
  res.json({ techStacks });
});

app.put('/api/tech-stacks', (req, res) => {
  const incoming = Array.isArray(req.body?.techStacks) ? req.body.techStacks : null;

  if (!incoming) {
    return res.status(400).json({
      message: 'Expected body: { "techStacks": string[] }',
    });
  }

  const cleaned = Array.from(
    new Set(
      incoming
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    )
  );

  if (cleaned.length === 0) {
    return res.status(400).json({
      message: 'At least one tech stack must be provided.',
    });
  }

  techStacks = cleaned;
  writeTechStacksToFile(techStacks);

  res.json({ techStacks });
});

app.get('/api/job', async (req, res) => {
  try {
    const targetUrl = normalizeUrl(req.query.url);

    if (!targetUrl) {
      return res.status(400).json({
        message: 'Please provide a valid job URL via the "url" query parameter.',
      });
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'JD-Filter/1.0 (+https://github.com/openai) Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Remote source responded with ${response.status} while fetching ${targetUrl}`
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const ogTitle = $('meta[property="og:title"]').attr('content');
    const h1Title = $('h1').first().text();
    const pageTitle = $('title').first().text();
    const title = extractText(pickFirst(h1Title, ogTitle, pageTitle)) || 'Untitled role';

    const company =
      extractText($('meta[property="og:site_name"]').attr('content') || '') ||
      extractText($('[data-company-name]').first().text());

    // Collect various text sources once so we can reuse them for both
    // location and tech stack detection.
    const pageText = $('body').text();
    const metaDescription = $('meta[name="description"]').attr('content');
    const ogDescription = $('meta[property="og:description"]').attr('content');

    const scriptTextForRemote = $('script')
      .map((_, element) => $(element).text() || '')
      .get()
      .join('\n');

    const textForRemoteScan = [
      pageText,
      metaDescription,
      ogDescription,
      h1Title,
      ogTitle,
      pageTitle,
      scriptTextForRemote,
    ]
      .filter(Boolean)
      .join('\n');

    // Location logic:
    // - If we see strong evidence of "remote" (including meta tags, title, or
    //   JSON blobs in <script> tags) and no obvious "not remote" phrasing,
    //   mark as Remote.
    // - Otherwise mark as "Not Remote" and append any obvious location hints.
    const hasPositiveRemote = /\bremote\b/i.test(textForRemoteScan);
    const hasNegativeRemote = /\b(?:no|not|non)[-\s]?remote\b/i.test(textForRemoteScan);
    let location;

    if (hasPositiveRemote && !hasNegativeRemote) {
      location = 'Remote';
    } else {
      const hints = extractLocationHints($);
      location = hints.length > 0 ? `Not Remote\n${hints.join(' / ')}` : 'Not Remote';
    }

    // Feed an enriched text source (including meta descriptions) into the
    // tech-stack collector so that JDs rendered via client-side frameworks
    // still have a chance to be parsed.
    const textForStacksScan = [pageText, metaDescription, ogDescription].filter(Boolean).join('\n');
    const techStacks = collectKeywords($, textForStacksScan);
    const hostname = new URL(targetUrl).hostname.replace(/^www\./, '');

    const payload = {
      title,
      location,
      techStacks: techStacks.length > 0 ? techStacks : ['Not provided'],
      jobPlatform: hostname,
      company: company || undefined,
      url: targetUrl,
    };

    res.json(payload);
  } catch (error) {
    console.error('Failed to load job data:', error);
    res.status(500).json({
      message: 'Unable to fetch job data at the moment.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

