const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Add it to .env (see .env.example) or the environment.');
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);

let tradesCol;
let usersCol;

async function connect() {
  await client.connect();
  const database = client.db('trading_journal');
  tradesCol = database.collection('trading_journal');
  usersCol = database.collection('users');
  await tradesCol.createIndex({ userId: 1, date: -1 });
  await usersCol.createIndex({ username: 1 }, { unique: true });
}

function trades() {
  if (!tradesCol) throw new Error('Database not connected yet');
  return tradesCol;
}

function users() {
  if (!usersCol) throw new Error('Database not connected yet');
  return usersCol;
}

module.exports = { connect, trades, users, client };
