// renderer.js
window.addEventListener('DOMContentLoaded', async () => {
  const existingPlaylistSelect = document.getElementById('existingPlaylist');
  const existingPlaylistSection = document.getElementById('existingPlaylistSection');
  const newPlaylistSection = document.getElementById('newPlaylistSection');
  const radioButtons = document.getElementsByName('playlistOption');
  const uploadForm = document.getElementById('uploadForm');
  const selectDirectoryBtn = document.getElementById('selectDirectoryBtn');
  const selectedDirectoryDisplay = document.getElementById('selectedDirectory');
  const videoCommentInput = document.getElementById('videoComment');
  const progressContainer = document.getElementById('progressContainer');
  const uploadCounterElem = document.getElementById('uploadCounter');
  const logoutBtn = document.getElementById('logoutBtn');
  const usernameElem = document.getElementById('username');

  let uploadCounter = 0;
  let currentProgressElem = null;

  // Carrega as playlists via IPC
  try {
    const playlists = await window.api.getPlaylists();
    console.log("Playlists recebidas no renderer:", playlists);
    if (playlists && playlists.length > 0) {
      playlists.forEach(pl => {
        const option = document.createElement('option');
        option.value = pl.id;
        option.textContent = pl.title;
        existingPlaylistSelect.appendChild(option);
      });
    } else {
      existingPlaylistSelect.innerHTML = '<option value="">Nenhuma playlist encontrada</option>';
    }
  } catch (err) {
    console.error("Erro ao carregar playlists:", err);
    existingPlaylistSelect.innerHTML = '<option value="">Erro ao carregar playlists</option>';
  }

  // Recebe as informações do usuário via IPC
  window.api.getUserInfo().then(userName => {
    usernameElem.textContent = "Usuário: " + userName;
  }).catch(err => {
    console.error("Erro ao obter informações do usuário:", err);
    usernameElem.textContent = "Usuário: Desconhecido";
  });

  // Evento para Logout
  logoutBtn.addEventListener('click', async () => {
    try {
      const result = await window.api.logout();
      if (result) {
        alert("Você foi desconectado. O aplicativo será reiniciado.");
      }
    } catch (err) {
      console.error("Erro no logout:", err);
    }
  });

  // Alterna entre usar playlist existente e criar nova
  radioButtons.forEach(rb => {
    rb.addEventListener('change', () => {
      if (rb.value === 'existing' && rb.checked) {
        existingPlaylistSection.style.display = 'block';
        newPlaylistSection.style.display = 'none';
      } else if (rb.value === 'new' && rb.checked) {
        existingPlaylistSection.style.display = 'none';
        newPlaylistSection.style.display = 'block';
      }
    });
  });

  // Seleciona diretório dos vídeos
  selectDirectoryBtn.addEventListener('click', async () => {
    try {
      const dir = await window.api.selectDirectory();
      if (dir) {
        selectedDirectoryDisplay.textContent = dir;
      } else {
        selectedDirectoryDisplay.textContent = "Nenhum diretório selecionado";
      }
    } catch (err) {
      console.error("Erro ao selecionar diretório:", err);
      selectedDirectoryDisplay.textContent = "Erro ao selecionar diretório";
    }
  });

  // Envio do formulário
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Limpa o container de progresso
    progressContainer.innerHTML = '';

    const selectedOption = Array.from(radioButtons).find(rb => rb.checked).value;
    const useExisting = (selectedOption === 'existing');
    const playlistId = existingPlaylistSelect.value;
    const newPlaylistName = document.getElementById('newPlaylistName').value.trim();
    const videoDirectory = selectedDirectoryDisplay.textContent !== "Nenhum diretório selecionado"
      ? selectedDirectoryDisplay.textContent
      : null;
    const videoComment = videoCommentInput.value.trim();

    try {
      const result = await window.api.startUpload({ 
        useExisting, 
        playlistId, 
        newPlaylistName,
        videoDirectory,
        videoComment
      });
      console.log("Upload finalizado:", result);
    } catch (err) {
      console.error("Erro no upload:", err);
    }
  });

  // Atualiza a barra de progresso do vídeo atual (exibe apenas a barra atual)
  window.api.onProgress((event, data) => {
    // data: { file, percentage }
    if (!currentProgressElem) {
      currentProgressElem = document.createElement('div');
      currentProgressElem.className = 'progress-item';
      currentProgressElem.innerHTML = `
        <div><strong>${data.file}</strong></div>
        <div class="progress">
          <div id="current-progress-bar" class="progress-bar"></div>
          <div id="current-progress-text" class="progress-text">0%</div>
        </div>
      `;
      progressContainer.appendChild(currentProgressElem);
    }
    const barElem = document.getElementById('current-progress-bar');
    const textElem = document.getElementById('current-progress-text');
    barElem.style.width = data.percentage + '%';
    textElem.textContent = data.percentage.toFixed(2) + '%';
  });

  // Quando um vídeo for finalizado, remove a barra atual e atualiza o contador
  window.api.onUploadFinished((event, data) => {
    if (currentProgressElem) {
      progressContainer.removeChild(currentProgressElem);
      currentProgressElem = null;
    }
    uploadCounter++;
    uploadCounterElem.textContent = `Vídeos enviados: ${uploadCounter}`;
  });
});
