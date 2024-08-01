import { mkdir, writeFile } from 'fs';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';
import dbClient from '../utils/db';
import { isUserAuthorized } from './AuthController';

const writeFileAsync = promisify(writeFile);
const mkdirAsync = promisify(mkdir);

export default class FilesController {
  static async postUpload(req, res) {
    const authorized = await isUserAuthorized(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = authorized.user._id;
    if (!req.body.name) {
      res.status(400).send({ error: 'Missing data' });
      return;
    }
    const { name } = req.body;
    if (!req.body.type) {
      res.status(400).send({ error: 'Missing type' });
      return;
    }
    const { type } = req.body;
    if (!req.body.data && type !== 'folder') {
      res.status(400).send({ error: 'Missing data' });
      return;
    }
    const parentId = req.body.parentId || 0;
    const isPublic = req.body.isPublic || false;
    const fileCollection = dbClient.db.collection('files');
    if (req.body.parentId) {
      const parent = await fileCollection.findOne({ _id: ObjectId(parentId) });
      if (!parent) {
        res.status(400).send({ error: 'Parent not found' });
        return;
      }
      if (parent.type !== 'folder') {
        res.status(400).send({ error: 'Parent is not a folder' });
        return;
      }
    }

    if (type === 'folder') {
      const addedFolder = await fileCollection.insertOne(
        {
          userId: ObjectId(userId),
          name,
          type,
          parentId,
        },
      );
      res.status(201).json(
        {
          id: addedFolder.insertedId,
          userId,
          name,
          type,
          isPublic,
          parentId,
        },
      );
    } else {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      await mkdirAsync(folderPath, { recursive: true });
      const buffer = Buffer.from(req.body.data, 'base64').toString() || '';
      const localPath = `${folderPath}/${uuidv4()}`;
      await writeFileAsync(localPath, buffer, { flag: 'w+' });
      const addedFile = await fileCollection.insertOne(
        {
          userId: ObjectId(userId),
          name,
          type,
          parentId: ObjectId(parentId),
          isPublic,
          localPath,
        },
      );
      res.status(201).json(
        {
          id: addedFile.insertedId,
          userId,
          name,
          type,
          isPublic,
          parentId,
        },
      );
    }
  }
}
