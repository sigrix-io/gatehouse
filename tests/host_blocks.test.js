/* The host blocks, driven by the three documents a host hands in.
 *
 * The fixtures are written in the shapes a host builds: an app summary per
 * app, a run row per run, and one usage summary for a period. Every block is
 * drawn with `locale: 'en-US'` and `timeZone: 'UTC'`, so what a test reads is
 * the same on any machine; the formatting suite below says what changes when a
 * host names others.
 *
 *   - each block draws what its document says, as text;
 *   - a document in another version, or missing what its shape requires, is
 *     refused whole and said to be;
 *   - a link is drawn only to a web address;
 *   - a cost is always called an estimate;
 *   - nothing is fetched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe as suite, it, expect, beforeEach, vi } from 'vitest';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(HERE, '../src');
const FIXTURES = path.resolve(HERE, 'fixtures/host_blocks');
const DESCRIBE_FIXTURES = path.resolve(HERE, 'fixtures/postern_describe');

const RUN_MODULES = ['postern_client.js', 'run_view_model.js', 'refusal_copy.js', 'run_renderer.js'];
const OPTIONS = { locale: 'en-US', timeZone: 'UTC' };

function load(names) {
  names.forEach(name => {
    // eslint-disable-next-line no-new-func
    new Function(fs.readFileSync(path.join(SRC, name), 'utf8')).call(window);
  });
  return window.Gatehouse;
}

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function mountPoint() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

/* `Intl` writes a narrow no-break space before "PM" in some ICU builds. */
function words(node) {
  return node.textContent.replace(/\s+/g, ' ').trim();
}

function drawApp(summary, options) {
  const NS = load(['host_blocks.js']);
  const container = mountPoint();
  new NS.AppCard(container, summary, Object.assign({}, OPTIONS, options)).render();
  return container;
}

function drawRuns(rows, options) {
  const NS = load(['host_blocks.js']);
  const container = mountPoint();
  new NS.RunHistory(container, rows, Object.assign({}, OPTIONS, options)).render();
  return container;
}

function drawUsage(usage, options) {
  const NS = load(['host_blocks.js']);
  const container = mountPoint();
  new NS.UsageSummary(container, usage, Object.assign({}, OPTIONS, options)).render();
  return container;
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.Gatehouse;
  delete window.SigrixRun;
});

