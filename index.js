const { MongoClient, Decimal128} = require("mongodb");
const { MongoMemoryServer } = require("mongodb-memory-server");
const assert = require("assert");

async function getCollection() {
  let connectionUrl;
  switch (process.env.DB) {
    case 'mongo':
      connectionUrl = "mongodb://localhost:27017/find-issue"
      break;
    case 'fake-mongo':
      const mongod = await MongoMemoryServer.create();
      connectionUrl = mongod.getUri()
      break
    default:
      throw new Error("ENV DB is not provided")
  }
  const client = new MongoClient(connectionUrl);
  await client.connect()
  const collection = client.db().collection('limit');
  await collection.createIndex(
    {
      "limitName": 1
    },
    { unique: true, background: false }
  )
  return collection
}

async function incrementUsedLimit({ collection, limitName, amount, totalAmount }) {
  return collection.findOneAndUpdate(
    { limitName, totalAmount, usedAmount: { $lt:  Decimal128.fromString(totalAmount.toString()) } },
    {
      $inc: { usedAmount:  Decimal128.fromString(amount.toString()) },
    },
    {
      upsert: true,
      returnNewDocument: true,
    }
  );
}

async function test() {
  const collection = await getCollection();
  const limitName = `limit_${Date.now()}`;
  const totalAmount = 100;
  const result = await Promise.allSettled([
    incrementUsedLimit({ collection, limitName, amount: 99, totalAmount }),
    incrementUsedLimit({ collection, limitName, amount: 1, totalAmount }),
    incrementUsedLimit({ collection, limitName, amount: 1, totalAmount }),
  ]);
  const successfulOperations = result.filter(item => item.status === "fulfilled");
  assert.ok(successfulOperations.length === 2, "There should be no more that 2 successful operations");
  console.log("Success")
}

test().catch(console.error);
