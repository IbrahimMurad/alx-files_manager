import { mkdir, writeFile } from 'fs';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';
import dbClient from '../utils/db';
import { isUserAuthorized } from './AuthController';

// promisify the fs functions
const writeFileAsync = promisify(writeFile);
const mkdirAsync = promisify(mkdir);

// get the file collection
const fileCollection = dbClient.db.collection('files');

const requiredData = ['name', 'type', 'data'];

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
    if (parentId && !await isAcceptedParentId(parentId, res, fileCollection)) {
      return;
    }

    if (type === 'folder') {
      const addedFolder = await fileCollection.insertOne({
        userId: ObjectId(userId), name, type, parentId,
      });
      res.status(201).json({
        id: addedFolder.insertedId, userId, name, type, isPublic, parentId,
      });
    } else {
      const localPath = await saveFile(name, req.body.data);
      const storedFile = await fileCollection.insertOne({
        userId: ObjectId(userId), name, type, parentId: ObjectId(parentId), isPublic, localPath,
      });
      res.status(201).json({
        id: storedFile.insertedId, userId, name, type, isPublic, parentId,
      });
    }
  }
}
