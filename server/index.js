const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 4000;

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

const collectKeywords = ($) => {
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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
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

    // Simple location logic:
    // - If the page clearly mentions "remote", mark as Remote.
    // - Otherwise mark as "Not Remote" and append any obvious location hints.
    const pageText = $('body').text().toLowerCase();
    const hasRemoteWord = /\bremote\b/.test(pageText);
    let location;

    if (hasRemoteWord) {
      location = 'Remote';
    } else {
      const hints = extractLocationHints($);
      location = hints.length > 0 ? `Not Remote\n${hints.join(' / ')}` : 'Not Remote';
    }

    const techStacks = collectKeywords($);
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

