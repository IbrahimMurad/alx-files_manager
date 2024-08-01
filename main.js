import dbClient from './utils/db';

const userCollection = dbClient.db.collection('users');
const checkUser = await userCollection.findOne();
