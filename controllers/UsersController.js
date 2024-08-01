import sha1 from 'sha1';
import dbClient from '../utils/db';
import { isUserAuthorized } from './AuthController';

export default class UsersController {
  static async postNew(req, res) {
    if (!req.body.email) {
      res.status(400).json({ error: 'Missing email' });
      return;
    }
    if (!req.body.password) {
      res.status(400).json({ error: 'Missing password' });
      return;
    }

    const { email } = req.body;
    const { password } = req.body;

    const userCollection = dbClient.db.collection('users');
    const checkUser = await userCollection.findOne({ email });
    if (checkUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }
    const hash = sha1(password);

    const result = await userCollection.insertOne({ email, password: hash });
    const user = {
      id: result.insertedId,
      email,
    };

    res.status(201).json(user);
  }

  static async getMe(req, res) {
    const authorized = await isUserAuthorized(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.status(200).json({ id: authorized.user._id, email: authorized.user.email });
  }
}
