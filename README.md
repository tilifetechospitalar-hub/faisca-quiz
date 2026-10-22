# Quiz Outubro Rosa · Grupo Lifetec

## Rodar no computador
    node server.js        # abre em http://localhost:3000

Os quizzes ficam em `quizzes/*.txt` (uma pergunta por linha: `pergunta | A | B | C | D | nº da correta`).

## Hospedar de graça no Render
1. Crie uma conta em https://github.com e um repositório novo (pode ser privado).
2. Envie para ele TODOS os arquivos desta pasta (`server.js`, `package.json`, `render.yaml`, `public/`, `quizzes/`).
3. Em https://render.com entre com o GitHub → **New +** → **Blueprint** → escolha o repositório → **Apply**.
   (Ou: New + → Web Service → Runtime Node → Build `echo ok` → Start `node server.js` → plano **Free**.)
4. Quando terminar, o endereço `https://quiz-outubro-rosa-xxxx.onrender.com` já funciona. O link de convite usa esse endereço automaticamente.

### Cuidados com o plano gratuito
- Após 15 min sem acesso o serviço "dorme"; o primeiro acesso leva cerca de 1 minuto. **Abra o site uns 5 minutos antes do evento.**
- O Render pode reiniciar o serviço a qualquer momento, o que encerra as salas em andamento (ficam só na memória).
- Para manter acordado antes do evento, use um monitor gratuito (ex.: UptimeRobot) apontando para `/healthz`.
- Para atualizar o quiz: edite o `.txt`, envie ao GitHub; o Render publica sozinho.

## Senha do anfitrião
Padrão: `lifetecrosa`. Para trocar sem mexer no código, no Render abra **Environment** e crie `HOST_PASSWORD` com a nova senha (recomendado se o repositório for público).
