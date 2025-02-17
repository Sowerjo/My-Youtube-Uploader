// upload.js
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const progressStream = require('progress-stream');
const pLimit = require('p-limit');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const PLAYLIST_CACHE_FILE = path.join(__dirname, 'playlistCache.json');
const UPLOADED_VIDEOS_CACHE_FILE = path.join(__dirname, 'uploadedVideos.json');
// Diretório padrão para uploads
const DEFAULT_UPLOAD_FOLDER = path.join(__dirname, 'UPLOAD');

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/userinfo.email'
];

const allowedExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.mkv', '.wav', '.flv', '.mpeg', '.mpg'];

let playlistCache = fs.existsSync(PLAYLIST_CACHE_FILE)
  ? JSON.parse(fs.readFileSync(PLAYLIST_CACHE_FILE, 'utf8') || '{}')
  : {};
let uploadedVideosCache = fs.existsSync(UPLOADED_VIDEOS_CACHE_FILE)
  ? JSON.parse(fs.readFileSync(UPLOADED_VIDEOS_CACHE_FILE, 'utf8') || '{}')
  : {};

function updatePlaylistCache() {
  fs.writeFileSync(PLAYLIST_CACHE_FILE, JSON.stringify(playlistCache));
}
function updateUploadedVideosCache() {
  fs.writeFileSync(UPLOADED_VIDEOS_CACHE_FILE, JSON.stringify(uploadedVideosCache));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let oAuth2Client = null;

async function initOAuthClient() {
  if (oAuth2Client) return;
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const config = credentials.installed || credentials.web;
  if (!config) {
    throw new Error('Nenhuma configuração de credenciais encontrada no credentials.json.');
  }
  const { client_id, client_secret, redirect_uris } = config;
  oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    console.log('Token carregado com sucesso.');
  } else {
    throw new Error('Token não encontrado. É necessário autenticar primeiro.');
  }
}

// Atualização: inclui "uploadLimitExceeded" na verificação de cota
function isQuotaError(error) {
  if (!error || !error.errors) return false;
  return error.errors.some(e =>
    e.reason === 'quotaExceeded' ||
    e.reason === 'dailyLimitExceeded' ||
    e.reason === 'uploadLimitExceeded'
  );
}

async function getPlaylists() {
  await initOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });
  const res = await youtube.playlists.list({
    part: ['snippet'],
    mine: true,
    maxResults: 50,
  });
  const items = res.data.items || [];
  return items.map(item => ({
    id: item.id,
    title: item.snippet.title
  }));
}

async function getOrCreatePlaylist(youtube, playlistName) {
  if (playlistCache[playlistName]) {
    console.log(`Playlist "${playlistName}" encontrada no cache.`);
    return playlistCache[playlistName];
  }
  const response = await youtube.playlists.list({
    part: ['snippet'],
    mine: true,
    maxResults: 50,
  });
  const playlists = response.data.items || [];
  let playlist = playlists.find(p => p.snippet.title === playlistName);

  if (playlist) {
    playlistCache[playlistName] = playlist.id;
    updatePlaylistCache();
    return playlist.id;
  } else {
    console.log(`Criando nova playlist: ${playlistName}`);
    const createResponse = await youtube.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: playlistName,
          description: 'Playlist automatizada (CS).',
        },
        status: {
          privacyStatus: 'unlisted',
        },
      },
    });
    const newPlaylistId = createResponse.data.id;
    playlistCache[playlistName] = newPlaylistId;
    updatePlaylistCache();
    return newPlaylistId;
  }
}

async function getUserInfo() {
  await initOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });
  const res = await youtube.channels.list({
    part: ['snippet'],
    mine: true,
  });
  if (res.data.items && res.data.items.length > 0) {
    return res.data.items[0].snippet.title;
  }
  return "Desconhecido";
}

async function startUpload({ useExisting, playlistId, newPlaylistName, videoDirectory, videoComment, mainWindow }) {
  await initOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });

  let finalPlaylistId;
  if (useExisting) {
    finalPlaylistId = playlistId;
    console.log('Usando playlist existente:', playlistId);
  } else {
    finalPlaylistId = await getOrCreatePlaylist(youtube, newPlaylistName);
  }

  const directoryToUse = videoDirectory || DEFAULT_UPLOAD_FOLDER;
  const files = fs.readdirSync(directoryToUse);
  const videoFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return allowedExtensions.includes(ext);
  });
  if (videoFiles.length === 0) {
    return { message: 'Nenhum arquivo de vídeo encontrado no diretório especificado.' };
  }

  const limit = pLimit(1);
  let results = [];
  for (const file of videoFiles) {
    if (uploadedVideosCache[file]) {
      console.log(`Arquivo ${file} já foi enviado. Pulando.`);
      results.push({ file, videoId: uploadedVideosCache[file], status: 'Pulado (já enviado)' });
      continue;
    }
    await limit(async () => {
      const filePath = path.join(directoryToUse, file);
      const title = path.basename(file, path.extname(file));
      try {
        console.log(`Enviando o vídeo: ${file}`);
        const stat = fs.statSync(filePath);
        const progStream = progressStream({ length: stat.size, time: 100 });
        progStream.on('progress', (progressData) => {
          mainWindow.webContents.send('upload-progress', {
            file,
            percentage: progressData.percentage
          });
        });
        const uploadStream = fs.createReadStream(filePath).pipe(progStream);
        const uploadResponse = await youtube.videos.insert({
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title,
              description: videoComment || 'CS',
              tags: ['CS'],
              categoryId: '22'
            },
            status: {
              privacyStatus: 'unlisted'
            }
          },
          media: {
            body: uploadStream
          }
        });
        const videoId = uploadResponse.data.id;
        console.log(`Vídeo ${file} enviado! ID: ${videoId}`);
        await youtube.playlistItems.insert({
          part: ['snippet'],
          requestBody: {
            snippet: {
              playlistId: finalPlaylistId,
              resourceId: {
                kind: 'youtube#video',
                videoId
              }
            }
          }
        });
        uploadedVideosCache[file] = videoId;
        updateUploadedVideosCache();
        results.push({ file, videoId, status: 'Sucesso' });
        mainWindow.webContents.send('upload-finished', { file, videoId });
        await delay(2000);
      } catch (err) {
        console.error(`Erro ao enviar ${file}:`, err);
        if (isQuotaError(err)) {
          const errorQuota = new Error('Limite de Quota Atingido: Os uploads foram interrompidos.');
          errorQuota.isQuotaError = true;
          throw errorQuota;
        }
        results.push({ file, error: err.message, status: 'Falha' });
      }
    });
  }
  return { message: 'Processo de upload concluído.', results };
}

module.exports = {
  getPlaylists,
  getUserInfo,
  startUpload
};
