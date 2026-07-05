// Dump every collection (users + trades, screenshots included) to a timestamped
// JSON file in backups/. Run with: npm run backup
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const database = client.db('trading_journal');

  const dump = { exportedAt: new Date().toISOString(), collections: {} };
  for (const name of ['trading_journal', 'users']) {
    dump.collections[name] = await database.collection(name).find().toArray();
  }

  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(dir, `backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(dump));

  const trades = dump.collections.trading_journal.length;
  const users = dump.collections.users.length;
  console.log(`Saved ${trades} trades and ${users} users to ${file}`);
  await client.close();
})().catch((err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});
