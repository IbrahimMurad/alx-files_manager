import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();
    this.client.on('error', (err) => {
      console.log('Redis Client Error', err);
    });
  }

  async isAlive() {
    try {
      const response = await promisify(this.client.ping).bind(this.client)();
      return response === 'PONG';
    } catch (error) {
      return false;
    }
  } 

  async get(key) {
    return promisify(this.client.get).bind(this.client)(key);
  }

  async set(key, value, duration) {
    promisify(this.client.setex).bind(this.client)(key, duration, value);
  }

  async del(key) {
    promisify(this.client.del).bind(this.client)(key);
  }
}

const redisClient = new RedisClient();

export default redisClient;
