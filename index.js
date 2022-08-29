const { MongoClient, Decimal128 } = require("mongodb");
const { MongoMemoryServer } = require("mongodb-memory-server");
const moment = require("moment");
const assert = require("assert");
const { randomInt } = require("node:crypto");
async function getCollection() {
  let connectionUrl;
  switch (process.env.DB) {
    case "mongo":
      connectionUrl = "mongodb://localhost:27017/find-issue";
      break;
    case "fake-mongo":
      const mongod = await MongoMemoryServer.create();
      connectionUrl = mongod.getUri();
      break;
    default:
      throw new Error("ENV DB is not provided");
  }
  const client = new MongoClient(connectionUrl);
  await client.connect();
  const collection = client.db().collection("limit");
  await collection.createIndex(
    {
      limitName: 1,
      date: 1,
    },
    { unique: true, background: false }
  );
  return collection;
}

async function incrementUsedLimit({
  collection,
  limitName,
  amount,
  totalAmount,
  date,
}) {
  return collection.findOneAndUpdate(
    {
      limitName,
      date,
      totalAmount,
      usedAmount: { $lt: Decimal128.fromString(totalAmount.toString()) },
    },
    {
      $inc: { usedAmount: Decimal128.fromString(amount.toString()) },
    },
    {
      upsert: true,
      returnNewDocument: true,
    }
  );
}

async function test(collection) {
  const limitName = `limit_${Date.now()}_${randomInt(1, 1000_000_000_000)}`;
  const date = moment(new Date()).utc().startOf("day").toDate();
  const totalAmount = 100;
  const result = await Promise.allSettled([
    incrementUsedLimit({
      collection,
      date,
      limitName,
      amount: 99,
      totalAmount,
    }),
    incrementUsedLimit({ collection, date, limitName, amount: 1, totalAmount }),
    incrementUsedLimit({ collection, date, limitName, amount: 1, totalAmount }),
  ]);
  const successfulOperations = result.filter(
    (item) => item.status === "fulfilled"
  );
  assert.ok(
    successfulOperations.length === 2,
    "There should be no more that 2 successful operations"
  );
}

async function main() {
  const collection = await getCollection();
  for (let i = 0; i <= 20; i++) {
    try {
      await test(collection);
    } catch (error) {
      console.log(`Attempt ${i} failed`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