suite('an app card', () => {
  it('draws the app from its summary', () => {
    const [ready] = fixture('apps.json');
    const container = drawApp(ready);
    const card = container.querySelector('.gh-app');
    expect(card.dataset.appId).toBe('a-property-copy');
    expect(words(card.querySelector('.gh-app-name'))).toBe('Property copy');
    expect(card.querySelector('.gh-app-name').tagName).toBe('H3');
    expect(words(card.querySelector('.gh-app-summary'))).toBe("Writes a property's description from the agent's notes.");
    expect(words(card.querySelector('.gh-app-by'))).toBe('by fernhill');
    expect(words(card.querySelector('.gh-app-meta'))).toBe('Last run Sep 30, 2026, 3:47 PM');
    const open = card.querySelector('a.gh-app-open');
    expect(words(open)).toBe('Open');
    expect(new URL(open.href).pathname).toBe('/apps/a-property-copy/run');
  });

  it('says the state in words, in the tone it means', () => {
    const [ready, needsKey, ended] = fixture('apps.json');
    const tone = summary => {
      document.body.innerHTML = '';
      const status = drawApp(summary).querySelector('.gh-status');
      return [words(status), [...status.classList].filter(name => name.startsWith('gh-status--'))];
    };
    expect(tone(ready)).toEqual(['Ready', ['gh-status--ok']]);
    expect(tone(needsKey)).toEqual(['Needs a key', ['gh-status--caution']]);
    expect(tone(ended)).toEqual(['Access ended', ['gh-status--quiet']]);
    expect(tone(Object.assign({}, ready, { state: 'unavailable' }))).toEqual(['Unavailable', ['gh-status--blocked']]);
    expect(tone(Object.assign({}, ready, { state: 'starting' }))).toEqual(['Starting', ['gh-status--quiet']]);
  });

  it('names a state it does not know as the host spelled it, untoned', () => {
    const [ready] = fixture('apps.json');
    const status = drawApp(Object.assign({}, ready, { state: 'paused_for_billing' })).querySelector('.gh-status');
    expect(words(status)).toBe('paused_for_billing');
    expect(status.classList.contains('gh-status--quiet')).toBe(true);
  });

  it('lists a missing key with what it is for and where to get one', () => {
    const [, needsKey] = fixture('apps.json');
    const card = drawApp(needsKey).querySelector('.gh-app');
    const key = card.querySelector('.gh-app-key');
    expect(words(key.querySelector('.gh-app-key-env'))).toBe('CRM_API_KEY');
    expect(words(key)).toContain('not set');
    expect(words(key)).toContain('Reads your contacts');
    const link = key.querySelector('a.gh-app-key-link');
    expect(link.href).toBe('https://crm.example.com/keys');
    expect(link.rel).toBe('noopener noreferrer');
    // No run yet, and access running until a date.
    expect(words(card.querySelector('.gh-app-meta'))).toBe('No runs yet · Access ends Oct 1, 2027');
  });

  it('says when access ended, and offers no way in once it has', () => {
    const [, , ended] = fixture('apps.json');
    const card = drawApp(ended).querySelector('.gh-app');
    expect(words(card.querySelector('.gh-app-meta'))).toBe('Last run Aug 30, 2026, 9:12 AM · Access ended Aug 31, 2026');
    expect(card.querySelector('.gh-app-open')).toBeNull();
  });

  it('draws an author\'s markup as the characters they typed', () => {
    const [ready] = fixture('apps.json');
    const container = drawApp(Object.assign({}, ready, {
      name: '<img src=x onerror="alert(1)">',
      summary: '<script>alert(2)</script>',
      by: '<b>fernhill</b>',
    }));
    expect(container.querySelector('img, script, b')).toBeNull();
    expect(words(container.querySelector('.gh-app-name'))).toBe('<img src=x onerror="alert(1)">');
    expect(words(container.querySelector('.gh-app-summary'))).toBe('<script>alert(2)</script>');
  });

  it('takes the heading level a host asks for, between 2 and 6', () => {
    const [ready] = fixture('apps.json');
    expect(drawApp(ready, { headingLevel: 2 }).querySelector('.gh-app-name').tagName).toBe('H2');
    document.body.innerHTML = '';
    expect(drawApp(ready, { headingLevel: 9 }).querySelector('.gh-app-name').tagName).toBe('H3');
  });

  it('draws itself again from a new summary, replacing what was there', () => {
    const NS = load(['host_blocks.js']);
    const [ready, needsKey] = fixture('apps.json');
    const container = mountPoint();
    const card = new NS.AppCard(container, ready, OPTIONS);
    card.render();
    card.update(needsKey);
    expect(container.querySelectorAll('.gh-app')).toHaveLength(1);
    expect(words(container.querySelector('.gh-app-name'))).toBe('Lead digest');
  });
});

suite('an app list', () => {
  it('draws a card per summary, in the order given', () => {
    const NS = load(['host_blocks.js']);
    const container = mountPoint();
    new NS.AppList(container, fixture('apps.json'), OPTIONS).render();
    const names = [...container.querySelectorAll('.gh-app-item .gh-app-name')].map(words);
    expect(names).toEqual(['Property copy', 'Lead digest', 'Viewing notes']);
    expect(container.querySelector('.gh-note')).toBeNull();
  });

  it('says so when there are none, in the host\'s words if it gave some', () => {
    const NS = load(['host_blocks.js']);
    const bare = mountPoint();
    new NS.AppList(bare, [], OPTIONS).render();
    expect(words(bare.querySelector('.gh-empty'))).toBe('No apps yet.');
    const worded = mountPoint();
    new NS.AppList(worded, [], Object.assign({ emptyText: 'Nothing to run here yet.' }, OPTIONS)).render();
    expect(words(worded.querySelector('.gh-empty'))).toBe('Nothing to run here yet.');
  });
});

