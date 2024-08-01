import { MongoClient } from 'mongodb';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || 'files_manager';

class DBClient {
  constructor() {
    this.client = new MongoClient(`mongodb://${host}:${port}/`, { useUnifiedTopology: true });
    this.db = null;
    this.connected = false;
    this.connect();
  }

  async connect() {
    try {
      await this.client.connect();
      this.connected = true;
      this.db = this.client.db(database);
    } catch (error) {
      this.connected = false;
    }
  }

  isAlive() {
    return this.connected;
  }

  async nbUsers() {
    const userCollection = this.db.collection('users');
    const count = await userCollection.countDocuments();
    return count;
  }

  async nbFiles() {
    const fileCollection = this.db.collection('files');
    const count = await fileCollection.countDocuments();
    return count;
  }
}

const dbClient = new DBClient();
export default dbClient;
