## Objetivo
- Adicionar, em cada variação, um botão "Editar Imagem" para remover ou suavizar textos indesejados diretamente no navegador.

## Implementação
- Frontend (dashboard.html):
  - Inserir botão "Editar Imagem" ao lado do "Baixar Imagem" em cada card de variação.
  - Criar modal de editor contendo um canvas que carrega a imagem da variação.
  - Ferramentas:
    - Faixa escura (preencher retângulo com transparência para ocultar texto).
    - Desfoque (aplicar blur somente na seleção via `ctx.filter='blur(...)'`).
  - Ações: Salvar (download em PNG), Cancelar (fechar modal). Opcionalmente atualizar a imagem do card com a versão editada.

## Fluxo
1. Usuário clica em "Editar Imagem".
2. Modal abre com a imagem; o usuário arrasta para marcar a área com texto.
3. Aplica faixa escura ou blur na seleção.
4. Clica em "Salvar" para baixar a imagem editada.

## Validação
- Testar em Chrome/Edge/Firefox.
- Confirmar que múltiplas seleções podem ser aplicadas antes de salvar.
- Garantir que o editor não impacta demais o layout.

## Impacto
- Somente frontend; sem mudança no backend.