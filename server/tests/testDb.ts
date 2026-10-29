import path from "path";
import { MongoMemoryServer } from "mongodb-memory-server";

if (!process.env.MONGOMS_DOWNLOAD_DIR) {
  process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, "../node_modules/.cache/mongodb-memory-server");
}
import mongoose from "mongoose";

let mongod: MongoMemoryServer | null = null;

export const setupTestDb = async (): Promise<void> => {
  mongod = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 60000,
    },
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);
};

export const clearTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key]?.deleteMany({});
    }
  }
};

export const teardownTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
};
