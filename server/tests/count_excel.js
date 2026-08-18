const xlsx = require('xlsx');
const path = require('path');
const { canonicalizePlate } = require('../plate_engine');

const wb = xlsx.readFile(path.join(__dirname, '../../file.xlsx'));
console.log('Sheets in file.xlsx:', wb.SheetNames);

let totalRawRows = 0;
let totalValidPlates = 0;
const uniquePlates = new Set();

wb.SheetNames.forEach(sheetName => {
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  totalRawRows += rows.length;
  let sheetValid = 0;

  for (let i = 1; i < rows.length; i++) {
    const raw = (rows[i][0] || '').toString().trim();
    if (!raw || raw === 'اللوحة' || raw === 'الصقر') continue;
    const canonical = canonicalizePlate(raw);
    if (canonical && canonical.length >= 2) {
      sheetValid++;
      totalValidPlates++;
      uniquePlates.add(canonical);
    }
  }
  console.log('Sheet [' + sheetName + ']: ' + rows.length + ' raw rows, ' + sheetValid + ' valid records.');
});

console.log('\n--- TOTAL METRICS ---');
console.log('Total Raw Rows across all sheets:', totalRawRows);
console.log('Total Valid Vehicle Records:', totalValidPlates);
console.log('Total Unique Wanted Plates:', uniquePlates.size);
console.log('Duplicate Records in File:', totalValidPlates - uniquePlates.size);

// Sample check for اسب2175
console.log('\nDoes file contain اسب2175?', uniquePlates.has('اسب2175'));