suite('a document is read whole, or refused whole', () => {
  it('refuses an app summary in a version it does not read, drawing none of it', () => {
    const [ready] = fixture('apps.json');
    [2, '1', undefined].forEach(version => {
      document.body.innerHTML = '';
      const container = drawApp(Object.assign({}, ready, { v: version }));
      expect(container.querySelector('.gh-app-name')).toBeNull();
      expect(words(container.querySelector('.gh-refuse'))).toContain('this client reads version 1');
    });
  });

  it('names the member a summary is missing', () => {
    const [ready] = fixture('apps.json');
    const container = drawApp(Object.assign({}, ready, { name: undefined }));
    expect(words(container.querySelector('.gh-refuse'))).toBe('This app could not be shown. "name" is missing.');
  });

  it('draws the rest of a list and says what it left out', () => {
    const NS = load(['host_blocks.js']);
    const [ready, needsKey, ended] = fixture('apps.json');
    const container = mountPoint();
    new NS.AppList(container, [ready, Object.assign({}, needsKey, { v: 2 }), ended, 'not a summary'], OPTIONS).render();
    expect([...container.querySelectorAll('.gh-app-name')].map(words)).toEqual(['Property copy', 'Viewing notes']);
    expect(words(container.querySelector('.gh-note'))).toBe(
      '2 apps could not be shown. The first: An app summary carries version 2, and this client reads version 1.'
    );
  });

  it('refuses a list that is not one', () => {
    const NS = load(['host_blocks.js']);
    const container = mountPoint();
    new NS.RunHistory(container, { v: 1 }, OPTIONS).render();
    expect(words(container.querySelector('.gh-refuse'))).toContain('something other than a list');
  });

  it('refuses a run row whose figures are not figures', () => {
    const [done] = fixture('runs.json');
    const container = drawRuns([Object.assign({}, done, { input_tokens: -3 })]);
    expect(container.querySelector('.gh-run')).toBeNull();
    expect(words(container.querySelector('.gh-note'))).toBe('1 run could not be shown. "input_tokens" is not a count.');
  });

  it('refuses a usage summary in another version', () => {
    const container = drawUsage(Object.assign(fixture('usage.json'), { v: 2 }));
    expect(container.querySelector('.gh-usage-stats')).toBeNull();
    expect(words(container.querySelector('.gh-refuse'))).toBe(
      'This usage could not be shown. A usage summary carries version 2, and this client reads version 1.'
    );
  });

  it('lets a host read a document the way the blocks do', () => {
    const NS = load(['host_blocks.js']);
    expect(NS.hostData.VERSION).toBe(1);
    expect(NS.hostData.readUsageSummary(fixture('usage.json')).value.runs).toBe(128);
    expect(NS.hostData.readRunRow({ v: 1 }).refusal).toBe('"app_id" is missing.');
  });
});

/* One table for both places a runner author's address becomes a link: the run
 * page's credential row and the card's missing key. They apply one rule, and
 * a rule kept in two files is held to one table or it drifts. */
const ADDRESSES = [
  ['https://platform.openai.com/api-keys', true],
  ['http://keys.example.com/new', true],
  ['javascript:alert(1)', false],
  [' JavaScript:alert(1)', false],
  ['java\tscript:alert(1)', false],
  ['data:text/html,<b>x</b>', false],
  ['vbscript:msgbox(1)', false],
  ['mailto:keys@example.com', false],
  ['/keys', false],
  ['', false],
];

