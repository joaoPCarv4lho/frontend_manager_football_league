# ⚽ Gestão da Liga de Futebol

Frontend em HTML/CSS/JS puro (sem build) para gestão de liga amadora, **mobile-first**, com dados salvos no navegador (`localStorage`) e backup em JSON.

## Funcionalidades

- **Navegação por abas** (Financeiro · Membros · Partidas · Relatórios) com barra inferior.
- **Financeiro mensal**: receitas e custos, com o mês novo já pré-preenchido pelos valores do mês anterior.
- **Mensalidade automática**: valor fixo por jogador; o total do mês é calculado por quem pagou, com histórico de pagamento por mês.
- **Membros**: cadastro com posição e camisa padrão; toque num jogador para abrir o **perfil** (jogos, gols, assistências, vitórias/derrotas, pagamentos).
- **Partidas**: registro rápido de quem jogou, com **editar/excluir** e recálculo automático dos scouts.
- **Sorteio de times**: 2 times equilibrados por posição e nível (scouts), a partir dos presentes, gravados na partida.
- **Scouts derivados das partidas** (fonte única de verdade) — sem dupla contagem.
- **Relatórios** com gráficos (Chart.js): saldo acumulado e top scouts, além de ranking e premiações.
- **Configurações** (engrenagem): valor da mensalidade, saldo do ano passado, exportar/importar JSON e resetar dados.

## Executar

Abra `index.html` no navegador (ou sirva a pasta com qualquer servidor estático). Requer conexão para carregar o Chart.js via CDN.
