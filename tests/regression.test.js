'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function readHtml(fileName) {
  return fs
    .readFileSync(__dirname + '/../' + fileName, 'utf8')
    .replace(/\r\n?/g, '\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFunction(source, name) {
  const signature = new RegExp(
    '\\b(?:async\\s+)?function\\s+' + escapeRegExp(name) + '\\s*\\('
  );
  const match = signature.exec(source);
  assert.ok(match, 'Expected function ' + name + ' to exist');

  const start = match.index;
  const openingBrace = source.indexOf('{', start + match[0].length);
  assert.notEqual(openingBrace, -1, 'Expected function ' + name + ' to have a body');

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openingBrace; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  assert.fail('Could not find the end of function ' + name);
}

function compileFunction(source, name) {
  const body = extractFunction(source, name);
  return Function('"use strict"; return (' + body + ');')();
}

const indexHtml = readHtml('index.html');
const programHtml = readHtml('program.html');
const adminHtml = readHtml('admin.html');

test('event fallbacks show 2026/11/8 and contain no stale event date', () => {
  assert.match(
    indexHtml,
    /\bid=["']eventDate["'][^>]*>\s*2026\s*年\s*11\s*月\s*8\s*日/i,
    'The visible signup fallback date must be November 8, 2026'
  );
  assert.match(
    indexHtml,
    /\bEVENT_DATE\s*=\s*["'][^"']*2026\s*年\s*11\s*月\s*8\s*日[^"']*["']/,
    'The signup JavaScript fallback date must be November 8, 2026'
  );
  assert.match(
    programHtml,
    /\bid=["']eventDate["'][^>]*>\s*2026\s*年\s*11\s*月\s*8\s*日/i,
    'The visible program fallback date must be November 8, 2026'
  );
  assert.match(
    programHtml,
    /\bEVENT_DATE\s*=\s*["'][^"']*2026\s*年\s*11\s*月\s*8\s*日[^"']*["']/,
    'The JavaScript fallback date must be November 8, 2026'
  );
  assert.doesNotMatch(
    indexHtml + '\n' + programHtml,
    /(?:2026\s*年\s*(?:0?3\s*月\s*29|10\s*月\s*25)\s*日|2026\s*[-/.]\s*(?:0?3\s*[-/.]\s*29|10\s*[-/.]\s*25))/,
    'Old March 29 and October 25 fallbacks must not remain'
  );
});

test('consent is visible, starts unchecked, and cannot be forced by JavaScript', () => {
  const wrapper = indexHtml.match(
    /<div\b(?=[^>]*\bclass=["'][^"']*\bagree\b[^"']*["'])[^>]*>/i
  );
  assert.ok(wrapper, 'Expected a visible consent wrapper');
  assert.doesNotMatch(wrapper[0], /\b(?:hidden|style\s*=\s*["'][^"']*display\s*:\s*none)/i);
  assert.doesNotMatch(indexHtml, /\.agree\s*\{[^}]*\bdisplay\s*:\s*none/i);

  const checkbox = indexHtml.match(
    /<input\b(?=[^>]*\bid=["']agree["'])[^>]*>/i
  );
  assert.ok(checkbox, 'Expected the consent checkbox');
  assert.doesNotMatch(checkbox[0], /\bchecked(?:\s*=|\s|\/?>)/i);
  assert.doesNotMatch(checkbox[0], /\bhidden\b/i);
  assert.doesNotMatch(indexHtml, /\bagree\s*\.\s*checked\s*=\s*(?:true|1|!!)/);
  assert.doesNotMatch(indexHtml, /\bagree\s*\.\s*setAttribute\s*\(\s*["']checked["']/i);

  const validation = extractFunction(indexHtml, 'validateRequired');
  assert.match(validation, /if\s*\(\s*!\s*agree\s*\.\s*checked\s*\)/);
});

test('preferred-performer search renders dynamic values as text, never HTML', () => {
  const statusRenderer = extractFunction(indexHtml, 'setPreferredSearchLoading');
  const resultsRenderer = extractFunction(indexHtml, 'renderPreferredResults');

  assert.match(
    resultsRenderer,
    /\.textContent\s*=\s*item\s*\.\s*(?:label|value)/,
    'Search result labels must be assigned with textContent'
  );
  assert.doesNotMatch(
    resultsRenderer,
    /\.innerHTML\s*=\s*[^;]*\bitem\s*\.\s*(?:label|value)\b/,
    'item.label/item.value must not be assigned to innerHTML'
  );
  assert.doesNotMatch(
    statusRenderer,
    /\.innerHTML\s*=\s*[^;]*\btext\b/,
    'Status text (which can include item.value) must not be assigned to innerHTML'
  );
});

test('email, Taiwan phone, and performer-count validation rejects malformed values', () => {
  const isValidEmail = compileFunction(indexHtml, 'isValidEmail');
  const isValidTaiwanPhone = compileFunction(indexHtml, 'isValidTaiwanPhone');
  const isPositiveInteger = compileFunction(indexHtml, 'isPositiveInteger');

  assert.equal(Boolean(isValidEmail('student@example.com')), true);
  assert.equal(Boolean(isValidEmail('student@@example.com')), false);
  assert.equal(Boolean(isValidEmail('student@example')), false);

  assert.equal(Boolean(isValidTaiwanPhone('0912-345-678')), true);
  assert.equal(Boolean(isValidTaiwanPhone('1234')), false);
  assert.equal(Boolean(isValidTaiwanPhone('phone-number')), false);

  assert.equal(Boolean(isPositiveInteger('1')), true);
  assert.equal(Boolean(isPositiveInteger('0')), false);
  assert.equal(Boolean(isPositiveInteger('1.5')), false);
  assert.equal(Boolean(isPositiveInteger('two')), false);

  const validation = extractFunction(indexHtml, 'validateRequired');
  assert.match(validation, /\bisValidEmail\s*\(/);
  assert.match(validation, /\bisValidTaiwanPhone\s*\(/);
  assert.match(validation, /\bisPositiveInteger\s*\(/);
});

test('Cloudinary upload stays direct and reports real XMLHttpRequest progress', () => {
  const upload = extractFunction(indexHtml, 'uploadCloudinary');

  assert.match(upload, /\bnew\s+XMLHttpRequest(?:\s*\(\s*\))?/);
  assert.match(
    upload,
    /\.upload\s*(?:\.\s*onprogress\s*=|\.\s*addEventListener\s*\(\s*["']progress["'])/
  );
  assert.match(upload, /\.\s*loaded\b/);
  assert.match(upload, /\.\s*total\b/);
  assert.match(upload, /\bsetProgress\s*\(/);
  assert.match(upload, /https:\/\/api\.cloudinary\.com\/v1_1\//);
  assert.match(upload, /\.open\s*\(\s*["']POST["']/i);
  assert.match(upload, /\.send\s*\(\s*formData\s*\)/);
  assert.match(upload, /\.append\s*\(\s*["']upload_preset["']/);
  assert.doesNotMatch(upload, /\bfetch\s*\(/);
});

test('existing audio preview only opens safe Cloudinary HTTPS URLs', () => {
  const safeExistingAudioUrl = compileFunction(indexHtml, 'safeExistingAudioUrl');
  assert.ok(safeExistingAudioUrl('https://res.cloudinary.com/demo/video/upload/song.mp3'));
  assert.equal(Boolean(safeExistingAudioUrl('javascript:alert(1)')), false);
  assert.equal(Boolean(safeExistingAudioUrl('https://res.cloudinary.com.evil.example/song.mp3')), false);

  const renderSlot = extractFunction(indexHtml, 'renderSlot');
  assert.match(renderSlot, /\bsafeExistingAudioUrl\s*\(/);
  assert.match(renderSlot, /noopener,noreferrer/);
  assert.match(renderSlot, /\.opener\s*=\s*null/);
});

test('mail delivery failure has a clear warning and an on-page edit-link fallback', () => {
  const successRenderer = extractFunction(indexHtml, 'renderSubmissionSuccess');
  assert.match(successRenderer, /\bmailSent\s*===\s*false\b/);
  assert.match(
    successRenderer,
    /確認信尚未成功寄出|確認信[^\n<]*(?:未|無法|失敗)[^\n<]*寄|寄信[^\n<]*失敗/,
    'mailSent=false must have an explicit warning'
  );

  const editUrlBuilder = extractFunction(indexHtml, 'buildEditUrl');
  assert.match(editUrlBuilder, /index\.html/);
  assert.match(editUrlBuilder, /encodeURIComponent\s*\(\s*regId\s*\)/);
  assert.match(editUrlBuilder, /encodeURIComponent\s*\(\s*token\s*\)/);
  assert.match(successRenderer, /\bresponseEditUrl\s*\(\s*response\s*\)/);
  assert.match(successRenderer, /\bshowDoneOnly\s*\([^;]*\beditUrl\s*\)/);
  assert.match(indexHtml, /\bid=["']doneEditLink["']/);
  assert.match(indexHtml, /doneEditLink\s*\.\s*href\s*=/);
  assert.match(indexHtml, /\bbuildEditUrl\s*\(/);
});

test('admin audio URL allowlist accepts only credential-free Cloudinary HTTPS URLs', () => {
  const safeAudioUrl = compileFunction(adminHtml, 'safeAudioUrl');
  const valid = 'https://res.cloudinary.com/demo/video/upload/v1/song.mp3';

  assert.ok(safeAudioUrl(valid));
  [
    'http://res.cloudinary.com/demo/video/upload/song.mp3',
    'https://res.cloudinary.com.evil.example/song.mp3',
    'https://example.com/song.mp3',
    'https://user:pass@res.cloudinary.com/demo/song.mp3',
    'https://res.cloudinary.com:444/demo/song.mp3',
    'javascript:alert(1)'
  ].forEach((url) => {
    assert.equal(Boolean(safeAudioUrl(url)), false, 'Expected URL to be rejected: ' + url);
  });

  const zipDownload = extractFunction(adminHtml, 'downloadAudioZip');
  const render = extractFunction(adminHtml, 'render');
  assert.match(zipDownload, /\bsafeAudioUrl\s*\(\s*a\s*\.\s*url\s*\)/);
  assert.match(render, /\bsafeAudioUrl\s*\(\s*a\s*\.\s*url\s*\)/);
});

test('admin ZIP uses bounded workers and tolerates individual download failures', () => {
  const limitMatch = adminHtml.match(/\bAUDIO_DOWNLOAD_CONCURRENCY\s*=\s*(\d+)\b/);
  assert.ok(limitMatch, 'Expected an explicit audio download concurrency limit');
  const limit = Number(limitMatch[1]);
  assert.ok(limit >= 1 && limit <= 8, 'Concurrency limit should remain bounded');

  const zipDownload = extractFunction(adminHtml, 'downloadAudioZip');
  const worker = extractFunction(adminHtml, 'worker');
  assert.match(zipDownload, /\bjobs\b/);
  assert.match(zipDownload, /\bworkers\b/);
  assert.match(zipDownload, /Promise\s*\.\s*all\s*\(\s*workers\s*\)/);
  assert.match(zipDownload, /Math\s*\.\s*min\s*\(\s*AUDIO_DOWNLOAD_CONCURRENCY\s*,\s*jobs\s*\.\s*length\s*\)/);
  assert.match(worker, /\bfailures\s*\.\s*push\s*\(/);
  assert.match(
    worker,
    /\btry\s*\{[\s\S]*?\bfetch\s*\([\s\S]*?\}\s*catch\s*\(/,
    'Each failed audio download must be caught without aborting the whole ZIP'
  );
});

test('every admin link opened in a new tab protects window.opener', () => {
  const blankLinks = Array.from(
    adminHtml.matchAll(/<a\b[^>]*\btarget\s*=\s*["']_blank["'][^>]*>/gi),
    (match) => match[0]
  );
  assert.ok(blankLinks.length > 0, 'Expected at least one admin audio link');
  blankLinks.forEach((link) => {
    assert.match(link, /\brel\s*=\s*["'][^"']*\bnoopener\b[^"']*["']/i);
  });
});

test('shared Cloudinary cleanup is disabled to protect the main system', () => {
  const cleanupButton = adminHtml.match(
    /<button\b(?=[^>]*\bid=["']btnClearAll["'])[^>]*>/i
  );
  assert.ok(cleanupButton, 'Expected the Cloudinary cleanup control to exist');
  assert.match(cleanupButton[0], /\bdisabled\b/i);

  const clearAll = extractFunction(adminHtml, 'clearAll');
  assert.match(clearAll, /if\s*\(\s*deleteCloud\s*\)\s*\{[\s\S]*?return\s*;/);
});
