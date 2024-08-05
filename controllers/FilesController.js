import { mkdir, writeFile, readFile } from 'fs';
import { Bull } from 'bull';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';
import { lookup, contentType } from 'mime-types';
import dbClient from '../utils/db';
import { isUserAuthorized } from './AuthController';

// promisify the fs functions
const writeFileAsync = promisify(writeFile);
const mkdirAsync = promisify(mkdir);
const readFileAsync = promisify(readFile);

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
  const parent = await dbClient.fileCollection.findOne({ _id: parentId });
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
    const parentId = req.body.parentId ? ObjectId(req.body.parentId) : 0;
    const isPublic = req.body.isPublic || false;

    // check if the parent exists and is a folder
    if (parentId && !await isAcceptedParentId(parentId, res)) {
      return;
    }

    if (type === 'folder') {
      const addedFolder = await dbClient.fileCollection.insertOne({
        userId: ObjectId(userId), name, type, isPublic, parentId,
      });
      res.status(201).json({
        id: addedFolder.insertedId, userId, name, type, isPublic, parentId,
      });
    } else {
      const localPath = await saveFile(name, req.body.data);
      const storedFile = await dbClient.fileCollection.insertOne({
        userId: ObjectId(userId), name, type, parentId, isPublic, localPath,
      });
      res.status(201).json({
        id: storedFile.insertedId, userId, name, type, isPublic, parentId,
      });
      if (type === 'image') {
        const fileQueue = new Bull('fileQueue');
        fileQueue.add({ userId, fileId: storedFile.insertedId });
      }
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
    const query = { _id: ObjectId(fileId), userId: ObjectId(userId) };
    const file = await dbClient.fileCollection.findOne(query);
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

  static async getFile(req, res) {
    const fileId = req.params.id;
    const file = await dbClient.fileCollection.findOne({ _id: ObjectId(fileId) });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const authorized = await isUserAuthorized(req);
    // eslint-disable-next-line max-len
    if (!file.isPublic && (!authorized || authorized.user._id.toString() !== file.userId.toString())) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (file.type === 'folder') {
      res.status(400).json({ error: 'A folder doesn\'t have content' });
      return;
    }
    try {
      const filePath = (file.type === 'image' && req.query.size) ? `${file.localPath}_${req.query.size}` : file.localPath;
      const data = await readFileAsync(filePath);
      const mimeType = contentType(lookup(file.name));
      res.setHeader('Content-Type', mimeType);
      res.status(200).send(data);
    } catch (error) {
      res.status(404).json({ error: 'Not found' });
    }
  }
}
