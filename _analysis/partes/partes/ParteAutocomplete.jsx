import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, User, Building2, Plus } from 'lucide-react';
import { useContactsLookup } from './hooks/useContactsLookup';
import { useWorkspace } from '@/components/hooks/useWorkspace';
import { useQuery } from '@tanstack/react-query';

export default function ParteAutocomplete({ value, onChange, placeholder = "Digite nome, CPF ou email", processoId }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { workspace } = useWorkspace();
  const { data: contacts = [], isLoading: isLoadingContacts } = useContactsLookup();
  
  const { data: partes = [], isLoading: isLoadingPartes } = useQuery({
    queryKey: ['partes-lookup', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      return await base44.entities.ParteProcesso.filter({ workspace_id: workspace.id }, '-created_date', 200);
    },
    enabled: !!workspace?.id,
    staleTime: 2 * 60 * 1000,
  });

  const isLoading = isLoadingContacts || isLoadingPartes;

  // Atualizar campo de busca quando value mudar
  useEffect(() => {
    if (value?.nome) {
      setSearch(value.nome);
    }
  }, [value]);

  // Combinar e dedupllicar contatos e partes
  const allOptions = [];
  const seenNames = new Set();
  
  // Adicionar contatos primeiro
  contacts.forEach(contact => {
    if (!seenNames.has(contact.nome?.toLowerCase())) {
      allOptions.push({ ...contact, source: 'contact' });
      seenNames.add(contact.nome?.toLowerCase());
    }
  });
  
  // Adicionar partes que não estão em contatos
  partes.forEach(parte => {
    if (!seenNames.has(parte.nome?.toLowerCase())) {
      allOptions.push({ ...parte, source: 'parte' });
      seenNames.add(parte.nome?.toLowerCase());
    }
  });

  // Filtrar baseado na busca
  const filtered = allOptions.filter((item) => {
    const searchLower = search.toLowerCase();
    return (
      item.nome?.toLowerCase().includes(searchLower) ||
      item.cpf_cnpj?.includes(searchLower)
    );
  }).slice(0, 8);

  const handleSelect = (item) => {
    onChange({
      nome: item.nome,
      cpf_cnpj: item.cpf_cnpj,
      email: item.email,
      telefone: item.telefone,
      tipo_pessoa: item.tipo_pessoa,
      contact_id: item.source === 'contact' ? item.id : null,
    });
    setSearch(item.nome);
    setOpen(false);
  };

  const handleCreateNew = () => {
    onChange({
      nome: search,
      cpf_cnpj: '',
      email: '',
      telefone: '',
      tipo_pessoa: 'fisica',
      contact_id: null,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="pl-10"
          />
          {value?.contact_id && (
            <Badge className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-emerald-100 text-emerald-700">
              Vinculado
            </Badge>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandList>
            {isLoading ? (
              <div className="p-4 text-sm text-slate-500 text-center">Carregando...</div>
            ) : filtered.length > 0 ? (
              <CommandGroup heading="Partes cadastradas">
                {filtered.map((item) => (
                  <CommandItem
                    key={item.id}
                    onSelect={() => handleSelect(item)}
                    className="flex items-center gap-3 p-3 cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#00a2ff]/10 flex items-center justify-center shrink-0">
                      {item.tipo_pessoa === 'juridica' ? (
                        <Building2 className="w-4 h-4 text-[#00a2ff]" />
                      ) : (
                        <User className="w-4 h-4 text-[#00a2ff]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">
                        {item.nome}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {item.cpf_cnpj || 'Sem documento'}
                      </p>
                    </div>
                    {item.source === 'contact' && (
                      <Badge className="text-xs bg-emerald-100 text-emerald-700">Contato</Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : search ? (
              <div className="p-4">
                <CommandEmpty className="text-center">
                  <p className="text-sm text-slate-500 mb-3">Nenhum contato encontrado</p>
                  <Button
                    size="sm"
                    onClick={handleCreateNew}
                    className="bg-[#00a2ff] hover:bg-[#0088cc] text-white gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Criar "{search}"
                  </Button>
                </CommandEmpty>
              </div>
            ) : (
              <div className="p-4 text-sm text-slate-500 text-center">
                Digite para buscar contatos
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}