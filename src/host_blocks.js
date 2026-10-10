/* Blocks a host draws from its own data: an app card, a list of them, a run
 * history and a usage summary.
 *
 * The run page speaks Postern; these do not. They are handed documents the
 * host built from what it already holds, so a page listing four apps wakes no
 * runner to draw itself, and they fetch nothing at all. Every document carries
 * `"v": 1`, and a block refuses a version it does not read, whole, rather than
 * drawing whichever members it happens to recognise.
 *
 * **Nothing here uses `innerHTML`**, for the run page's reason: an app's name
 * and summary are its author's prose, a model's name is whatever a runner
 * reported, and all of it reaches the page through `textContent`. The only
 * attributes written from the data are a link's address, which must be a web
 * address, and the host's own ids, kept as data for the host's scripts.
 */
(function (global) {
  const root = global || (typeof window !== 'undefined' ? window : {});

  /* The one version of the three shapes this file reads. */
  const VERSION = 1;

  /* What an app's state is called here, and the tone it is drawn in. A state
   * this client has not heard of is shown as the host spelled it, untoned,
   * rather than guessed into one of these. */
  const APP_STATES = {
    ready: { label: 'Ready', tone: 'ok' },
    needs_key: { label: 'Needs a key', tone: 'caution' },
    starting: { label: 'Starting', tone: 'quiet' },
    unavailable: { label: 'Unavailable', tone: 'blocked' },
    ended: { label: 'Access ended', tone: 'quiet' },
  };

  /* How a run ended. Same rule for an outcome this client does not know. */
  const OUTCOMES = {
    done: { label: 'Done', tone: 'ok' },
    timed_out: { label: 'Timed out', tone: 'caution' },
    failed: { label: 'Failed', tone: 'blocked' },
    cancelled: { label: 'Cancelled', tone: 'quiet' },
  };

  /* The share of a cap at or past which its meter turns to a warning. */
  const NEAR_CAP = 0.8;

  function el(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined && textContent !== null) node.textContent = String(textContent);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  /* ---------- reading the documents ----------
   *
   * Each reader answers `{ value }` or `{ refusal }`, never both. A refusal is
   * one sentence naming what was wrong, because the person who reads it is
   * whoever built the host's data, and "could not be shown" alone would send
   * them to the source. A member the shape does not name is ignored. */

  class Fault extends Error {}

  function versionOf(doc, what) {
    if (!isObject(doc)) throw new Fault(what + ' is not an object.');
    if (doc.v !== VERSION) {
      const given = doc.v === undefined ? 'no version' : 'version ' + String(doc.v);
      throw new Fault(what + ' carries ' + given + ', and this client reads version ' + VERSION + '.');
    }
  }

  function textMember(doc, key, required) {
    const value = doc[key];
    if (value === undefined || value === null) {
      if (required) throw new Fault('"' + key + '" is missing.');
      return '';
    }
    if (typeof value !== 'string') throw new Fault('"' + key + '" is not text.');
    if (required && !value.trim()) throw new Fault('"' + key + '" is empty.');
    return value;
  }

  function countMember(doc, key) {
    const value = doc[key];
    if (!Number.isInteger(value) || value < 0) throw new Fault('"' + key + '" is not a count.');
    return value;
  }

  function amountMember(doc, key, nullable) {
    const value = doc[key];
    if ((value === undefined || value === null) && nullable) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Fault('"' + key + '" is not an amount.');
    }
    return value;
  }

  function timeMember(doc, key, nullable) {
    const value = doc[key];
    if ((value === undefined || value === null) && nullable) return null;
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      throw new Fault('"' + key + '" is not a date.');
    }
    return value;
  }

  function listMember(doc, key) {
    const value = doc[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new Fault('"' + key + '" is not a list.');
    return value;
  }

  /* An ISO 4217 code, which is what `Intl` formats a sum in. */
  function currencyMember(doc, key) {
    const value = textMember(doc, key, true);
    if (!/^[A-Z]{3}$/.test(value)) throw new Fault('"' + key + '" is not a currency code.');
    return value;
  }

  function read(what, doc, build) {
    try {
      versionOf(doc, what);
      return { value: build(doc) };
    } catch (err) {
      if (err instanceof Fault) return { refusal: err.message };
      throw err;
    }
  }

  function readAppSummary(doc) {
    return read('An app summary', doc, function (summary) {
      return {
        appId: textMember(summary, 'app_id', true),
        name: textMember(summary, 'name', true),
        summary: textMember(summary, 'summary', false),
        by: textMember(summary, 'by', false),
        state: textMember(summary, 'state', true),
        missingKeys: listMember(summary, 'missing_keys').map(function (entry) {
          if (!isObject(entry)) throw new Fault('"missing_keys" holds something other than a key.');
          return {
            env: textMember(entry, 'env', true),
            purpose: textMember(entry, 'purpose', false),
            signupUrl: textMember(entry, 'signup_url', false),
          };
        }),
        accessEndsAt: timeMember(summary, 'access_ends_at', true),
        lastRunAt: timeMember(summary, 'last_run_at', true),
        runUrl: textMember(summary, 'run_url', false),
      };
    });
  }

  function readRunRow(doc) {
    return read('A run row', doc, function (row) {
      const costEstimate = amountMember(row, 'cost_estimate', true);
      return {
        runId: textMember(row, 'run_id', false),
        appId: textMember(row, 'app_id', true),
        appName: textMember(row, 'app_name', true),
        startedAt: timeMember(row, 'started_at', false),
        durationSeconds: amountMember(row, 'duration_seconds', true),
        model: textMember(row, 'model', false),
        inputTokens: countMember(row, 'input_tokens'),
        outputTokens: countMember(row, 'output_tokens'),
        costEstimate,
        currency: costEstimate === null ? '' : currencyMember(row, 'currency'),
        outcome: textMember(row, 'outcome', true),
        detail: textMember(row, 'detail', false),
      };
    });
  }

  function readUsageSummary(doc) {
    return read('A usage summary', doc, function (usage) {
      if (!isObject(usage.period)) throw new Fault('"period" is missing.');
      const caps = isObject(usage.caps) ? usage.caps : {};
      return {
        period: {
          label: textMember(usage.period, 'label', true),
          start: timeMember(usage.period, 'start', false),
          end: timeMember(usage.period, 'end', false),
        },
        runs: countMember(usage, 'runs'),
        runsDone: countMember(usage, 'runs_done'),
        inputTokens: countMember(usage, 'input_tokens'),
        outputTokens: countMember(usage, 'output_tokens'),
        costEstimate: amountMember(usage, 'cost_estimate', false),
        currency: currencyMember(usage, 'currency'),
        caps: {
          runsPerDay: caps.runs_per_day === undefined || caps.runs_per_day === null ? null : countMember(caps, 'runs_per_day'),
          runsUsed: caps.runs_used === undefined || caps.runs_used === null ? null : countMember(caps, 'runs_used'),
          spendPerPeriod: amountMember(caps, 'spend_per_period', true),
        },
        byApp: listMember(usage, 'by_app').map(function (entry) {
          if (!isObject(entry)) throw new Fault('"by_app" holds something other than an app.');
          return {
            appId: textMember(entry, 'app_id', true),
            appName: textMember(entry, 'app_name', true),
            runs: countMember(entry, 'runs'),
            inputTokens: countMember(entry, 'input_tokens'),
            outputTokens: countMember(entry, 'output_tokens'),
            costEstimate: amountMember(entry, 'cost_estimate', false),
          };
        }),
        byDay: listMember(usage, 'by_day').map(function (entry) {
          if (!isObject(entry)) throw new Fault('"by_day" holds something other than a day.');
          return { date: timeMember(entry, 'date', false), runs: countMember(entry, 'runs') };
        }),
      };
    });
  }

  /* ---------- writing them down ---------- */

  /* A link this file may draw: a web address and nothing else. `signup_url`
   * comes from a runner's author, and an anchor is the one element through
   * which a string becomes something a click runs, so a `javascript:` address
   * is dropped rather than drawn. `relative` admits a path on the host's own
   * page, which is what a host's `run_url` usually is. */
  function webLink(value, relative) {
    const candidate = String(value || '').trim();
    if (!candidate) return '';
    let parsed;
    try {
      parsed = relative ? new URL(candidate, root.document && root.document.baseURI) : new URL(candidate);
    } catch (err) {
      return '';
    }
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  }

  /* Numbers, sums and dates in the reader's own conventions, or in the ones a
   * host names (`options.locale`, `options.timeZone`). A locale or a time zone
   * `Intl` refuses falls back to the reader's own rather than failing the
   * block. */
  function formats(options) {
    const settings = options || {};
    let locale = settings.locale;
    try {
      new Intl.NumberFormat(locale);
    } catch (err) {
      locale = undefined;
    }
    let timeZone = settings.timeZone;
    try {
      new Intl.DateTimeFormat(locale, { timeZone });
    } catch (err) {
      timeZone = undefined;
    }

    function count(value) {
      return new Intl.NumberFormat(locale).format(value);
    }

    /* A tile's figure, compact from 100,000 up. The exact figure stays in the
     * per-app table's totals row. */
    function figure(value) {
      if (value < 100000) return count(value);
      return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    }

    /* A cost, to the cent. A run that cost less than one is said to, rather
     * than rounded to nothing: "$0.00" reads as free. */
    function money(value, currency) {
      let format;
      try {
        format = new Intl.NumberFormat(locale, {
          style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
      } catch (err) {
        format = { format: amount => amount.toFixed(2) + ' ' + currency };
      }
      if (value > 0 && value < 0.01) return '< ' + format.format(0.01);
      return format.format(value);
    }

    /* A moment, in the reader's time zone. */
    function moment(value) {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
    }

    /* A calendar day. A bare date names a day rather than an instant, so it is
     * read and written in UTC: in a time zone west of Greenwich, midnight UTC
     * on the 1st is still the 31st. */
    function day(value) {
      const instant = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00Z') : new Date(value);
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(instant);
    }

    function duration(seconds) {
      if (seconds < 1) return 'under 1 s';
      const whole = Math.round(seconds);
      if (whole < 60) return whole + ' s';
      const hours = Math.floor(whole / 3600);
      const minutes = Math.floor((whole % 3600) / 60);
      const rest = whole % 60;
      if (hours) return hours + ' h' + (minutes ? ' ' + minutes + ' min' : '');
      return minutes + ' min' + (rest ? ' ' + rest + ' s' : '');
    }

    return { count, figure, money, moment, day, duration };
  }

  function plural(count, one, many) {
    return count + ' ' + (count === 1 ? one : many);
  }

  /* A share as a CSS length, to a tenth of a percent. */
  function percent(share) {
    return Math.round(share * 1000) / 10 + '%';
  }

  function headingLevel(options) {
    const level = Number(options && options.headingLevel);
    return Number.isInteger(level) && level >= 2 && level <= 6 ? level : 3;
  }

  /* A state or an outcome, said in words beside a dot of its tone: the words
   * carry it, so a reader who cannot tell the colours apart loses nothing. */
  function statusLabel(table, value) {
    const known = Object.prototype.hasOwnProperty.call(table, value) ? table[value] : null;
    const node = el('span', 'gh-status', known ? known.label : value);
    node.classList.add('gh-status--' + (known ? known.tone : 'quiet'));
    return node;
  }

  function refusalNote(sentence) {
    return el('p', 'gh-refuse', sentence);
  }

  /* What a list could not show, said once below what it could, with the
   * first reason: the rest are usually the same one. */
  function skippedNote(refusals, one, many) {
    if (!refusals.length) return null;
    const count = plural(refusals.length, one, many);
    return el('p', 'gh-note', refusals.length === 1
      ? count + ' could not be shown. ' + refusals[0]
      : count + ' could not be shown. The first: ' + refusals[0]);
  }

  /* ---------- an app ---------- */

  function drawApp(app, options) {
    const formatted = formats(options);
    const card = el('article', 'gh-block gh-app');
    card.dataset.appId = app.appId;

    const head = el('header', 'gh-app-head');
    head.appendChild(el('h' + headingLevel(options), 'gh-app-name', app.name));
    head.appendChild(statusLabel(APP_STATES, app.state));
    card.appendChild(head);

    if (app.summary) card.appendChild(el('p', 'gh-app-summary', app.summary));
    if (app.by) card.appendChild(el('p', 'gh-app-by', 'by ' + app.by));

    if (app.missingKeys.length) {
      const keys = el('ul', 'gh-app-keys');
      app.missingKeys.forEach(function (key) {
        const item = el('li', 'gh-app-key');
        item.appendChild(el('code', 'gh-app-key-env', key.env));
        item.appendChild(el('span', 'gh-app-key-tick', ' not set'));
        if (key.purpose) item.appendChild(el('span', 'gh-app-key-purpose', ' — ' + key.purpose));
        const href = webLink(key.signupUrl, false);
        if (href) {
          const link = el('a', 'gh-app-key-link', 'Get a key');
          link.href = href;
          link.rel = 'noopener noreferrer';
          link.target = '_blank';
          item.appendChild(link);
        }
        keys.appendChild(item);
      });
      card.appendChild(keys);
    }

    const facts = [];
    if (app.lastRunAt) facts.push('Last run ' + formatted.moment(app.lastRunAt));
    else if (app.state !== 'ended') facts.push('No runs yet');
    if (app.accessEndsAt) {
      facts.push((app.state === 'ended' ? 'Access ended ' : 'Access ends ') + formatted.day(app.accessEndsAt));
    }
    if (facts.length) card.appendChild(el('p', 'gh-app-meta', facts.join(' · ')));

    const href = webLink(app.runUrl, true);
    if (href) {
      const open = el('a', 'gh-app-open', (options && options.openLabel) || 'Open');
      open.href = href;
      card.appendChild(open);
    }
    return card;
  }

  class AppCard {
    /* `summary` is one app summary; `options.headingLevel` (2 to 6, default
     * 3) is the level of the app's name, `options.openLabel` the words of the
     * link to its `run_url`. */
    constructor(container, summary, options) {
      this.container = container;
      this.summary = summary;
      this.options = options || {};
    }

    render() {
      clear(this.container);
      const read = readAppSummary(this.summary);
      if (read.refusal) {
        const block = el('div', 'gh-block');
        block.appendChild(refusalNote('This app could not be shown. ' + read.refusal));
        this.container.appendChild(block);
        return;
      }
      this.container.appendChild(drawApp(read.value, this.options));
    }

    update(summary) {
      this.summary = summary;
      this.render();
    }
  }

  class AppList {
    /* `summaries` is a list of app summaries, drawn as cards in the order
     * given. `options.emptyText` is said when there are none; the rest are
     * `AppCard`'s. */
    constructor(container, summaries, options) {
      this.container = container;
      this.summaries = summaries;
      this.options = options || {};
    }

    render() {
      clear(this.container);
      const block = el('section', 'gh-block gh-apps');
      this.container.appendChild(block);
      if (!Array.isArray(this.summaries)) {
        block.appendChild(refusalNote('These apps could not be shown: the host handed in something other than a list.'));
        return;
      }
      const list = el('ul', 'gh-app-list');
      const refusals = [];
      const options = this.options;
      this.summaries.forEach(function (doc) {
        const read = readAppSummary(doc);
        if (read.refusal) {
          refusals.push(read.refusal);
          return;
        }
        const item = el('li', 'gh-app-item');
        item.appendChild(drawApp(read.value, options));
        list.appendChild(item);
      });
      if (list.childNodes.length) block.appendChild(list);
      else if (!refusals.length) block.appendChild(el('p', 'gh-empty', options.emptyText || 'No apps yet.'));
      const note = skippedNote(refusals, 'app', 'apps');
      if (note) block.appendChild(note);
    }

    update(summaries) {
      this.summaries = summaries;
      this.render();
    }
  }

  /* ---------- runs ---------- */

  /* A figure's column is right-aligned on even-width digits, so a column of
   * them reads by place value. */
  function headCell(label, numeric) {
    const node = el('th', 'gh-table-head', label);
    if (numeric) node.classList.add('gh-num');
    node.scope = 'col';
    return node;
  }

  function cell(value, numeric) {
    const node = el('td', 'gh-table-cell', value);
    if (numeric) node.classList.add('gh-num');
    return node;
  }

  class RunHistory {
    /* `rows` is a list of run rows, drawn in the order given (a host sorts
     * them). `options.showApp: false` drops the app column, for a page about
     * one app; `options.emptyText` is said when there are none. */
    constructor(container, rows, options) {
      this.container = container;
      this.rows = rows;
      this.options = options || {};
    }

    render() {
      clear(this.container);
      const block = el('section', 'gh-block gh-runs');
      this.container.appendChild(block);
      if (!Array.isArray(this.rows)) {
        block.appendChild(refusalNote('These runs could not be shown: the host handed in something other than a list.'));
        return;
      }
      const options = this.options;
      const showApp = options.showApp !== false;
      const formatted = formats(options);
      const refusals = [];
      const runs = [];
      this.rows.forEach(function (doc) {
        const read = readRunRow(doc);
        if (read.refusal) refusals.push(read.refusal);
        else runs.push(read.value);
      });

      if (!runs.length) {
        if (!refusals.length) block.appendChild(el('p', 'gh-empty', options.emptyText || 'No runs yet.'));
      } else {
        /* Wide by nature, so it scrolls inside its own box rather than pushing
         * the page sideways on a phone. The box takes focus so a keyboard can
         * scroll it too. */
        const scroller = el('div', 'gh-table-scroll');
        scroller.tabIndex = 0;
        scroller.setAttribute('role', 'region');
        scroller.setAttribute('aria-label', 'Runs');
        const table = el('table', 'gh-table gh-table--wide');
        const head = el('thead');
        const headRow = el('tr');
        headRow.appendChild(headCell('Started', false));
        if (showApp) headRow.appendChild(headCell('App', false));
        headRow.appendChild(headCell('Outcome', false));
        headRow.appendChild(headCell('Duration', true));
        headRow.appendChild(headCell('Tokens in', true));
        headRow.appendChild(headCell('Tokens out', true));
        /* The column says what the figure is. A run's cost is the host's
         * estimate from token counts and a price list, never a bill. */
        headRow.appendChild(headCell('Cost (estimate)', true));
        headRow.appendChild(headCell('Model', false));
        head.appendChild(headRow);
        table.appendChild(head);

        const body = el('tbody');
        runs.forEach(function (run) {
          const row = el('tr', 'gh-run');
          if (run.runId) row.dataset.runId = run.runId;
          row.appendChild(cell(formatted.moment(run.startedAt), false));
          if (showApp) row.appendChild(cell(run.appName, false));
          const outcome = el('td', 'gh-table-cell');
          outcome.appendChild(statusLabel(OUTCOMES, run.outcome));
          if (run.detail) outcome.appendChild(el('span', 'gh-run-detail', run.detail));
          row.appendChild(outcome);
          row.appendChild(cell(run.durationSeconds === null ? '—' : formatted.duration(run.durationSeconds), true));
          row.appendChild(cell(formatted.count(run.inputTokens), true));
          row.appendChild(cell(formatted.count(run.outputTokens), true));
          row.appendChild(cell(run.costEstimate === null ? '—' : formatted.money(run.costEstimate, run.currency), true));
          row.appendChild(cell(run.model || '—', false));
          body.appendChild(row);
        });
        table.appendChild(body);
        scroller.appendChild(table);
        block.appendChild(scroller);
      }
      const note = skippedNote(refusals, 'run', 'runs');
      if (note) block.appendChild(note);
    }

    update(rows) {
      this.rows = rows;
      this.render();
    }
  }

  /* ---------- usage ---------- */

  function stat(label, value, note) {
    const tile = el('div', 'gh-usage-stat');
    tile.appendChild(el('dt', 'gh-usage-label', label));
    tile.appendChild(el('dd', 'gh-usage-value', value));
    if (note) tile.appendChild(el('dd', 'gh-usage-note', note));
    return tile;
  }

  /* One cap: the sentence first, since it carries the numbers, then a bar
   * that shows the same share at a glance and is hidden from a screen reader,
   * which has the sentence. */
  function capRow(sentence, used, limit) {
    const row = el('div', 'gh-cap');
    row.appendChild(el('p', 'gh-cap-label', sentence));
    const share = limit > 0 ? Math.min(1, used / limit) : 1;
    const meter = el('div', 'gh-meter');
    meter.classList.add(share >= 1 ? 'gh-meter--full' : share >= NEAR_CAP ? 'gh-meter--near' : 'gh-meter--clear');
    meter.setAttribute('aria-hidden', 'true');
    const fill = el('span', 'gh-meter-fill');
    /* Through the object model rather than a `style` attribute, which a
     * strict content security policy refuses and this property is not. */
    fill.style.width = percent(share);
    meter.appendChild(fill);
    row.appendChild(meter);
    return row;
  }

  /* Runs per day as columns. The tallest is labelled; the rest show on hover,
   * and every day's figure is in the table beneath, so no value is reachable
   * only by pointing at it. */
  function dayChart(days, formatted) {
    const figure = el('figure', 'gh-days');
    figure.appendChild(el('figcaption', 'gh-days-title', 'Runs per day'));
    const most = days.reduce((top, entry) => Math.max(top, entry.runs), 0);
    const plot = el('div', 'gh-days-plot');
    plot.setAttribute('aria-hidden', 'true');
    plot.appendChild(el('span', 'gh-days-max', plural(most, 'run', 'runs')));
    const bars = el('ol', 'gh-days-bars');
    days.forEach(function (entry) {
      const item = el('li', 'gh-day');
      const bar = el('span', 'gh-day-bar');
      bar.style.height = percent(most ? entry.runs / most : 0);
      item.appendChild(bar);
      item.appendChild(el('span', 'gh-day-tip', formatted.day(entry.date) + ' · ' + plural(entry.runs, 'run', 'runs')));
      bars.appendChild(item);
    });
    plot.appendChild(bars);
    figure.appendChild(plot);
    const axis = el('div', 'gh-days-axis');
    axis.setAttribute('aria-hidden', 'true');
    axis.appendChild(el('span', 'gh-days-axis-label', formatted.day(days[0].date)));
    if (days.length > 1) axis.appendChild(el('span', 'gh-days-axis-label', formatted.day(days[days.length - 1].date)));
    figure.appendChild(axis);

    const table = el('details', 'gh-days-table');
    table.appendChild(el('summary', 'gh-days-table-toggle', 'Each day as a table'));
    const grid = el('table', 'gh-table');
    const head = el('thead');
    const headRow = el('tr');
    headRow.appendChild(headCell('Day', false));
    headRow.appendChild(headCell('Runs', true));
    head.appendChild(headRow);
    grid.appendChild(head);
    const body = el('tbody');
    days.forEach(function (entry) {
      const row = el('tr');
      row.appendChild(cell(formatted.day(entry.date), false));
      row.appendChild(cell(formatted.count(entry.runs), true));
      body.appendChild(row);
    });
    grid.appendChild(body);
    table.appendChild(grid);
    figure.appendChild(table);
    return figure;
  }

  function appTable(usage, formatted) {
    const scroller = el('div', 'gh-table-scroll');
    scroller.tabIndex = 0;
    scroller.setAttribute('role', 'region');
    scroller.setAttribute('aria-label', 'Usage by app');
    const table = el('table', 'gh-table');
    const head = el('thead');
    const headRow = el('tr');
    headRow.appendChild(headCell('App', false));
    headRow.appendChild(headCell('Runs', true));
    headRow.appendChild(headCell('Tokens in', true));
    headRow.appendChild(headCell('Tokens out', true));
    headRow.appendChild(headCell('Cost (estimate)', true));
    head.appendChild(headRow);
    table.appendChild(head);
    const body = el('tbody');
    usage.byApp.forEach(function (app) {
      const row = el('tr');
      row.dataset.appId = app.appId;
      row.appendChild(cell(app.appName, false));
      row.appendChild(cell(formatted.count(app.runs), true));
      row.appendChild(cell(formatted.count(app.inputTokens), true));
      row.appendChild(cell(formatted.count(app.outputTokens), true));
      row.appendChild(cell(formatted.money(app.costEstimate, usage.currency), true));
      body.appendChild(row);
    });
    table.appendChild(body);
    /* The period's own totals, exactly, which the tiles above round. */
    const foot = el('tfoot');
    const total = el('tr', 'gh-table-total');
    total.appendChild(cell('All apps', false));
    total.appendChild(cell(formatted.count(usage.runs), true));
    total.appendChild(cell(formatted.count(usage.inputTokens), true));
    total.appendChild(cell(formatted.count(usage.outputTokens), true));
    total.appendChild(cell(formatted.money(usage.costEstimate, usage.currency), true));
    foot.appendChild(total);
    table.appendChild(foot);
    scroller.appendChild(table);
    return scroller;
  }

  class UsageSummary {
    /* `usage` is one usage summary. `options.headingLevel` (2 to 6, default
     * 3) is the level of the period's name. */
    constructor(container, usage, options) {
      this.container = container;
      this.usage = usage;
      this.options = options || {};
    }

    render() {
      clear(this.container);
      const block = el('section', 'gh-block gh-usage');
      this.container.appendChild(block);
      const read = readUsageSummary(this.usage);
      if (read.refusal) {
        block.appendChild(refusalNote('This usage could not be shown. ' + read.refusal));
        return;
      }
      const usage = read.value;
      const formatted = formats(this.options);

      const head = el('header', 'gh-usage-head');
      head.appendChild(el('h' + headingLevel(this.options), 'gh-usage-title', usage.period.label));
      head.appendChild(el('p', 'gh-usage-dates', formatted.day(usage.period.start) + ' – ' + formatted.day(usage.period.end)));
      block.appendChild(head);

      const stats = el('dl', 'gh-usage-stats');
      stats.appendChild(stat('Runs', formatted.figure(usage.runs), plural(usage.runsDone, 'finished', 'finished')));
      stats.appendChild(stat('Tokens in', formatted.figure(usage.inputTokens)));
      stats.appendChild(stat('Tokens out', formatted.figure(usage.outputTokens)));
      /* Named as an estimate where it is drawn, the way the run page labels a
       * runner's `cost_usd`: a figure on a dashboard is read as a bill unless
       * it says otherwise. */
      stats.appendChild(stat('Estimated cost', formatted.money(usage.costEstimate, usage.currency), 'An estimate, not a bill'));
      block.appendChild(stats);

      const caps = el('div', 'gh-caps');
      if (usage.caps.runsPerDay !== null && usage.caps.runsUsed !== null) {
        caps.appendChild(capRow(
          usage.caps.runsUsed + ' of ' + plural(usage.caps.runsPerDay, 'run', 'runs') + ' in the last 24 hours' +
            (usage.caps.runsUsed >= usage.caps.runsPerDay ? ' — the limit is reached' : ''),
          usage.caps.runsUsed,
          usage.caps.runsPerDay
        ));
      }
      if (usage.caps.spendPerPeriod !== null) {
        caps.appendChild(capRow(
          formatted.money(usage.costEstimate, usage.currency) + ' of ' +
            formatted.money(usage.caps.spendPerPeriod, usage.currency) + ' estimated spend this period' +
            (usage.costEstimate >= usage.caps.spendPerPeriod ? ' — the cap is reached' : ''),
          usage.costEstimate,
          usage.caps.spendPerPeriod
        ));
      }
      if (caps.childNodes.length) block.appendChild(caps);

      if (usage.byDay.length) block.appendChild(dayChart(usage.byDay, formatted));
      if (usage.byApp.length) block.appendChild(appTable(usage, formatted));
    }

    update(usage) {
      this.usage = usage;
      this.render();
    }
  }

  root.Gatehouse = Object.assign({}, root.Gatehouse, {
    AppCard,
    AppList,
    RunHistory,
    UsageSummary,
    hostData: { VERSION, readAppSummary, readRunRow, readUsageSummary },
  });

  /* `SigrixRun` is the name this package was born under, inside one host. It
   * is kept pointing at the same object so that host keeps working across the
   * extraction, and because a global is the one part of a browser package a
   * consumer cannot alias for itself. Deprecated; removed at 1.0. */
  root.SigrixRun = root.Gatehouse;
})(typeof window !== 'undefined' ? window : globalThis);
