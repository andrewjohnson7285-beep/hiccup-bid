import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const JOB_ENDPOINT = `${API_BASE_URL}/api/job`;
const TECH_STACKS_ENDPOINT = `${API_BASE_URL}/api/tech-stacks`;

const buildJobFetchUrl = (sourceLink) => {
  const encoded = encodeURIComponent(sourceLink.trim());
  return `${JOB_ENDPOINT}?url=${encoded}`;
};

const isValidHttpUrl = (rawLink) => {
  if (!rawLink) return false;
  try {
    const parsed = new URL(rawLink.trim());
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (_err) {
    return false;
  }
};

const JobField = ({ label, children }) => (
  <div className="job-field">
    <p className="job-field-label">{label}</p>
    <p className="job-field-value">{children ?? '—'}</p>
  </div>
);

function App() {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | loaded | error
  const [error, setError] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [skippedLinks, setSkippedLinks] = useState([]);
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [savedTechStacks, setSavedTechStacks] = useState([]);
  const [techModalInput, setTechModalInput] = useState('');
  const isLoading = status === 'loading';
  const hasError = status === 'error';

  const { validLinks, invalidLinks, totalLinks } = useMemo(() => {
    const normalized = linkInput
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);

    return normalized.reduce(
      (acc, link) => {
        if (isValidHttpUrl(link)) {
          acc.validLinks.push(link);
        } else {
          acc.invalidLinks.push(link);
        }
        acc.totalLinks += 1;
        return acc;
      },
      { validLinks: [], invalidLinks: [], totalLinks: 0 }
    );
  }, [linkInput]);

  const hasLinks = totalLinks > 0;
  const hasInvalidLinks = invalidLinks.length > 0;
  const hasSkippedLinks = skippedLinks.length > 0;
  const invalidCount = invalidLinks.length + skippedLinks.length;

  const blockedLinkSet = useMemo(
    () => new Set(skippedLinks.map((entry) => entry.sourceLink)),
    [skippedLinks]
  );
  const fetchableLinks = useMemo(
    () => validLinks.filter((link) => !blockedLinkSet.has(link)),
    [validLinks, blockedLinkSet]
  );
  const readyLinkCount = fetchableLinks.length;

  const savedTechStackSet = useMemo(
    () => new Set(savedTechStacks.map((entry) => entry.toLowerCase())),
    [savedTechStacks]
  );

  useEffect(() => {
    setSkippedLinks([]);
  }, [linkInput]);

  useEffect(() => {
    const loadTechStacks = async () => {
      if (!TECH_STACKS_ENDPOINT) return;
      try {
        const response = await fetch(TECH_STACKS_ENDPOINT);
        if (!response.ok) {
          throw new Error('Failed to load tech stacks from server.');
        }
        const data = await response.json();
        const stacks = Array.isArray(data.techStacks) ? data.techStacks : [];
        setSavedTechStacks(stacks);
        setTechModalInput(stacks.join('\n'));
      } catch {
        // If the server is unavailable, leave the modal empty so the user can start fresh.
      }
    };

    loadTechStacks();
  }, []);

  const handleSaveTechStacks = useCallback(async () => {
    const entries = techModalInput
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    const unique = Array.from(new Set(entries));
    setSavedTechStacks(unique);

    if (TECH_STACKS_ENDPOINT && unique.length > 0) {
      try {
        const response = await fetch(TECH_STACKS_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ techStacks: unique }),
        });

        if (response.ok) {
          const data = await response.json();
          const stacks = Array.isArray(data.techStacks) ? data.techStacks : unique;
          setSavedTechStacks(stacks);
          setTechModalInput(stacks.join('\n'));
        }
      } catch {
        // If saving fails, we still keep the local state so the UI reflects the user's input.
      }
    }

    setIsTechModalOpen(false);
  }, [techModalInput]);

  const handleFetchLinks = useCallback(
    async () => {
      if (fetchableLinks.length === 0 || isLoading) return;

      setStatus('loading');
      setError('');

      try {
        const successfulJobs = [];
        const rejectedLinks = [];

        // Fetch one JD at a time, sequentially
        for (const sourceLink of fetchableLinks) {
          try {
            const response = await fetch(buildJobFetchUrl(sourceLink));

            if (!response.ok) {
              throw new Error(`Remote source responded with ${response.status}`);
            }

            const data = await response.json();
            successfulJobs.push({
              ...data,
              techStacks: Array.isArray(data.techStacks) ? data.techStacks : [data.techStacks],
              sourceLink,
            });
          } catch (singleError) {
            const reason =
              singleError instanceof Error
                ? singleError.message
                : 'Unable to fetch this link.';
            rejectedLinks.push({ sourceLink, reason });
          }
        }

        setJobs(successfulJobs);
        setSkippedLinks((prev) => {
          if (rejectedLinks.length === 0) return prev;
          const merged = new Map(prev.map((entry) => [entry.sourceLink, entry]));
          rejectedLinks.forEach((entry) => merged.set(entry.sourceLink, entry));
          return Array.from(merged.values());
        });
        setStatus('loaded');
      } catch (err) {
        setJobs([]);
        setStatus('error');
        setError(err.message ?? 'Something went wrong while fetching your jobs.');
      }
    },
    [fetchableLinks, isLoading]
  );

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Job digest</p>
          <h1>Online Job Description Filter</h1>
          <p className="lede">
            Paste multiple openings, fetch them, and scan the highlights in one glance.
          </p>
        </div>
        <button type="button" onClick={() => setIsTechModalOpen(true)}>
          Tech stack preferences
        </button>
      </header>

      {savedTechStacks.length > 0 && (
        <p className="helper-text saved-tech-summary">
          Tracking {savedTechStacks.length} tech stack
          {savedTechStacks.length === 1 ? '' : 's'}:{' '}
          {savedTechStacks.join(', ')}
        </p>
      )}

      {isTechModalOpen && (
        <div className="tech-modal-backdrop" role="dialog" aria-modal="true">
          <div className="tech-modal">
            <div className="tech-modal-header">
              <p className="eyebrow">Tech stacks</p>
              <h2>Tell us what you work with</h2>
              <p className="helper-text">
                Add each technology on a new line or separate them with commas. We&apos;ll
                highlight any matches we find in job descriptions.
              </p>
            </div>
            <textarea
              value={techModalInput}
              onChange={(event) => setTechModalInput(event.target.value)}
              placeholder={'React\nTypeScript\nNode.js'}
            />
            <div className="tech-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setIsTechModalOpen(false)}
              >
                Close
              </button>
              <button type="button" onClick={handleSaveTechStacks}>
                Save tech stacks
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="link-collector">
        <div className="link-collector-heading">
          <p className="job-field-label">Provide your own links</p>
          <p className="helper-text">
            Paste each URL on a new line. When you are ready, fetch the set and we&apos;ll
            gather the essentials.
          </p>
        </div>

        <textarea
          id="job-links"
          placeholder="https://example.com/job-one&#10;https://example.com/job-two"
          value={linkInput}
          onChange={(event) => setLinkInput(event.target.value)}
        />

        {(hasInvalidLinks || hasSkippedLinks) && (
          <div className="invalid-links" aria-live="polite">
            {hasInvalidLinks && (
              <>
                <p className="invalid-links-title">Malformed URLs</p>
                <ul className="invalid-links-list">
                  {invalidLinks.map((badLink, index) => (
                    <li key={`${badLink}-${index}`}>
                      <span>{badLink}</span>
                      <span className="invalid-link-reason">Fix the formatting and try again.</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {hasSkippedLinks && (
              <>
                <p className="invalid-links-title">Links we couldn&apos;t fetch</p>
                <ul className="invalid-links-list">
                  {skippedLinks.map((entry, index) => (
                    <li key={`${entry.sourceLink}-${index}`}>
                      <span>{entry.sourceLink}</span>
                      <span className="invalid-link-reason">
                        {entry.reason ?? 'Remote source refused the request.'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="invalid-links-footnote">
              These links are excluded from the next fetch unless you edit them.
            </p>
          </div>
        )}

        <div className="link-collector-actions">
          <p className="helper-text">
            {hasLinks
              ? `Detected ${totalLinks} link${totalLinks === 1 ? '' : 's'}${
                  invalidCount ? ` (${invalidCount} filtered out)` : ''
                } · ${readyLinkCount} ready`
              : 'No links added yet'}
          </p>
          <button
            type="button"
            onClick={handleFetchLinks}
            disabled={!hasLinks || readyLinkCount === 0 || isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? 'Fetching…' : 'Fetch details'}
          </button>
        </div>
      </section>

      <section className="job-results">
        {hasError && (
          <div className="status status-error">
            <p>{error}</p>
            <button type="button" onClick={handleFetchLinks}>
              Try again
            </button>
          </div>
        )}

        {!hasError && status === 'idle' && (
          <p className="helper-text">Add links above and fetch to see the digest.</p>
        )}

        {!hasError && status === 'loading' && (
          <p className="helper-text">Crunching the details for your links…</p>
        )}

        {!hasError && status === 'loaded' && jobs.length === 0 && (
          <p className="helper-text">No results found for the provided links.</p>
        )}

        {!hasError &&
          jobs.map((jobEntry, index) => (
            <article className="job-card" key={`${jobEntry.sourceLink}-${index}`}>
              <div className="job-heading">
                <p className="job-platform">{jobEntry.jobPlatform ?? 'Remote job board'}</p>
                <h2>{jobEntry.title ?? 'Untitled role'}</h2>
                {jobEntry.company && <p className="job-company">{jobEntry.company}</p>}
              </div>

              <div className="job-details">
                <JobField label="Location">
                  {jobEntry.location ?? (isLoading ? 'Fetching location…' : 'Not disclosed')}
                </JobField>
                <JobField label="Job Platform">{jobEntry.jobPlatform ?? 'RemoteOK'}</JobField>
                <JobField label="Link">
                  {jobEntry.sourceLink ? (
                    <a href={jobEntry.sourceLink} target="_blank" rel="noreferrer">
                      View posting ↗
                    </a>
                  ) : (
                    'Not provided'
                  )}
                </JobField>
              </div>

              <div className="job-tech">
                <p className="job-field-label">Tech Stacks</p>
                {savedTechStacks.length > 0 && (
                  <p className="helper-text job-tech-helper">
                    {jobEntry.techStacks?.some((tech) =>
                      savedTechStackSet.has(String(tech).toLowerCase())
                    )
                      ? 'We found matches with your saved tech stack.'
                      : 'No matches with your saved tech stack for this role.'}
                  </p>
                )}
                <div className="chip-row">
                  {(!jobEntry.techStacks || jobEntry.techStacks.length === 0) && (
                    <span className="chip muted">Not listed</span>
                  )}
                  {jobEntry.techStacks?.map((tech) => {
                    const isMatch = savedTechStackSet.has(String(tech).toLowerCase());
                    const hasAnyMatches = jobEntry.techStacks?.some((item) =>
                      savedTechStackSet.has(String(item).toLowerCase())
                    );
                    const classes = [
                      'chip',
                      isMatch ? 'match' : '',
                      hasAnyMatches && !isMatch ? 'dimmed' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <span className={classes} key={`${jobEntry.sourceLink}-${tech}`}>
                        {tech}
                      </span>
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
      </section>
    </main>
  );
}

export default App;
