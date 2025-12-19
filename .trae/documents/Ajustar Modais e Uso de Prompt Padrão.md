## O que vamos ajustar

* Trocar todas as invocações de `python` por `python3` para o Whisper local.

* Remover/ocultar mensagens técnicas de instalação do Whisper que aparecem para o usuário final.

* Opcional no Dockerfile: criar alias `/usr/bin/python -> /usr/bin/python3` para máxima compatibilidade.

## Arquivos e pontos de mudança

* `Backend/server.js`:

  * `checkWhisperInstalled`: usar `python3 -c "import whisper; print('OK')"` (linhas \~16110–16118).

  * `transcribeWithWhisperLocal`: usar `python3 -m whisper ...` e logs com `python3` (linhas \~16212–16223).

  * Mensagens para usuário:

    * Em `getTranscriptWithFallback` (linhas \~16100–16103): substituir texto que menciona instalar Whisper por mensagem neutra: “Transcrição indisponível no momento. Tente novamente ou cole a transcrição manualmente.”

    * Em rota `GET /api/transcribe` (linhas \~16383–16385): remover `hint` que sugere `pip install`; usar um `hint` neutro somente quando útil (ex.: “vídeo sem fala”).

    * Em tratamento de erro (linhas \~16506–16507): substituir bloco com instruções de instalação por texto amigável sem instruções técnicas.

* `Backend/Dockerfile` e `Nova pasta/Backend/Dockerfile`:

  * Após instalação do Python, adicionar `RUN ln -sf /usr/bin/python3 /usr/bin/python` para cobrir qualquer trecho legado.

## Resultado esperado

* Método 2 (Whisper local) passa a ser encontrado e executado com `python3`.

* Usuários deixam de ver qualquer instrução de instalação de Whisper; apenas mensagens amigáveis e neutras.

* Fallback continua: legenda do YouTube → Whisper local → mensagem neutra se ambos falharem.

## Validação

* Vídeo sem legendas: logs mostram `python3 -m whisper` e transcrição concluída ou mensagem neutra se áudio não transcrevível.

* UI: o modal “Aviso” mostra apenas mensagens amigáveis, sem comandos técnicos.

## Observação

* Mantemos Dockerfile com Whisper e yt-dlp instalados; alias `python` evita regressões. Se preferir, também posso migrar para `faster-whisper` depois para mais performance em CPU.

