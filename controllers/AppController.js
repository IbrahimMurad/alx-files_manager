import dbClient from "../utils/db";
import redisClient from "../utils/redis";

export default class AppController {
  static getStatus(req, res) {
    if (redisClient.isAlive() && dbClient.isAlive()) {
      res.status(200).send({ redis: true, db: true });
    }
  }

  static getStats(req, res) {
    res.status(200).send({ users: dbClient.nbUsers(), files: dbClient.nbFiles() });
  }
}
