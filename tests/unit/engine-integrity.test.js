// Tệp engine (Fairy-Stockfish) phải đúng y như bản đã kiểm tra: so mã băm SHA-256 với engine/SHA256SUMS.
// Nếu ai đó (hoặc một công cụ) thay tệp engine mà không cố ý, bài này báo ngay. Cố ý cập nhật engine thì
// cập nhật cả engine/SHA256SUMS và bảng trong engine/README.md.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', '..', 'engine');

test('tệp engine khớp mã băm SHA-256 đã ghi', () => {
  const lines = fs.readFileSync(path.join(DIR, 'SHA256SUMS'), 'utf8').trim().split('\n');
  assert.ok(lines.length >= 4);
  for (const line of lines) {
    const [hash, name] = line.trim().split(/\s+\*?/);
    const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, name))).digest('hex');
    assert.strictEqual(got, hash, name + ' đã bị thay đổi');
  }
  const readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
  for (const line of lines) assert.ok(readme.indexOf(line.split(/\s+/)[0]) >= 0, 'engine/README.md chưa ghi mã băm của ' + line.split(/\s+/)[1]);
});

test('mọi tệp trong engine/ đều có trong danh sách mã băm', () => {
  const listed = fs.readFileSync(path.join(DIR, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.trim().split(/\s+\*?/)[1]);
  const files = fs.readdirSync(DIR).filter(f => !/\.md$/i.test(f) && f !== 'SHA256SUMS');
  assert.deepStrictEqual(files.sort(), listed.slice().sort());
});
