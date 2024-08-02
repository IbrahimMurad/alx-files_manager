import { ObjectId } from 'mongodb';
import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

async function isConnectAuthorized(req) {
  try {
    const auth = req.header('Authorization');
    if (!auth || !auth.startsWith('Basic')) {
      return false;
    }
    const userData = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    if (userData.length !== 2) {
      return false;
    }
    const email = userData[0];
    const password = userData[1];
    const user = await dbClient.userCollection.findOne({ email });
    if (!user) {
      return false;
    }
    if (user.password !== sha1(password)) {
      return false;
    }
    return user;
  } catch (error) {
    return false;
  }
}

export async function isUserAuthorized(req) {
  try {
    const token = req.header('X-Token');
    if (!token) {
      return false;
    }
    const _id = await redisClient.get(`auth_${token}`);
    if (!_id) {
      return false;
    }
    const user = await dbClient.userCollection.findOne({ _id: ObjectId(_id) });
    if (!user) {
      return false;
    }
    const authorized = { token, user };
    return authorized;
  } catch (error) {
    return false;
  }
}

export default class AuthController {
  static async getConnect(req, res) {
    const user = await isConnectAuthorized(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = uuidv4();
    const key = `auth_${token}`;
    await redisClient.set(key, user._id.toString(), 60 * 60 * 24);
    res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    const authorized = await isUserAuthorized(req);
    if (!authorized.token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await redisClient.del(`auth_${authorized.token}`);
    res.status(204).end();
  }
}
