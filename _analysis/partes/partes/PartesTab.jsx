import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, Users, Scale, Link as LinkIcon, Star, StarOff, Plus, UserPlus, Building } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserAvatar from '@/components/shared/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const ParteCardSkeleton = () => (
    <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center gap-4 bg-gradient-to-r from-muted/50 to-background">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
            </div>
        </CardHeader>
    </Card>
);

const ParteCard = ({ parte, advogados, onToggleCliente }) => {
    const queryClient = useQueryClient();
    
    const toggleClienteMutation = useMutation({
        mutationFn: async () => {
            const { data } = await base44.functions.invoke('toggleClienteParte', {
                parte_id: parte.id,
                marcar_como_cliente: !parte.eh_cliente_escritorio
            });
            return data;
        },
        onSuccess: (data) => {
            toast.success(data.message || 'Status de cliente atualizado!');
            queryClient.invalidateQueries(['processoPartes']);
            if (onToggleCliente) onToggleCliente();
        },
        onError: (error) => {
            toast.error('Erro ao atualizar: ' + error.message);
        }
    });

    const isCliente = parte.eh_cliente_escritorio || parte.client_id;
    const poloColor = parte.polo === 'ativo' ? 'text-green-600' : 'text-red-600';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-l-4" 
                  style={{ borderLeftColor: parte.polo === 'ativo' ? '#16a34a' : '#dc2626' }}>
                <CardHeader className="bg-gradient-to-r from-muted/30 to-background p-4">
                    <div className="flex items-start gap-3">
                        <div className="relative">
                            <UserAvatar user={{ full_name: parte.nome_completo }} size="md" />
                            {isCliente && (
                                <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1">
                                    <Star className="w-3 h-3 text-yellow-900 fill-yellow-900" />
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-base truncate">{parte.nome_completo}</h3>
                                    <p className={`text-xs font-medium ${poloColor} capitalize`}>
                                        {parte.tipo_participacao.replace(/_/g, ' ')}
                                    </p>
                                </div>
                                
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => toggleClienteMutation.mutate()}
                                        disabled={toggleClienteMutation.isPending}
                                    >
                                        {toggleClienteMutation.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : isCliente ? (
                                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                        ) : (
                                            <StarOff className="h-4 w-4 text-muted-foreground" />
                                        )}
                                    </Button>
                                    
                                    {parte.contact_id && (
                                        <Link to={createPageUrl(`Contatos?id=${parte.contact_id}`)}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </div>
                            
                            {parte.cpf_cnpj && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    {parte.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}: {parte.cpf_cnpj}
                                </p>
                            )}
                        </div>
                    </div>
                </CardHeader>

                {advogados.length > 0 && (
                    <CardContent className="pt-4 pb-4 bg-muted/20">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="h-px bg-border flex-1" />
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Representação
                            </span>
                            <div className="h-px bg-border flex-1" />
                        </div>
                        
                        <div className="space-y-2">
                            {advogados.map(adv => (
                                <motion.div
                                    key={adv.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center gap-3 p-2 rounded-lg bg-background/50 hover:bg-background transition-colors"
                                >
                                    <div className="h-8 w-0.5 bg-primary/30 rounded-full" />
                                    <UserAvatar user={{ full_name: adv.nome_completo }} size="sm" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{adv.nome_completo}</p>
                                        {adv.oab && (
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <Badge variant="secondary" className="text-xs py-0 px-1.5">
                                                    {adv.oab} {adv.oab_uf}
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </CardContent>
                )}
            </Card>
        </motion.div>
    );
};

export default function PartesTab({ processoId, onClienteUpdate }) {
    const { data: partes, isLoading } = useQuery({
        queryKey: ['processoPartes', processoId],
        queryFn: () => base44.entities.ProcessoParte.filter({ processo_id: processoId }),
        enabled: !!processoId,
    });

    const { polos, advogados } = useMemo(() => {
        if (!partes) return { polos: { ativo: [], passivo: [] }, advogados: new Map() };
        
        const polos = {
            ativo: partes.filter(p => p.polo === 'ativo' && p.tipo_participacao !== 'advogado'),
            passivo: partes.filter(p => p.polo === 'passivo' && p.tipo_participacao !== 'advogado'),
        };

        const advogados = new Map();
        partes.filter(p => p.tipo_participacao === 'advogado').forEach(adv => {
            if (!advogados.has(adv.parte_principal_id)) {
                advogados.set(adv.parte_principal_id, []);
            }
            advogados.get(adv.parte_principal_id).push(adv);
        });

        return { polos, advogados };
    }, [partes]);

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-2">
                <ParteCardSkeleton />
                <ParteCardSkeleton />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Botões de Ação */}
            <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    Adicionar Parte
                </Button>
                <Button size="sm" variant="outline" className="gap-2">
                    <Building className="h-4 w-4" />
                    Adicionar Advogado
                </Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Polo Ativo */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="h-1 w-12 bg-green-500 rounded-full" />
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <Scale className="h-5 w-5 text-green-500" />
                            Polo Ativo
                        </h3>
                        <Badge variant="outline" className="ml-auto">
                            {polos.ativo?.length || 0}
                        </Badge>
                    </div>
                    
                    <AnimatePresence>
                        {polos.ativo?.length > 0 ? (
                            <div className="space-y-3">
                                {polos.ativo.map(parte => (
                                    <ParteCard 
                                        key={parte.id} 
                                        parte={parte} 
                                        advogados={advogados.get(parte.id) || []}
                                        onToggleCliente={onClienteUpdate}
                                    />
                                ))}
                            </div>
                        ) : (
                            <Card className="border-dashed">
                                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                                    <Users className="h-12 w-12 text-muted-foreground/50 mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        Nenhuma parte no polo ativo
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </AnimatePresence>
                </div>

                {/* Polo Passivo */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="h-1 w-12 bg-red-500 rounded-full" />
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <Scale className="h-5 w-5 text-red-500" />
                            Polo Passivo
                        </h3>
                        <Badge variant="outline" className="ml-auto">
                            {polos.passivo?.length || 0}
                        </Badge>
                    </div>
                    
                    <AnimatePresence>
                        {polos.passivo?.length > 0 ? (
                            <div className="space-y-3">
                                {polos.passivo.map(parte => (
                                    <ParteCard 
                                        key={parte.id} 
                                        parte={parte} 
                                        advogados={advogados.get(parte.id) || []}
                                        onToggleCliente={onClienteUpdate}
                                    />
                                ))}
                            </div>
                        ) : (
                            <Card className="border-dashed">
                                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                                    <Users className="h-12 w-12 text-muted-foreground/50 mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        Nenhuma parte no polo passivo
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}