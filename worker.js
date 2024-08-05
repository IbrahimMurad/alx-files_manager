import { imageThumbnail } from 'image-thumbnail';
import Bull from 'bull';
import { promisify } from 'util';
import { writeFile } from 'fs';
import dbClient from './utils/db';

const writeFileAsync = promisify(writeFile);

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job) => {
  if (!job.data.fieldId) {
    throw new Error('Missing fieldId');
  }
  if (!job.data.userId) {
    throw new Error('Missing userId');
  }
  const file = dbClient.fileCollection.findOne({ _id: job.data.fieldId, userId: job.data.userId });
  if (!file) {
    throw new Error('File not found');
  }
  const image500 = await imageThumbnail(file.localPath, { width: 500 });
  await writeFileAsync(`${file.localPath}_500`, image500);
  const image250 = await imageThumbnail(file.localPath, { width: 250 });
  await writeFileAsync(`${file.localPath}_250`, image250);
  const image100 = await imageThumbnail(file.localPath, { width: 100 });
  await writeFileAsync(`${file.localPath}_100`, image100);
});

const userQueue = new Bull('userQueue');

userQueue.process(async (job) => {
  if (!job.data.userId) {
    throw new Error('Missing userId');
  }
  const user = dbClient.userCollection.findOne({ _id: job.data.userId });
  if (!user) {
    throw new Error('User not found');
  }
  console.log(`Welcome ${user.email}`);
});
