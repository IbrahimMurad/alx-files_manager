import dbClient from "../utils/db";
import sha1 from 'sha1';


class UsersController {
  static async postNew(req, res) {
    if (!req.body.email) {
      res.status(400).send({ error: 'Missing email' });
    }
    if (!req.body.password) {
      res.status(400).send({ error: 'Missing password' });
    }

    const email = req.body.email;
    const password = req.body.password;

    const userCollection = dbClient.db.collection('users');
    const checkUser = await userCollection.findOne({ email });
    if (checkUser) {
      res.status(400).send({ error: 'User already exists' });
    }
    const hash = sha1(password);

    let result = await userCollection.insertOne({ email, password: hash });
    const user = {
      id: result.insertedId,
      email
    };

    res.status(201).send(user);
  }
}

export default UsersController;
