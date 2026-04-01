import { z } from 'zod';

export const JuizoCNJSchema = z.object({
  tribunal: z.string().min(2, "Tribunal deve ter ao menos 2 caracteres"),
  uf: z.string().length(2, "UF deve ter exatamente 2 caracteres"),
  numero_serventia: z.string().optional(),
  nome_serventia: z.string().min(5, "Nome da serventia deve ter ao menos 5 caracteres"),
  nome_juizo: z.string().min(5, "Nome do juízo deve ter ao menos 5 caracteres"),
  juizo_100_digital: z.boolean().optional().default(false),
  data_adesao: z.string().optional(),
  codigo_origem: z.string().optional(),
  tipo_unidade: z.enum([
    "Vara", 
    "Juizado Especial", 
    "Turma Recursal", 
    "Câmara", 
    "Seção", 
    "Outro"
  ]).optional(),
  classificacao: z.string().optional(),
  unidade: z.string().optional(),
  grau: z.enum(["1º Grau", "2º Grau", "Superior"]).optional(),
  permite_peticionamento_eletronico: z.boolean().optional().default(true),
  sistema_processual: z.enum([
    "PJe",
    "PROJUDI",
    "SAJ",
    "ESAJ",
    "EPROC",
    "TUCUJURIS",
    "Outro"
  ]).optional()
}).transform(data => ({
  ...data,
  // Garantir booleans
  juizo_100_digital: Boolean(data.juizo_100_digital),
  permite_peticionamento_eletronico: data.permite_peticionamento_eletronico === undefined 
    ? true 
    : Boolean(data.permite_peticionamento_eletronico)
}));