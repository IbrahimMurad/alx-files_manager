import { mkdir, writeFile } from 'fs';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';
import dbClient from '../utils/db';
import { isUserAuthorized } from './AuthController';

// promisify the fs functions
const writeFileAsync = promisify(writeFile);
const mkdirAsync = promisify(mkdir);

const requiredData = ['name', 'type', 'data'];
const maxItemsInPage = 20;

// handle non-existing file data
function fileDataExist(req, res) {
  for (const key of requiredData) {
    if (!req.body[key] && (key !== 'data' || req.body.type !== 'folder')) {
      res.status(400).json({ error: `Missing ${key}` });
      return false;
    }
  }
  return true;
}

// handle non-accepted parent id
async function isAcceptedParentId(parentId, res) {
  const fileCollection = dbClient.db.collection('files');
  const parent = await fileCollection.findOne({ _id: ObjectId(parentId) });
  if (!parent) {
    res.status(400).json({ error: 'Parent not found' });
    return false;
  }
  if (parent.type !== 'folder') {
    res.status(400).json({ error: 'Parent is not a folder' });
    return false;
  }
  return true;
}

async function saveFile(name, data) {
  const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
  await mkdirAsync(folderPath, { recursive: true });
  const buffer = Buffer.from(data, 'base64').toString() || '';
  const localPath = `${folderPath}/${uuidv4()}`;
  await writeFileAsync(localPath, buffer, { flag: 'w+' });
  return localPath;
}

export default class FilesController {
  static async postUpload(req, res) {
    // first check check if the user is authorized
    const authorized = await isUserAuthorized(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // check if the required data is present
    if (!fileDataExist(req, res)) {
      return;
    }

    // intialize the variables
    const userId = authorized.user._id;
    const { name, type } = req.body;
    const parentId = req.body.parentId || 0;
    const isPublic = req.body.isPublic || false;

    // check if the parent exists and is a folder
    if (parentId && !await isAcceptedParentId(parentId, res)) {
      return;
    }

    if (type === 'folder') {
      const addedFolder = await dbClient.fileCollection.insertOne({
        userId: ObjectId(userId), name, type, parentId,
      });
      res.status(201).json({
        id: addedFolder.insertedId, userId, name, type, isPublic, parentId,
      });
    } else {
      const localPath = await saveFile(name, req.body.data);
      const storedFile = await dbClient.fileCollection.insertOne({
        userId: ObjectId(userId), name, type, parentId: ObjectId(parentId), isPublic, localPath,
      });
      res.status(201).json({
        id: storedFile.insertedId, userId, name, type, isPublic, parentId,
      });
    }
  }

  static async getShow(req, res) {
    // first check check if the user is authorized
    const authorized = await isUserAuthorized(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = authorized.user._id;
    const fileId = req.params.id;
    const file = await dbClient.fileCollection.findOne(
      { _id: ObjectId(fileId), userId: ObjectId(userId) },
    );
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  static async getIndex(req, res) {
    // first check check if the user is authorized
    const authorized = await isUserAuthorized(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = authorized.user._id;

    // setting the query to get the files
    let query;
    if (!req.query.parentId) {
      query = { userId: ObjectId(userId) };
    } else {
      query = { userId: ObjectId(userId), parentId: ObjectId(req.query.parentId) };
    }

    // setting the page number to be 0 if not provided
    const page = req.query.page > -1 ? req.query.page : 0;

    // get the files paginated
    const files = await dbClient.fileCollection.aggregate([
      { $match: query },
      { $skip: page * maxItemsInPage },
      { $limit: maxItemsInPage },
    ]).toArray();

    // send the files
    const filesToSend = files.map((file) => ({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    }));
    res.status(200).json(filesToSend);
  }

  static async putPublish(req, res) {
    // first check check if the user is authorized
    const authorized = await isUserAuthorized(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = authorized.user._id;
    const fileId = req.params.id;
    const file = await dbClient.fileCollection.findOne(
      { _id: ObjectId(fileId), userId: ObjectId(userId) },
    );
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await dbClient.fileCollection.updateOne(
      { _id: ObjectId(fileId) },
      { $set: { isPublic: true } },
    );
    res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: true,
      parentId: file.parentId,
    });
  }

  static async putUnpublish(req, res) {
    // first check check if the user is authorized
    const authorized = await isUserAuthorized(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = authorized.user._id;
    const fileId = req.params.id;
    const file = await dbClient.fileCollection.findOne({ _id: ObjectId(fileId), userId: ObjectId(userId), type: 'file' });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await dbClient.fileCollection.updateOne(
      { _id: ObjectId(fileId) },
      { $set: { isPublic: false } },
    );
    res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: false,
      parentId: file.parentId,
    });
  }
}