suite('a link is drawn only to a web address', () => {
  ADDRESSES.forEach(([address, linked]) => {
    it(`${linked ? 'links' : 'does not link'} ${JSON.stringify(address)}, on the card and on the run page`, async () => {
      const [, needsKey] = fixture('apps.json');
      const card = drawApp(Object.assign({}, needsKey, {
        missing_keys: [{ env: 'CRM_API_KEY', purpose: 'Reads your contacts', signup_url: address }],
      }));
      const cardLink = card.querySelector('.gh-app-key-link');
      expect(Boolean(cardLink), 'card').toBe(linked);
      // The key is still listed either way: only the link goes.
      expect(words(card.querySelector('.gh-app-key'))).toContain('CRM_API_KEY');

      document.body.innerHTML = '';
      delete window.Gatehouse;
      const NS = load(RUN_MODULES);
      const describeDoc = JSON.parse(fs.readFileSync(path.join(DESCRIBE_FIXTURES, 'pipeline_crew.describe.json'), 'utf8'));
      const statusDoc = JSON.parse(fs.readFileSync(path.join(DESCRIBE_FIXTURES, 'pipeline_crew.status.json'), 'utf8'));
      describeDoc.credentials[0].signup_url = address;
      const container = mountPoint();
      await new NS.RunRenderer(container, {
        describe: () => Promise.resolve(describeDoc),
        status: () => Promise.resolve(statusDoc),
        run: () => Promise.resolve({}),
        stream: () => Promise.resolve(),
      }).load();
      const runLink = container.querySelector('.run-credential-link');
      expect(Boolean(runLink), 'run page').toBe(linked);
      if (linked) {
        expect(runLink.href).toBe(new URL(address).href);
        expect(cardLink.href).toBe(new URL(address).href);
      }
    });
  });

  it('opens an app at a path on the host\'s own page, and never at a script', () => {
    const [ready] = fixture('apps.json');
    const open = url => {
      document.body.innerHTML = '';
      return drawApp(Object.assign({}, ready, { run_url: url })).querySelector('.gh-app-open');
    };
    expect(new URL(open('/apps/a-property-copy/run').href).pathname).toBe('/apps/a-property-copy/run');
    expect(open('https://apps.example.com/run').href).toBe('https://apps.example.com/run');
    expect(open('javascript:alert(1)')).toBeNull();
    expect(open('')).toBeNull();
  });
});

suite('a run history', () => {
  it('draws a row per run, in the order given', () => {
    const container = drawRuns(fixture('runs.json'));
    const rows = [...container.querySelectorAll('tbody .gh-run')];
    expect(rows).toHaveLength(4);
    expect(rows.map(row => row.dataset.runId || '')).toEqual(['r-4c1d', 'r-77ae', '', 'r-09bc']);
    expect(rows[0].children[0].textContent.replace(/\s+/g, ' ')).toBe('Sep 30, 2026, 3:47 PM');
  });

  it('heads its columns, calling the cost an estimate', () => {
    const heads = [...drawRuns(fixture('runs.json')).querySelectorAll('thead th')].map(words);
    expect(heads).toEqual(['Started', 'App', 'Outcome', 'Duration', 'Tokens in', 'Tokens out', 'Cost (estimate)', 'Model']);
  });

  it('says how each run ended, with the host\'s sentence beneath', () => {
    const rows = [...drawRuns(fixture('runs.json')).querySelectorAll('tbody .gh-run')];
    const outcome = row => {
      const status = row.querySelector('.gh-status');
      const tone = [...status.classList].find(name => name.startsWith('gh-status--'));
      const detail = row.querySelector('.gh-run-detail');
      return [words(status), tone, detail ? words(detail) : null];
    };
    expect(rows.map(outcome)).toEqual([
      ['Done', 'gh-status--ok', null],
      ['Timed out', 'gh-status--caution', 'Stopped at the 240-second limit.'],
      ['Failed', 'gh-status--blocked', 'The app did not start.'],
      ['Cancelled', 'gh-status--quiet', 'Stopped by the person running it.'],
    ]);
  });

  it('writes durations, counts and costs for reading, and a dash for what is not known', () => {
    const rows = [...drawRuns(fixture('runs.json')).querySelectorAll('tbody .gh-run')];
    const figures = row => [...row.querySelectorAll('.gh-num')].map(words);
    expect(rows.map(figures)).toEqual([
      ['38 s', '11,860', '3,420', '$0.06'],
      ['4 min', '52,210', '0', '$0.16'],
      ['under 1 s', '0', '0', '—'],
      // Under a cent is said to be, not rounded to free.
      ['2 min 5 s', '410', '12', '< $0.01'],
    ]);
    expect(words(rows[2].lastElementChild)).toBe('—');
    expect(words(rows[1].lastElementChild)).toBe('claude-sonnet-4-6');
  });

  it('drops the app column for a page about one app', () => {
    const container = drawRuns(fixture('runs.json'), { showApp: false });
    expect([...container.querySelectorAll('thead th')].map(words)).not.toContain('App');
    expect(container.querySelector('tbody .gh-run').children).toHaveLength(7);
  });

  it('names an outcome it does not know as the host spelled it', () => {
    const [done] = fixture('runs.json');
    const status = drawRuns([Object.assign({}, done, { outcome: 'queued' })]).querySelector('.gh-status');
    expect(words(status)).toBe('queued');
    expect(status.classList.contains('gh-status--quiet')).toBe(true);
  });

  it('says so when there are no runs', () => {
    expect(words(drawRuns([]).querySelector('.gh-empty'))).toBe('No runs yet.');
  });

  it('scrolls inside its own box, which a keyboard can reach', () => {
    const scroller = drawRuns(fixture('runs.json')).querySelector('.gh-table-scroll');
    expect(scroller.tabIndex).toBe(0);
    expect(scroller.getAttribute('role')).toBe('region');
    expect(scroller.getAttribute('aria-label')).toBe('Runs');
  });
});

