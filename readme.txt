Segue um passo a passo detalhado para instalar as dependências e executar o seu projeto Electron:

Instalar Node.js e npm
Certifique-se de ter o Node.js instalado (o npm vem junto). Para verificar, abra o terminal e execute:


node -v
npm -v
Clonar ou Preparar o Projeto
Se o projeto já estiver em seu repositório GitHub, clone-o com:


git clone <URL_DO_SEU_REPOSITORIO>
Caso o projeto já esteja na sua máquina, navegue até a pasta do projeto via terminal.

Instalar as Dependências
No diretório raiz do projeto (onde se encontra o arquivo package.json), execute:


npm install
Esse comando irá ler o package.json e instalar todas as dependências listadas (como googleapis, p-limit, progress-stream e o electron como dependência de desenvolvimento).

Verificar Dependências do Electron
Se você ainda não instalou o Electron globalmente (opcional), você pode instalar com:


npm install -g electron
No entanto, se o Electron está listado nas devDependencies e você usará o comando npm start (conforme configurado no package.json), não é necessário instalá-lo globalmente.

Executar o Projeto
Ainda no diretório do projeto, execute:


npm start
Esse comando iniciará o Electron e abrirá a janela da aplicação.
