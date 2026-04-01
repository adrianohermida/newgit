import { z } from 'zod';

export const ServentiaCNJSchema = z.object({
  tribunal: z.string().min(2, "Tribunal deve ter ao menos 2 caracteres"),
  uf: z.string().length(2, "UF deve ter exatamente 2 caracteres"),
  municipio: z.string().min(3, "Município deve ter ao menos 3 caracteres"),
  codigo_municipio_ibge: z.string().optional(),
  numero_serventia: z.string().optional(),
  nome_serventia: z.string().min(5, "Nome da serventia deve ter ao menos 5 caracteres"),
  tipo_orgao: z.enum(["Vara", "Juizado", "Turma", "Câmara", "Cartório", "Outro"]).optional(),
  competencia: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  endereco: z.string().optional(),
  cep: z.string().optional(),
  geolocalizacao: z.string().optional(),
  horario_funcionamento: z.string().optional(),
  ativa: z.boolean().optional().default(true)
}).transform(data => ({
  ...data,
  // Normalizar campos vazios
  email: data.email === "" ? undefined : data.email,
  // Garantir boolean
  ativa: data.ativa === undefined ? true : Boolean(data.ativa)
}));