-- Migration: 006_seed_blog_posts
-- Seed inicial do blog com upsert por slug para nao duplicar em reaplicacoes

INSERT INTO public.blog_posts (
  slug,
  title,
  excerpt,
  content,
  cover_image_url,
  category,
  status,
  seo_title,
  seo_description,
  published_at,
  created_at,
  updated_at
)
VALUES
  (
    '5-sinais-de-que-voce-esta-no-limite-do-superendividamento',
    '5 Sinais de que voce esta no Limite do Superendividamento',
    'Entenda quando o endividamento deixa de ser um problema comum e passa a ser uma situacao protegida por lei.',
    'O superendividamento acontece quando a renda deixa de ser suficiente para sustentar as despesas basicas e, ao mesmo tempo, manter o pagamento regular das dividas. Nessa fase, a pessoa ja nao esta apenas apertada financeiramente: ela perde previsibilidade, acumula juros e passa a tomar decisoes de emergencia.

Um dos sinais mais claros e usar um emprestimo para pagar outro. Outro indicador frequente e comprometer o salario logo no inicio do mes, restando pouco ou nada para alimentacao, moradia e transporte. Tambem e comum recorrer repetidamente ao limite do cartao, cheque especial ou consignado como forma de sobrevivencia.

Quando esse ciclo se instala, a estrategia deixa de ser apenas renegociar valores e passa a exigir revisao de contratos, analise de abusividades e organizacao juridica do passivo. A lei do superendividamento existe exatamente para proteger o minimo existencial e permitir uma reorganizacao real.

Buscar ajuda cedo aumenta muito a chance de preservar renda, reduzir pressao e recuperar o controle. Quanto antes houver um diagnostico tecnico, menor a probabilidade de a divida se espalhar para novas linhas de credito ou gerar bloqueios mais graves.',
    'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/92604e21e_generated_image.png',
    'SUPERENDIVIDAMENTO',
    'published',
    '5 sinais de superendividamento e quando buscar ajuda juridica | Hermida Maia',
    'Veja os principais sinais de superendividamento e entenda quando procurar orientacao juridica para reorganizar suas dividas.',
    '2023-10-15T12:00:00Z',
    '2023-10-15T12:00:00Z',
    now()
  ),
  (
    'como-identificar-juros-abusivos-no-seu-contrato-de-financiamento',
    'Como identificar juros abusivos no seu contrato de financiamento',
    'Aprenda a ler as entrelinhas do seu contrato bancario e identifique taxas que podem ser contestadas judicialmente.',
    'Nem toda parcela alta significa automaticamente irregularidade, mas alguns sinais devem acender alerta. O primeiro deles e a distancia entre o custo total do contrato e a capacidade real de pagamento do consumidor. Quando o financiamento se torna estruturalmente impagavel, e preciso revisar clausulas, encargos e seguros agregados.

Outro ponto importante e comparar a taxa praticada com referencias de mercado e com a forma como o banco apresentou as condicoes. Em muitos contratos, o problema nao esta apenas na taxa nominal, mas em cobrancas adicionais, capitalizacao, tarifas embutidas e falta de transparencia sobre o custo efetivo total.

Uma leitura juridica adequada considera o contrato completo, a forma de contratacao, o historico do cliente e o comportamento da instituicao financeira. A partir disso, e possivel avaliar se a discussao deve ser negocial, administrativa ou judicial.

A revisao contratual nao depende apenas de desconforto com a parcela. Ela depende de demonstracao tecnica e estrategia correta. Por isso, a triagem inicial e decisiva para evitar medidas precipitadas e concentrar esforco onde existe chance concreta de resultado.',
    'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/eb41f4fb8_generated_image.png',
    'REVISIONAL',
    'published',
    'Como identificar juros abusivos em financiamento | Hermida Maia',
    'Entenda quais sinais podem indicar juros abusivos em contratos de financiamento e quando a revisao contratual faz sentido.',
    '2023-10-12T12:00:00Z',
    '2023-10-12T12:00:00Z',
    now()
  ),
  (
    'a-nova-lei-14181-e-seus-beneficios-para-o-consumidor-brasileiro',
    'A Nova Lei 14.181 e seus beneficios para o consumidor brasileiro',
    'Tudo o que voce precisa saber sobre a atualizacao do Codigo de Defesa do Consumidor.',
    'A Lei 14.181 fortaleceu a protecao do consumidor ao reconhecer, de forma mais clara, a realidade do superendividamento. Ela amplia o dever de informacao, desestimula praticas agressivas de oferta de credito e permite construir solucoes mais equilibradas para quem perdeu a capacidade de pagamento sem agir de ma-fe.

Na pratica, a lei reforca a ideia de minimo existencial. Isso significa que o consumidor nao pode ser empurrado para um modelo de pagamento que inviabilize a propria subsistencia. O objetivo deixa de ser apenas cobrar e passa a incluir reorganizacao viavel e preservacao da dignidade.

Para o escritorio, essa mudanca abre espaco para uma atuacao mais estrategica: diagnosticar o passivo, mapear contratos, identificar abusividades e construir um plano juridico coerente com a renda e com os objetivos do cliente.

A lei nao resolve tudo sozinha, mas melhora muito o ambiente de negociacao e o fundamento das medidas judiciais. O ganho real acontece quando o caso e conduzido com documentacao, narrativa correta e leitura tecnica das relacoes bancarias envolvidas.',
    'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/785905e76_generated_image.png',
    'LEIS',
    'published',
    'Lei 14.181 e protecao ao consumidor superendividado | Hermida Maia',
    'Saiba como a Lei 14.181 reforca a protecao do consumidor e ajuda na reorganizacao do endividamento.',
    '2023-10-08T12:00:00Z',
    '2023-10-08T12:00:00Z',
    now()
  ),
  (
    'como-organizar-suas-financas-apos-uma-renegociacao-de-dividas',
    'Como organizar suas financas apos uma renegociacao de dividas',
    'Dicas praticas para manter a saude financeira depois de conseguir a reducao das suas dividas.',
    'Renegociar ou revisar uma divida e apenas o inicio da recuperacao. O passo seguinte e reorganizar a rotina financeira para que a mesma estrutura de pressao nao se repita nos meses seguintes.

O primeiro cuidado e reconstruir o fluxo de caixa real. Isso exige separar despesas essenciais, pagamentos pactuados e gastos variaveis. Sem essa visao, a sensacao de alivio inicial pode levar a novos compromissos assumidos cedo demais.

Tambem e importante revisar habitos de credito. Se o cartao, o consignado ou o limite da conta foram gatilhos do problema, a estrategia deve incluir limites mais rigidos e uma fase de reeducacao financeira compativel com a capacidade atual da familia.

Quando ha acompanhamento juridico, essa fase pos-acordo pode ser tratada como consolidacao. O objetivo nao e apenas sair da crise, mas evitar recaidas e preservar a previsibilidade financeira daqui para frente.',
    'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/3f356e7c6_generated_image.png',
    'DICAS',
    'published',
    'Como reorganizar as financas depois de renegociar dividas | Hermida Maia',
    'Veja medidas praticas para consolidar a recuperacao financeira apos renegociacao ou revisao das dividas.',
    '2023-10-01T12:00:00Z',
    '2023-10-01T12:00:00Z',
    now()
  ),
  (
    'minimo-existencial-entenda-seus-direitos-na-lei-do-superendividamento',
    'Minimo existencial: entenda seus direitos na lei do superendividamento',
    'A lei garante que voce mantenha o minimo necessario para viver com dignidade, mesmo endividado.',
    'O minimo existencial e a parcela da renda que deve permanecer livre para assegurar a vida digna do consumidor. Em outras palavras, a pessoa pode ter dividas, mas nao pode ser empurrada para um modelo de pagamento que inviabilize moradia, alimentacao, saude, transporte e necessidades basicas.

Esse conceito mudou a forma de discutir endividamento excessivo. Antes, muitos casos eram tratados apenas como inadimplencia comum. Agora, existe um criterio juridico mais claro para diferenciar desorganizacao passageira de uma situacao estrutural que exige protecao especial.

Na pratica, a analise do minimo existencial depende de prova e contexto. Nao basta afirmar dificuldade financeira: e preciso mostrar renda, despesas essenciais, composicao familiar e o peso real das obrigacoes assumidas.

Quando bem trabalhado, esse fundamento ajuda a reequilibrar negociacoes e processos. Ele recoloca a dignidade da pessoa no centro da solucao, o que e especialmente importante em cenarios de credito consignado, cartoes e contratos sucessivos.',
    'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/9f6b9fe41_generated_image.png',
    'SUPERENDIVIDAMENTO',
    'published',
    'Minimo existencial e lei do superendividamento | Hermida Maia',
    'Entenda o conceito de minimo existencial e como ele protege a renda do consumidor superendividado.',
    '2023-09-25T12:00:00Z',
    '2023-09-25T12:00:00Z',
    now()
  ),
  (
    'financiamento-de-veiculo-quando-e-possivel-revisa-lo-judicialmente',
    'Financiamento de veiculo: quando e possivel revisa-lo judicialmente',
    'Saiba quando e como entrar com uma acao revisional para reduzir as parcelas do seu financiamento.',
    'A revisao de financiamento de veiculo faz sentido quando existem sinais tecnicos de desequilibrio contratual, cobrancas desproporcionais ou falhas relevantes de transparencia. O simples atraso no pagamento nao basta, mas contratos com custo excessivo e encargos mal apresentados merecem analise.

Em muitos casos, o cliente chega ao escritorio ja pressionado por parcelas acumuladas e risco de busca e apreensao. Nessa etapa, o tempo e a estrategia contam muito. E preciso avaliar rapidamente o contrato, o historico de pagamento e a urgencia da medida.

A revisional pode ter objetivos diferentes: reduzir encargos, discutir abusividades especificas, reorganizar a divida ou ganhar tempo processual em cenarios de pressao mais intensa. Cada caso pede um desenho proprio.

O ponto central e fugir da abordagem generica. Uma boa atuacao depende de documentacao, leitura do contrato e definicao clara do resultado desejado. Sem isso, a acao pode gerar expectativa alta e efeito pratico baixo.',
    'https://sspvizogbcyigquqycsz.supabase.co/storage/v1/object/public/Images/perfil_1.webp',
    'REVISIONAL',
    'published',
    'Revisao judicial de financiamento de veiculo | Hermida Maia',
    'Entenda quando a revisao judicial de financiamento de veiculo pode ser uma medida juridica viavel.',
    '2023-09-20T12:00:00Z',
    '2023-09-20T12:00:00Z',
    now()
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  content = EXCLUDED.content,
  cover_image_url = EXCLUDED.cover_image_url,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  seo_title = EXCLUDED.seo_title,
  seo_description = EXCLUDED.seo_description,
  published_at = EXCLUDED.published_at,
  updated_at = now();
