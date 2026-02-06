const { google } = require('googleapis');
require('dotenv').config();

/**
 * YouTube API設定
 */
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

module.exports = {
  youtube,
  apiKey: process.env.YOUTUBE_API_KEY
};
