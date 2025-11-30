# Estrutura de Pastas - La Casa Dark Core

## 📁 Estrutura Recomendada

```
LA CASA DARK CORE/
│
├── Backend/                          # Servidor Node.js/Express
│   ├── server.js                     # Servidor principal
│   ├── package.json                 # Dependências Node.js
│   ├── package-lock.json            # Lock de dependências
│   ├── imagefx.js                   # Integração ImageFX
│   ├── health-check.js              # Verificação de saúde
│   │
│   ├── data/                        # Dados do banco de dados
│   │   └── lacasadarkcore.db        # Banco SQLite
│   │
│   ├── temp_audio/                  # Arquivos temporários de áudio (gitignored)
│   │   └── *.mp3                    # Áudios temporários para transcrição
│   │
│   ├── node_modules/                # Dependências instaladas (gitignored)
│   │
│   ├── dashboard.html               # Dashboard principal (servido pelo Express)
│   ├── la-casa-dark-core-auth.html  # Página de autenticação
│   ├── favicon.svg                  # Ícone do site
│   │
│   └── docs/                        # Documentação técnica (opcional)
│       ├── CONFIGURACAO_YOUTUBE.md
│       ├── CONFIGURACAO_EASYPANEL_YOUTUBE.md
│       └── ...
│
├── Frontend/                         # Frontend (se separado no futuro)
│   └── (atualmente os HTMLs estão no Backend)
│
├── docs/                             # Documentação do projeto
│   ├── MELHORIAS_ESTRATEGICAS.md
│   ├── COMO_USAR_AGENTES_ROTEIRO.md
│   ├── CORRECOES_COMPLETAS.md
│   └── TESTE_TRANSCRICAO.md
│
├── .gitignore                        # Arquivos ignorados pelo Git
├── .env                              # Variáveis de ambiente (gitignored)
└── README.md                         # Documentação principal

```

## 📝 Descrição das Pastas

### Backend/
**Servidor Node.js/Express com toda a lógica do backend**

- `server.js` - Servidor principal com todas as rotas API
- `package.json` - Dependências e scripts do projeto
- `imagefx.js` - Integração com Google ImageFX API
- `health-check.js` - Endpoint de verificação de saúde

**Subpastas:**
- `data/` - Banco de dados SQLite
- `temp_audio/` - Arquivos temporários de áudio (limpos automaticamente)
- `node_modules/` - Dependências Node.js (não versionar)

**Arquivos HTML:**
- `dashboard.html` - Interface principal da aplicação
- `la-casa-dark-core-auth.html` - Página de login/registro
- `favicon.svg` - Ícone do site

### docs/
**Documentação do projeto**

- Documentação de funcionalidades
- Guias de uso
- Melhorias estratégicas
- Correções e testes

## 🔧 Arquivos Importantes

### .gitignore
Deve incluir:
```
node_modules/
*.db
.env
Backend/temp_audio/
Backend/data/*.db
logs/
temp/
```

### .env (criar se não existir)
```
PORT=5001
JWT_SECRET=seu-segredo-jwt-super-secreto-trocar-em-prod
ENCRYPTION_SECRET=abc123def456ghi789jkl012mno345pqr
NODE_ENV=development
```

## ⚠️ Problemas Atuais na Estrutura

1. **Arquivos HTML duplicados:**
   - `dashboard.html` existe na raiz E no Backend
   - `la-casa-dark-core-auth.html` existe na raiz E no Backend
   - **Solução:** Manter apenas no Backend (servidos pelo Express)

2. **Documentação espalhada:**
   - Alguns `.md` estão na raiz
   - Alguns estão no Backend
   - **Solução:** Mover para pasta `docs/` na raiz

3. **Banco de dados:**
   - `lacasadarkcore.db` está no Backend (correto)
   - Também existe em `Backend/data/` (duplicado?)
   - **Solução:** Manter apenas em `Backend/data/`

## ✅ Estrutura Ideal (Recomendada)

```
LA CASA DARK CORE/
├── Backend/
│   ├── server.js
│   ├── package.json
│   ├── dashboard.html          # Único local
│   ├── la-casa-dark-core-auth.html  # Único local
│   ├── data/
│   │   └── lacasadarkcore.db
│   ├── temp_audio/            # Criado automaticamente
│   └── node_modules/
│
├── docs/                      # Toda documentação aqui
│   ├── MELHORIAS_ESTRATEGICAS.md
│   ├── COMO_USAR_AGENTES_ROTEIRO.md
│   └── ...
│
├── .gitignore
├── .env
└── README.md
```

## 🚀 Como Organizar

1. **Mover arquivos HTML duplicados:**
   - Deletar `dashboard.html` da raiz (manter apenas no Backend)
   - Deletar `la-casa-dark-core-auth.html` da raiz (manter apenas no Backend)

2. **Organizar documentação:**
   - Criar pasta `docs/` na raiz
   - Mover todos os `.md` da raiz para `docs/`
   - Mover `.md` do Backend para `docs/` (exceto README técnico)

3. **Limpar duplicatas:**
   - Verificar se há `lacasadarkcore.db` duplicado
   - Manter apenas em `Backend/data/`

