const serverEngine = require('../plate_engine');
const db = require('../db');

console.log('=== FULL ECOSYSTEM INTEGRATION VERIFICATION ===');
console.log('1. Database Indexed Vehicles:', db.wantedPlatesIndex.size);
console.log('2. Active Datasets Count:', db.datasets.length);
console.log('3. Stored Sessions Count:', db.sessions.length);

const testPlates = [
  'دال الف دال 2524',
  'دال به كاف 2121',
  'اسب 2175',
  'ركد 9678'
];

testPlates.forEach(tp => {
  const parsed = serverEngine.parsePlateTranscript(tp);
  const canonical = parsed.length > 0 ? parsed[0].canonicalPlate : 'FAILED';
  const wantedCheck = db.checkWantedPlate(canonical);
  console.log('- Audio: \'' + tp + '\' -> Canonical: \'' + canonical + '\' -> Wanted: ' + wantedCheck.isWanted);
});
