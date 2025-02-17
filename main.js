// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const upload = require('./upload');

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
];

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

let mainWindow;
let cachedPlaylists = [];
let userName = "Carregando...";

// Verifica se o usuário está autenticado; se não, abre a janela de autenticação.
async function checkAuthentication() {
  if (!fs.existsSync(TOKEN_PATH)) {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed;
    let oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES.concat(['https://www.googleapis.com/auth/userinfo.email']),
      prompt: 'consent'
    });
    
    let authWindow = new BrowserWindow({
      width: 500,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    authWindow.loadURL(authUrl);
    
    const baseRedirect = redirect_uris[0].endsWith('/') ? redirect_uris[0] : redirect_uris[0] + '/';
    const filter = { urls: [baseRedirect + '*'] };
    
    return new Promise((resolve, reject) => {
      const { session: { webRequest } } = authWindow.webContents;
      webRequest.onBeforeRequest(filter, async (details, callback) => {
        const url = details.url;
        const parsedUrl = new URL(url);
        const code = parsedUrl.searchParams.get('code');
        if (code) {
          try {
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
            console.log('Token armazenado com sucesso.');
            authWindow.destroy();
            resolve();
          } catch (err) {
            reject(err);
          }
        }
        callback({ cancel: false });
      });
      authWindow.on('closed', () => {
        reject(new Error('Janela de autenticação fechada pelo usuário'));
      });
    });
  }
  return Promise.resolve();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Envia as informações do usuário ao renderer quando a janela terminar de carregar
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('user-info', userName);
  });
}

async function initPlaylistsAndUserInfo() {
  try {
    cachedPlaylists = await upload.getPlaylists();
    console.log('Playlists carregadas:', cachedPlaylists);
    userName = await upload.getUserInfo();
    console.log('Usuário:', userName);
  } catch (err) {
    console.error('Erro ao carregar playlists ou informações do usuário:', err);
  }
}

app.whenReady().then(async () => {
  try {
    await checkAuthentication();
    await initPlaylistsAndUserInfo();
    createWindow();
  } catch (err) {
    console.error('Erro na autenticação:', err);
    dialog.showErrorBox('Erro na Autenticação', err.message || 'Não foi possível autenticar.');
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handler para retornar as playlists carregadas
ipcMain.handle('get-playlists', async () => {
  return cachedPlaylists;
});

// Handler para selecionar diretório dos vídeos
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Handler para obter informações do usuário (nome ou e-mail)
ipcMain.handle('get-user-info', async () => {
  return userName;
});

// Handler para logout: remove o token e reinicia a aplicação para nova autenticação
ipcMain.handle('logout', async () => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
    cachedPlaylists = [];
    userName = "Carregando...";
    app.relaunch();
    app.exit();
    return true;
  } catch (err) {
    console.error("Erro no logout:", err);
    return false;
  }
});

// Handler para iniciar o upload, agora com diretório e comentário
ipcMain.handle('start-upload', async (event, options) => {
  try {
    const result = await upload.startUpload({ ...options, mainWindow });
    return result;
  } catch (err) {
    console.error('Erro no IPC start-upload:', err);
    if (err.isQuotaError) {
      dialog.showErrorBox('Limite de Quota Atingido', 
        'Sua cota diária de uploads foi atingida. Os uploads foram interrompidos.'
      );
    } else {
      dialog.showErrorBox('Erro no Upload', err.message || 'Ocorreu um erro inesperado.');
    }
    // Lança o erro para interromper os uploads
    throw err;
  }
});