suite('a usage summary', () => {
  it('heads the period with its name and its days', () => {
    const container = drawUsage(fixture('usage.json'));
    expect(words(container.querySelector('.gh-usage-title'))).toBe('September 2026');
    expect(words(container.querySelector('.gh-usage-dates'))).toBe('Sep 1, 2026 – Sep 30, 2026');
  });

  it('leads with four figures, the cost called an estimate', () => {
    const tiles = [...drawUsage(fixture('usage.json')).querySelectorAll('.gh-usage-stat')].map(tile => [
      words(tile.querySelector('.gh-usage-label')),
      words(tile.querySelector('.gh-usage-value')),
      tile.querySelector('.gh-usage-note') ? words(tile.querySelector('.gh-usage-note')) : null,
    ]);
    expect(tiles).toEqual([
      ['Runs', '128', '124 finished'],
      ['Tokens in', '1.4M', null],
      ['Tokens out', '396.7K', null],
      ['Estimated cost', '$8.46', 'An estimate, not a bill'],
    ]);
  });

  it('states each cap in words, with a bar of the same share', () => {
    const caps = [...drawUsage(fixture('usage.json')).querySelectorAll('.gh-cap')];
    expect(caps.map(cap => words(cap.querySelector('.gh-cap-label')))).toEqual([
      '3 of 10 runs in the last 24 hours',
      '$8.46 of $25.00 estimated spend this period',
    ]);
    const meters = caps.map(cap => cap.querySelector('.gh-meter'));
    expect(meters.map(meter => meter.querySelector('.gh-meter-fill').style.width)).toEqual(['30%', '33.8%']);
    expect(meters.every(meter => meter.classList.contains('gh-meter--clear'))).toBe(true);
    expect(meters.every(meter => meter.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('warns as a cap nears and says when it is reached', () => {
    const usage = fixture('usage.json');
    usage.caps = { runs_per_day: 10, runs_used: 10, spend_per_period: 10 };
    const caps = [...drawUsage(usage).querySelectorAll('.gh-cap')];
    expect(words(caps[0])).toBe('10 of 10 runs in the last 24 hours — the limit is reached');
    expect(caps[0].querySelector('.gh-meter').classList.contains('gh-meter--full')).toBe(true);
    // $8.46 of $10.00 is 85%: past the warning line, short of the cap.
    expect(words(caps[1])).toBe('$8.46 of $10.00 estimated spend this period');
    expect(caps[1].querySelector('.gh-meter').classList.contains('gh-meter--near')).toBe(true);
  });

  it('draws no cap a plan does not set', () => {
    const usage = fixture('usage.json');
    usage.caps = { runs_per_day: null, runs_used: null, spend_per_period: null };
    expect(drawUsage(usage).querySelector('.gh-caps')).toBeNull();
  });

  it('draws runs per day as columns, the tallest the full height', () => {
    const chart = drawUsage(fixture('usage.json')).querySelector('.gh-days');
    expect(words(chart.querySelector('.gh-days-title'))).toBe('Runs per day');
    const days = [...chart.querySelectorAll('.gh-day')];
    expect(days.map(day => day.querySelector('.gh-day-bar').style.height)).toEqual(['62.5%', '0%', '100%', '25%']);
    expect(days.map(day => words(day.querySelector('.gh-day-tip')))).toEqual([
      'Sep 1, 2026 · 5 runs', 'Sep 2, 2026 · 0 runs', 'Sep 3, 2026 · 8 runs', 'Sep 4, 2026 · 2 runs',
    ]);
    // The tallest is labelled; the plot is drawn for the eye, and the table is
    // what a screen reader and a keyboard read.
    expect(words(chart.querySelector('.gh-days-max'))).toBe('8 runs');
    expect(chart.querySelector('.gh-days-plot').getAttribute('aria-hidden')).toBe('true');
    expect([...chart.querySelectorAll('.gh-days-axis-label')].map(words)).toEqual(['Sep 1, 2026', 'Sep 4, 2026']);
  });

  it('puts every day\'s figure in a table beside the chart', () => {
    const table = drawUsage(fixture('usage.json')).querySelector('.gh-days-table');
    expect(table.tagName).toBe('DETAILS');
    const rows = [...table.querySelectorAll('tbody tr')].map(row => [...row.children].map(words));
    expect(rows).toEqual([['Sep 1, 2026', '5'], ['Sep 2, 2026', '0'], ['Sep 3, 2026', '8'], ['Sep 4, 2026', '2']]);
  });

  it('breaks the period down by app, totalled from the summary\'s own figures', () => {
    const usage = fixture('usage.json');
    // A host whose per-app rows do not add up: the totals are the period's,
    // never a sum this client made of what it was shown.
    usage.by_app = usage.by_app.slice(0, 1);
    const container = drawUsage(usage);
    const tables = [...container.querySelectorAll('.gh-table-scroll .gh-table')];
    const byApp = tables[tables.length - 1];
    expect([...byApp.querySelectorAll('thead th')].map(words)).toEqual(['App', 'Runs', 'Tokens in', 'Tokens out', 'Cost (estimate)']);
    expect([...byApp.querySelectorAll('tbody tr')].map(row => [...row.children].map(words))).toEqual([
      ['Property copy', '71', '852,000', '248,500', '$4.62'],
    ]);
    expect([...byApp.querySelector('tfoot tr').children].map(words)).toEqual(['All apps', '128', '1,391,600', '396,700', '$8.46']);
  });
});

suite('formats', () => {
  it('follows the locale a host names, and the reader\'s own for one Intl refuses', () => {
    const german = drawUsage(fixture('usage.json'), { locale: 'de-DE' });
    expect(words(german.querySelector('tfoot tr').children[2])).toBe('1.391.600');
    document.body.innerHTML = '';
    expect(() => drawUsage(fixture('usage.json'), { locale: 'not a locale!', timeZone: 'Nowhere/Never' })).not.toThrow();
  });

  it('writes a bare date as the day it names, in any time zone', () => {
    // Midnight UTC on the 1st is the 31st in Los Angeles; a bare date is a day.
    const container = drawUsage(fixture('usage.json'), { timeZone: 'America/Los_Angeles' });
    expect(words(container.querySelector('.gh-usage-dates'))).toBe('Sep 1, 2026 – Sep 30, 2026');
  });

  it('writes a moment in the time zone a host names', () => {
    const [done] = fixture('runs.json');
    const row = drawRuns([done], { timeZone: 'Asia/Tokyo' }).querySelector('tbody .gh-run');
    expect(row.children[0].textContent.replace(/\s+/g, ' ')).toBe('Oct 1, 2026, 12:47 AM');
  });
});

suite('the boundary', () => {
  it('fetches nothing while drawing', () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('no network here')));
    window.fetch = fetchSpy;
    const NS = load(['host_blocks.js']);
    new NS.AppList(mountPoint(), fixture('apps.json'), OPTIONS).render();
    new NS.RunHistory(mountPoint(), fixture('runs.json'), OPTIONS).render();
    new NS.UsageSummary(mountPoint(), fixture('usage.json'), OPTIONS).render();
    expect(fetchSpy).not.toHaveBeenCalled();
    delete window.fetch;
  });

  it('stands alone: a page of blocks loads no run script', () => {
    const NS = load(['host_blocks.js']);
    expect(NS.RunRenderer).toBeUndefined();
    const container = mountPoint();
    new NS.AppList(container, fixture('apps.json'), OPTIONS).render();
    expect(container.querySelectorAll('.gh-app')).toHaveLength(3);
  });

  it('joins the namespace the run scripts built, without replacing it', () => {
    const NS = load([...RUN_MODULES, 'host_blocks.js']);
    expect(NS.RunRenderer).toBeTypeOf('function');
    expect(NS.AppCard).toBeTypeOf('function');
    expect(window.SigrixRun).toBe(window.Gatehouse);
  });
});
